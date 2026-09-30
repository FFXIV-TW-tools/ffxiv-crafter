// app-storage.js — 本地保存協調層（classic script，發佈 globalThis.CraftStorage；必須早於所有分層檔載入）。
//
// 【為什麼要有這層】（健檢 2026-09-30 M1／B041）七個 `ffxiv-crafter-*-v1` 保存點原本都是「記憶體整包 → setItem」：
//   兩個分頁各自持有舊快照時，後保存的一方會把另一方已存好的變更整包蓋掉，重整後才發現不見——畫面全程正常＝零訊號。
//   修法：每次保存只帶**一個操作**（角色數值＝job.field、製造清單＝次數 ±delta…），提交當下才 fresh read、
//   套這一個操作、寫回。別的分頁改過的其他欄位因此不會被舊快照覆蓋。**不維護永久 log、不 diff 整份舊物件。**
//
// 【提交路徑】
//   - 有 Web Locks：每個 key 一把 exclusive lock；callback 內**同步**完成 fresh read → 各層既有 normalize → apply → setItem，
//     持鎖期間不 await（Web Locks 是同源跨分頁／跨 process 的互斥）。
//   - 無 Web Locks（SIMD 門檻下只剩 Firefox 89–95）：同一個 task 內同步 fresh read → apply → write。operation merge
//     仍擋得住「舊快照整包覆寫」，但兩個 process 在 read 與 write 之間交錯的**殘餘視窗仍在，不宣稱互斥**；
//     也不拿 BroadcastChannel／localStorage lease 冒充 mutex。
//   - `pagehide`／`visibilitychange: hidden`：還在等鎖的操作改走上面的同步路徑立刻寫入（關分頁前改的數量不能丟）；
//     這一刻繞過鎖，殘餘視窗同上。
// 【別分頁的變更】`storage` 事件 → fresh read → 在新值上**重套本分頁未保存／仍在排隊的操作** → 交給訂閱者局部刷新。
//   刷新永不回寫（訂閱者只更新 model 與畫面）。
// 【保存失敗】getItem／setItem 例外（無痕、封鎖儲存、配額滿）或鎖請求被拒：操作留在本分頁的「未保存」清單繼續生效
//   （同舊行為：本次瀏覽有效、各層一次性提示重整後會遺失）；下次成功寫入時一併落盤並清空。讀取失敗時不寫
//   （沒有 fresh read 就不覆寫保存值）。清單依 op.field 合併：同欄 set／delete／member 只留最後一個，delta 照點擊累積。
// 【同欄衝突】set／delete 類操作在提交時，若該欄的保存值已與本分頁的基線（最近一次同步到的值）不同
//   ＝別處改過 → 最後提交者勝，並 warn「其他分頁也修改了這個欄位，已採用最後儲存的值」。delta／集合成員不比對（本來就該累加）。
//   未落盤的 set／delete 同樣保留原始基線；恢復保存前對 fresh 保存值檢查，一次 commit 最多發一次衝突提示。
// 【遠端】portal 雲端設定（pull／reset／import）不讀寫這七個 key，本層沒有遠端路徑。日後若加遠端 adapter，
//   套用遠端值也**必須**走本檔的 update()（保留在途的本地操作、同樣吃衝突提示），不得直接整包 setItem。
(function () {
  const CONFLICT_MESSAGE = '其他分頁也修改了這個欄位，已採用最後儲存的值';
  const LOCK_PREFIX = 'ffxiv-crafter-storage:';
  const REJECT = Symbol('CraftStorage.reject');
  const CHECKED_KINDS = new Set(['set', 'delete']);   // 會做同欄衝突比對的操作種類；'delta'／'member' 不比對
  const codecs = new Map();      // key → { parse(raw) → model, serialize(model) → string }（parse 須為 total：壞值自行 warn 後回預設）
  const snapshots = new Map();   // key → 本分頁最近一次同步到的保存值（正規化後字串；載入／本分頁提交／他分頁事件時更新）
  const queues = new Map();      // key → 等鎖中的提交 [{ key, op, baseline, state, resolve }]（提交順序＝請求順序）
  const unsaved = new Map();     // key → 寫入失敗但本分頁仍生效的 [{ op, baseline }]（依 field 合併；成功寫入即清空）
  const subscribers = new Map(); // key → Set<fn(model)>
  let notifyToast = null;        // app.js init 注入的 toast（CDN 未載時有 alert 退場）

  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const isRejected = (v) => !!(v && typeof v === 'object' && hasOwn(v, REJECT));
  const readField = (op, model) => (typeof op.read === 'function' ? op.read(model) : undefined);

  function codecOf(key) {
    const codec = codecs.get(key);
    if (!codec) throw new Error(`CraftStorage：${key} 尚未 open（各層須先在載入時 open 再保存）`);
    return codec;
  }

  function notify(message) {
    if (notifyToast) { notifyToast(message, 'warn'); return; }
    if (globalThis.FFXIVToast && globalThis.FFXIVToast.show) { globalThis.FFXIVToast.show(message, 'warn'); return; }
    console.warn('[crafter] ' + message);
  }

  /** 註冊 key 的 codec 並同步讀回保存值（各層 init／load 用；first-run-hint.js 的解析期唯讀不經本層）。 */
  function open(key, codec) {
    const c = { parse: codec.parse, serialize: codec.serialize || ((model) => JSON.stringify(model)) };
    codecs.set(key, c);
    let raw = null;
    try { raw = localStorage.getItem(key); }
    catch (e) { console.warn(`[crafter] 本地保存讀取失敗（${key}），用預設值:`, e); }
    const model = c.parse(raw);
    snapshots.set(key, c.serialize(model));
    return model;
  }

  // 在 model 上依序重套本分頁未保存的操作（重套時被拒的略過，例：專家之證已被別處補滿）。
  function replayUnsaved(key, model) {
    for (const { op } of unsaved.get(key) || []) {
      try {
        const next = op.apply(model);
        if (!isRejected(next)) model = next;
      } catch (e) { console.warn(`[crafter] 重套未保存的操作失敗（${key}）:`, e); }
    }
    return model;
  }

  /** 本分頁的有效值＝最近同步到的保存值＋未保存的操作＋仍在排隊的操作（被拒的不算）。每次回傳新物件。 */
  function view(key) {
    const codec = codecOf(key);
    let model = replayUnsaved(key, codec.parse(snapshots.has(key) ? snapshots.get(key) : null));
    for (const entry of queues.get(key) || []) {
      if (entry.state !== 'waiting') continue;
      try {
        const next = entry.op.apply(model);
        if (!isRejected(next)) model = next;
      } catch (e) { console.warn(`[crafter] 重套排隊中的保存操作失敗（${key}）:`, e); }
    }
    return model;
  }

  function settle(entry, result) {
    if (entry.state === 'done') return;
    entry.state = 'done';
    const queue = queues.get(entry.key);
    const at = queue ? queue.indexOf(entry) : -1;
    if (at >= 0) queue.splice(at, 1);
    if (typeof entry.op.onResult === 'function') {
      try { entry.op.onResult(result); }
      catch (e) { console.error(`[crafter] 保存完成後的畫面更新失敗（${entry.key}）:`, e); }
    }
    if (result.conflict) {
      try { notify(CONFLICT_MESSAGE); }
      catch (e) { console.error('[crafter] 保存衝突提示失敗:', e); }
    }
    entry.resolve(result);
  }

  // 保存失敗但操作要在本分頁繼續生效：記進未保存清單（同欄非 delta 操作取代舊的）再結算。
  function keepUnsaved(entry, result) {
    entry.state = 'settling';
    const { field, kind } = entry.op;
    const previous = unsaved.get(entry.key) || [];
    const first = field == null ? null : previous.find((saved) => saved.op.field === field && CHECKED_KINDS.has(saved.op.kind));
    const kept = previous.filter((saved) => field == null || kind === 'delta' || saved.op.field !== field);
    // 同欄重複失敗只替換操作，不把自己尚未落盤的值當成新的保存基線。
    kept.push({ op: entry.op, baseline: first && CHECKED_KINDS.has(kind) ? first.baseline : entry.baseline });
    unsaved.set(entry.key, kept);
    settle(entry, result);
  }

  // 鎖內（或無鎖 fallback）同步提交：fresh read → normalize → 重套未保存 → 套這一個操作 → setItem。全程不 await。
  function commit(entry) {
    if (entry.state !== 'waiting') return;
    const { key, op } = entry;
    const codec = codecOf(key);
    let stored, readError = null;
    try { stored = localStorage.getItem(key); }
    catch (e) { readError = e; stored = snapshots.has(key) ? snapshots.get(key) : null; }
    let before, next, retainedConflict = false;
    try {
      const storedModel = codec.parse(stored);
      if (!readError) retainedConflict = (unsaved.get(key) || []).some(({ op: savedOp, baseline }) =>
        CHECKED_KINDS.has(savedOp.kind) && !same(readField(savedOp, storedModel), baseline));
      const fresh = replayUnsaved(key, storedModel);
      before = readField(op, fresh);
      next = op.apply(fresh);
    } catch (error) {
      settle(entry, { ok: false, rejected: false, error });
      return;
    }
    if (!readError) snapshots.set(key, codec.serialize(codec.parse(stored)));   // 同步到的保存值（不含未保存操作）
    if (isRejected(next)) {
      // 鎖內重檢不過（例：專家之證已被別的分頁補到上限）→ 不寫；本分頁已同步到 fresh 值
      settle(entry, { ok: false, rejected: true, reason: next[REJECT], before, after: before });
      return;
    }
    const after = readField(op, next);
    if (readError) { keepUnsaved(entry, { ok: false, rejected: false, error: readError, value: next, before, after }); return; }
    const raw = codec.serialize(next);
    try { localStorage.setItem(key, raw); }
    catch (error) { keepUnsaved(entry, { ok: false, rejected: false, error, value: next, before, after }); return; }
    snapshots.set(key, raw);
    unsaved.delete(key);   // 這次寫入已含先前未保存的操作
    settle(entry, { ok: true, value: next, before, after,
      conflict: retainedConflict || (CHECKED_KINDS.has(op.kind) && !same(before, entry.baseline)) });
  }

  /**
   * 提交一個操作。op＝{ kind: 'set'|'delete'|'delta'|'member', apply(model) → model | CraftStorage.reject(reason),
   *   read?(model) → 該欄值（set／delete 必填：衝突比對；其他種類給了就回報 before／after），
   *   field?（未保存清單的欄位識別，用於合併重複 set／delete／member），
   *   baseline?（省略＝本分頁目前的有效值；畫面刻意保留舊值的欄位才自帶），onResult?(result)（提交當下同步呼叫） }。
   * apply 會拿到 fresh 解析出的新物件，可就地修改後回傳；要拒絕時必須**在修改前**回傳 reject。
   * 回傳 Promise<result>，永不 reject：{ ok: true, value, before, after, conflict } ／
   *   { ok: false, rejected: true, reason, before, after: before } ／ { ok: false, rejected: false, error, value?, before?, after? }。
   * 保存失敗仍保留本分頁有效值；之後成功提交會一併保存未落盤的操作。
   */
  function update(key, op) {
    codecOf(key);
    const entry = { key, op, state: 'waiting', resolve: null,
      baseline: hasOwn(op, 'baseline') ? op.baseline : (CHECKED_KINDS.has(op.kind) ? readField(op, view(key)) : undefined) };
    const promise = new Promise((resolve) => { entry.resolve = resolve; });
    const locks = globalThis.navigator && globalThis.navigator.locks;
    if (!locks || typeof locks.request !== 'function') { commit(entry); return promise; }
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key).push(entry);
    const fail = (error) => {
      if (entry.state !== 'waiting') return;   // 離頁 flush 已結算：晚到的 rejection 不得重套一次
      console.warn(`[crafter] 保存鎖請求失敗（${key}）:`, error);
      entry.state = 'settling';   // 不再當作等鎖操作重套，避免自己的 delta 套兩遍
      try {
        const model = replayUnsaved(key, codecOf(key).parse(snapshots.get(key) ?? null));
        const before = readField(op, model), next = op.apply(model);
        if (isRejected(next)) settle(entry, { ok: false, rejected: true, reason: next[REJECT], before, after: before });
        else keepUnsaved(entry, { ok: false, rejected: false, error, value: next, before, after: readField(op, next) });
      } catch (applyError) { settle(entry, { ok: false, rejected: false, error: applyError }); }
    };
    try {
      Promise.resolve(locks.request(LOCK_PREFIX + key, { mode: 'exclusive' }, () => { commit(entry); })).catch(fail);
    } catch (error) { fail(error); }
    return promise;
  }

  /** 訂閱別分頁對 key 的變更：fn(本分頁有效值)。只用來刷新 model 與畫面，不得在裡面保存。 */
  function subscribe(key, fn) {
    if (!subscribers.has(key)) subscribers.set(key, new Set());
    subscribers.get(key).add(fn);
    return () => { subscribers.get(key).delete(fn); };
  }

  function refresh(key) {
    const fns = subscribers.get(key);
    if (!fns || !fns.size || !codecs.has(key)) return;
    const codec = codecs.get(key);
    let raw;
    try { raw = localStorage.getItem(key); }
    catch (e) { console.warn(`[crafter] 讀取其他分頁的保存變更失敗（${key}）:`, e); return; }
    snapshots.set(key, codec.serialize(codec.parse(raw)));
    for (const fn of [...fns]) {
      try { fn(view(key)); }
      catch (e) { console.error(`[crafter] 套用其他分頁的保存變更失敗（${key}）:`, e); }
    }
  }

  function onStorage(e) {
    let area;
    try { area = globalThis.localStorage; }
    catch (err) { console.warn('[crafter] 無法存取 localStorage，略過其他分頁的變更通知:', err); return; }
    if (e && e.storageArea && e.storageArea !== area) return;   // sessionStorage 等別的儲存區
    const keys = e && e.key != null ? [e.key] : [...subscribers.keys()];   // key＝null：別處呼叫了 clear()
    for (const key of keys) refresh(key);
  }

  // 分頁要被收起／關掉：等鎖中的操作改走同步路徑寫入（鎖可能還在別的分頁手上，關掉就來不及了）
  function flushPending() {
    for (const queue of queues.values()) for (const entry of [...queue]) commit(entry);
  }

  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('storage', onStorage);
    globalThis.addEventListener('pagehide', flushPending);
  }
  if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushPending(); });
  }

  globalThis.CraftStorage = {
    init(d) { notifyToast = d && typeof d.toast === 'function' ? d.toast : null; },
    open, view, update, subscribe,
    reject: (reason) => ({ [REJECT]: reason }),
    CONFLICT_MESSAGE,
  };
})();

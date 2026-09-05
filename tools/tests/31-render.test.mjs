// tools/tests/31-render.test.mjs — 資料載入降級（T41／T42）／結果渲染接線（T39）／最低能力門檻（T60／T61）
// 由 tools/test-formulas.mjs 依檔名序 import 跑；斷言計數器與共用 fixture 都在 ./_harness.mjs。
import { fs, vm, path, ROOT, APP_SRC, GEAR_SRC, FORMULA_SRC, DATA_SRC, RECIPE_SRC, LAYER_STUBS, sandbox, T, check, eq, gear } from './_harness.mjs';

// ===== T41：資料載入的降級分級（哪些載不到可以摸摸鼻子、哪些必須講出來）=====
// 由來（健檢 2026-08-15 resilience A1）：level-sync.json 原本與食藥／品質階段一樣被歸為「選配」，
// 失敗只 console.warn 就回空物件。但空物件＝「這個配方不會依等級同步」⇒ 宇宙探索配方沿用 rlv 690，
// Lv70 玩家拿到六倍難度、求解回「做不到」，而畫面一切正常 —— 正是 B-016 修掉的那個病從另一條路回來。
{
  const GEAR_SRC2 = GEAR_SRC, RECIPE_SRC2 = RECIPE_SRC;   // 只是讓下面的載入順序讀起來明確
  const mkLoadCtx = (failUrls, pendingForever = false) => {
    const toasts = [];
    const stub = () => ({ innerHTML: '', textContent: '', value: '', hidden: true, disabled: false, dataset: {},
      classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, getAttribute() { return null; },
      addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; }, focus() {}, scrollIntoView() {} });
    const els = {};
    // 分頁按鈕：T42 要驗「資料還沒回來時它們就已經能按」
    const tabs = ['solve', 'stats', 'list', 'quests'].map((t) => ({
      dataset: { tab: t }, classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
      setAttribute() {}, focus() {}, tabIndex: -1, onclick: null, onkeydown: null }));
    const DATA = {
      'data/recipes.json': [], 'data/recipe_levels.json': {}, 'data/craft-actions.json': {},
      'data/items.json': {}, 'data/ingredients.json': {}, 'data/meals.json': [], 'data/medicine.json': [],
      'data/quality-stages.json': {}, 'data/level-sync.json': { 2: 100 }, 'data/job-quests.json': [], 'data/vendors.json': {},
    };
    const ctx = {
      ...LAYER_STUBS(),
      console: { log() {}, warn() {}, error() {} },
      document: { getElementById: (id) => els[id] || (els[id] = stub()), querySelector() { return null; },
        querySelectorAll: (sel) => (sel === '#main-tabs .codex-tab' ? tabs : []), body: stub() },
      location: { hostname: 'localhost', search: '' },
      window: { FFXIVToast: { show: (m, v) => toasts.push([m, v]) } },
      localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
      Worker: function () {}, setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams,
      AbortSignal: { timeout: () => null },
      fetch: (url) => pendingForever ? new Promise(() => {})     // 慢網路：資料永遠不回來
        : failUrls.includes(url)
          ? Promise.reject(new Error('test: 這一支故意壞掉'))
          : Promise.resolve({ ok: true, json: () => Promise.resolve(DATA[url]) }),
      CraftFlow: { setTargetMode() {}, update() {} },
      CraftSolve: { init() {}, newWorker() {}, invalidateInFlight() { return false; } },
      CraftConsumable: { init() {}, setData() {}, label() { return ''; }, get() { return { food: null, potion: null }; } },
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(GEAR_SRC2, ctx, { filename: 'app-gear-t41.js' });
    vm.runInContext(RECIPE_SRC2, ctx, { filename: 'app-recipe-t41.js' });
    vm.runInContext(FORMULA_SRC, ctx, { filename: 'app-formula-t41.js' });
    vm.runInContext(DATA_SRC, ctx, { filename: 'app-data-t41.js' });
    vm.runInContext(APP_SRC, ctx, { filename: 'crafter-app-t41.js' });
    return { ctx, toasts, tabs };
  };
  const warned = (toasts, re) => toasts.filter(([m, v]) => re.test(m) && v === 'warn').length;
  // app.js 的 init 自己也會跑一次 loadData → 先讓它跑完再清空，否則數到的是兩輪的總和
  const run = async (failUrls) => {
    const c = mkLoadCtx(failUrls);
    await new Promise((r) => setTimeout(r, 0));
    c.toasts.length = 0;
    await c.ctx.loadData();
    return c.toasts;
  };

  eq('T41 全部載得到 → 不對玩家發任何警告', warned(await run([]), /./), 0);
  eq('T41 等級同步載不到 → 必須告訴玩家數字可能不對（不能只寫 console）',
    warned(await run(['data/level-sync.json']), /等級同步/), 1);
  // 對照組：這幾份載不到是真的「摸摸鼻子」——少一份加成／少一個快捷，數字不會錯
  eq('T41 食藥／品質階段載不到 → 靜靜降級即可，不打擾玩家',
    warned(await run(['data/meals.json', 'data/medicine.json', 'data/quality-stages.json']), /./), 0);
  // app.js 側：meals 失敗要把 null 交給 setData（給 [] 會被當品項下架而清掉偏好；健檢 R5 M3）
  {
    const c = mkLoadCtx(['data/meals.json']);
    await new Promise((r) => setTimeout(r, 0));
    let last = null;
    c.ctx.CraftConsumable.setData = (m, d) => { last = [m, d]; };
    await c.ctx.loadData();
    check('T41 meals 載入失敗 → setData 收到 null（不是空陣列）', last && last[0] === null && Array.isArray(last[1]), JSON.stringify(last));
  }

  // ===== T42：資料還在載的時候，分頁按鈕就要能按 =====
  // 由來（健檢 2026-08-15 ux-flows A2）：分頁的事件綁定原本排在 `await loadData()` **之後**，
  // 而首次使用提示（updateHint，在 await 之前就顯示）正指著那幾顆按鈕叫玩家去填角色數值。
  // 手機或慢網路上那段是好幾秒 —— 玩家照著提示點，什麼都沒發生，而且沒有任何訊號說「還在載」。
  {
    const pending = mkLoadCtx([], true);
    await new Promise((r) => setTimeout(r, 0));   // init 已跑到 `await loadData()` 並停在那裡
    check('T42 資料尚未載完 → 分頁按鈕已經可以點（不是死的）',
      typeof pending.tabs[0].onclick === 'function' && typeof pending.tabs[3].onclick === 'function');
    check('T42 資料尚未載完 → 分頁鍵盤導覽也已接上', typeof pending.tabs[0].onkeydown === 'function');
    // 真的能切：點「角色數值」要把該面板顯示出來（首次使用提示指的就是它）
    pending.tabs[1].onclick();
    eq('T42 載入中點「角色數值」→ 面板真的切過去', pending.ctx.document.getElementById('tab-stats').hidden, false);
    // 首次提示那顆「前往角色數值 →」與它指向的面板同樣要在 await 前就緒（健檢 2026-09-05 ux-flows A1 ＝ M18）
    check('T42 資料尚未載完 → 「前往角色數值 →」已綁定（不是死鈕）',
      typeof pending.ctx.document.getElementById('goto-stats-hint').onclick === 'function');
    check('T42 資料尚未載完 → 角色數值面板已有輸入格（不是全空）',
      /gear-in/.test(pending.ctx.document.getElementById('gearsets').innerHTML));
  }
}

// ===== T39：結果渲染的接線（本 repo 最靠近玩家的一段，先前零覆蓋）=====
// 由來（健檢 2026-08-15 tests/ux-flows）：`shortfallHtml` 與 `hqPercent` 是純函式、早有 golden，
// 但**沒有任何測試跑過 render() 本身** ⇒ AGENTS 明訂的兩條鐵則（expert 中性措辭、未達標必須講出來）
// 可以整段刪掉而 334 條全綠；巨集組裝（遊戲 15 行硬上限、超過要切段並補 /echo）也一條都沒有。
{
  const R = sandbox.CraftRender;
  const $r = (id) => sandbox.document.getElementById(id);
  const b64url = (s) => Buffer.from(s, 'utf8').toString('base64url');   // 瀏覽器版用 btoa，vm 沒有 → 測試側等價實作
  let sel = { recipe: { item_id: 42, item_name: '測試成品', is_expert: false, job: '木工' } };
  const RDEPS = {
    $: $r, esc: T.esc, iconUrl: (p) => p, b64urlEncode: b64url, copyText() {},
    MACRO_BUILDER_BASE: 'https://macro.example/', PH_HTML: '',
    getSelected: () => sel, getItems: () => ({ 42: { can_be_hq: false } }),
    // 用真的 craft-actions.json：順帶守住「render 取的欄位名」與資料的鍵形狀（nameTc / PascalCase）
    getActions: () => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/craft-actions.json'), 'utf8')),
  };
  R.init(RDEPS);
  const mkResult = (steps, over = {}) => ({
    complete: true, error: null, error_step: 0,
    final_progress: 100, max_progress: 100, final_quality: 500, max_quality: 1000,
    step_count: steps, total_time: steps * 3,
    steps: Array.from({ length: steps }, () => ({ action: 'BasicSynthesis', time: 3, progress: 1, quality: 1, durability: 1, cp: 1 })),
    ...over,
  });
  const summary = () => $r('result-summary').innerHTML;
  const macro = () => $r('macro').innerHTML;

  // (a) NQ 模式的假警告：切到「只求完成（NQ）」時目標品質欄被停用但**值還在**，
  //     render 直接讀 .value ⇒ 玩家沒設目標卻被警告「未達目標品質 900」。
  //     shortfallHtml 的註解自己寫著「NQ 模式 ⇒ 不警告」——壞的是接線不是那支純函式。
  $r('opt-target').value = '900';
  $r('opt-target').disabled = true;
  R.render(mkResult(3), false);
  check('T39 NQ 模式（目標品質欄停用）→ 不得出現未達目標警語', !/未達目標品質/.test(summary()), summary().slice(0, 120));
  $r('opt-target').disabled = false;
  R.render(mkResult(3), false);
  check('T39 一般模式且未達目標 → 必須講出來', /未達目標品質 900/.test(summary()));
  $r('opt-target').value = '';
  R.render(mkResult(3), false);
  check('T39 目標留空（＝滿品質）→ 不警告', !/未達目標品質/.test(summary()));

  // (b) expert 配方一律中性措辭（AGENTS 鐵則：勿改回無條件「✓ 可完成」金徽）
  R.render(mkResult(3), false);
  check('T39 一般配方且可完成 → 綠色「✓ 可完成」', /codex-badge--success[^>]*>✓ 可完成/.test(summary()));
  sel = { recipe: { ...sel.recipe, is_expert: true } };
  R.render(mkResult(3), false);
  check('T39 高難度配方 → 中性「試算完成 ⚠」而非成功徽章', /試算完成 ⚠/.test(summary()) && !/codex-badge--success/.test(summary()));
  check('T39 高難度配方 → 必附「僅供參考、無法保證」警語', /靜態巨集僅供參考/.test(summary()));
  sel = { recipe: { ...sel.recipe, is_expert: false } };
  R.render(mkResult(3, { complete: false }), false);
  check('T39 未完成 → 紅色「✗ 未完成」', /codex-badge--danger[^>]*>✗ 未完成/.test(summary()));

  // (c) 巨集組裝：遊戲的巨集一格上限 15 行，開提示音時最後一行留給帶音效的 /echo（Owner 2026-08-16）
  //     ⇒ 單段容量是 14 步。切錯的後果是玩家貼進遊戲少做最後幾步，而站上一切正常。
  //     例外（Owner 2026-08-16 第二輪）：剩下剛好 15 步的末段整段塞滿、不補 echo——
  //     為一行提示音多切一段（15 步 → 14+1）等於多一格巨集、多按一次，代價遠大於少一聲。
  const macroLineCounts = () => (macro().match(/（(\d+) 行）/g) || []).map(s => +s.replace(/\D/g, ''));
  const echoBox = $r('macro-echo');
  echoBox.checked = true;
  R.render(mkResult(14), false);
  check('T39 14 步 → 單一巨集、不切段', /巨集 1 \/ 1（15 行）/.test(macro()));
  check('T39 巨集行格式＝/ac "技能" <wait.秒>', macro().includes('/ac &quot;製作&quot; &lt;wait.3&gt;'));
  // 單段也要有完成提示音——沒有的話玩家得盯著畫面才知道跑完了（這正是本次需求）
  check('T39 單段結尾＝帶音效的「製作完成」', /\/echo 製作完成 &lt;se\.1&gt;/.test(macro()));
  R.render(mkResult(15), false);
  check('T39 15 步 → 塞得下一格，不得為了 echo 切成兩段', /巨集 1 \/ 1（15 行）/.test(macro()));
  check('T39 15 步 → 該段沒有 echo（15 行全是步驟）', !/\/echo/.test(macro()));
  R.render(mkResult(29), false);
  check('T39 29 步 → 14 + 15：中段有 echo、末段塞滿無 echo',
    /巨集 1 \/ 2（15 行）/.test(macro()) && /巨集 2 \/ 2（15 行）/.test(macro())
    && (macro().match(/\/echo/g) || []).length === 1, macroLineCounts().join(','));
  R.render(mkResult(16), false);
  check('T39 16 步 → 切成兩段', /巨集 1 \/ 2/.test(macro()) && /巨集 2 \/ 2/.test(macro()));
  check('T39 切段後每段仍不得超過 15 行（14 步 + 1 行 /echo）', /巨集 1 \/ 2（15 行）/.test(macro()));
  check('T39 末段行數＝剩餘步數 + /echo', /巨集 2 \/ 2（3 行）/.test(macro()));
  check('T39 中段講「第 N 段完成」（提示還要按下一段）', (macro().match(/\/echo 第 \d+ 段完成/g) || []).length === 1);
  check('T39 末段一律講「製作完成」而非「第 N 段完成」', /\/echo 製作完成 &lt;se\.2&gt;/.test(macro()));
  check('T39 每一段都要有一行帶音效的 /echo', (macro().match(/\/echo [^<]*&lt;se\.\d+&gt;/g) || []).length === 2);
  // 遊戲上限是硬限制：超過 15 行的巨集貼不進遊戲，而站上完全看不出來
  const echoCount = () => (macro().match(/\/echo/g) || []).length;
  // 段數 golden（多切一段＝玩家多存一格巨集、多按一次；少切一段＝貼不進遊戲）。
  // 開提示音時 14 步一段，唯獨「剩下剛好 15 步」整段塞滿 ⇒ 15/29 各省下一段；關掉時一律 15 步一段。
  const SEGS = { true: { 1: 1, 13: 1, 14: 1, 15: 1, 16: 2, 28: 2, 29: 2, 40: 3, 45: 4 },
                 false: { 1: 1, 13: 1, 14: 1, 15: 1, 16: 2, 28: 2, 29: 2, 40: 3, 45: 3 } };
  for (const on of [true, false]) {
    echoBox.checked = on;
    for (const n of [1, 13, 14, 15, 16, 28, 29, 40, 45]) {
      R.render(mkResult(n), false);
      const counts = macroLineCounts();
      check(`T39 ${n} 步（提示音${on ? '開' : '關'}）：每段 ≤15 行`, counts.length > 0 && counts.every(c => c <= 15), counts.join(','));
      // echo 是逐段可選的（塞滿的末段沒有）⇒ 用實際 echo 行數對帳，不能假設每段一行
      check(`T39 ${n} 步（提示音${on ? '開' : '關'}）：步數不漏不重（總行數 − echo 行數 == 步數）`,
        counts.reduce((a, b) => a + b, 0) - echoCount() === n, counts.join(',') + ' echo=' + echoCount());
      const want = SEGS[on][n];
      check(`T39 ${n} 步（提示音${on ? '開' : '關'}）：段數＝${want}`, counts.length === want, counts.join(','));
    }
  }
  echoBox.checked = false;
  R.render(mkResult(15), false);
  check('T39 關提示音 → 一行 /echo 都不出現', !/\/echo/.test(macro()));
  R.render(mkResult(30), false);
  check('T39 關提示音 → 單段容量回到 15 步（30 步＝兩段滿格）',
    /巨集 1 \/ 2（15 行）/.test(macro()) && /巨集 2 \/ 2（15 行）/.test(macro()) && !/\/echo/.test(macro()));
  echoBox.checked = true;

  // (d) 提示音開關的接線：偏好要留得住，切換要**當場**重組巨集（它不是求解輸入，不該逼玩家重求解）。
  //     沒有這幾條的話，開關可以被接歪成「重整就跳回預設」或「按了沒反應」，而 render 的其他斷言全綠。
  {
    // 開關本體在 index.html；缺席時 renderMacro 退回「一律加音效」＝功能靜默消失（畫面看不出差別）
    const HTML39 = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const box = HTML39.match(/<input[^>]*id="macro-echo"[^>]*>/);
    check('T39 index.html 有提示音開關（#macro-echo）', !!box, '找不到 #macro-echo');
    check('T39 提示音預設為開（HTML 帶 checked）', !!box && /\schecked\b/.test(box[0]), box ? box[0] : '');

    const el = { checked: true, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } };
    const store = {}; let read = null;
    const realLS = sandbox.localStorage;
    sandbox.localStorage = { getItem: (k) => (read = k, store[k] ?? null), setItem: (k, v) => { store[k] = v; }, removeItem() {} };
    store['ffxiv-crafter-macro-echo-v1'] = '0';
    R.init({ ...RDEPS, $: (id) => (id === 'macro-echo' ? el : $r(id)) });
    eq('T39 上次關掉提示音 → 重開頁面仍是關的', el.checked, false);
    eq('T39 偏好讀的是 ffxiv-crafter-macro-echo-v1', read, 'ffxiv-crafter-macro-echo-v1');
    check('T39 開關有掛 change 事件（否則按了沒反應）', typeof el.listeners.change === 'function');
    R.render(mkResult(14), false);
    check('T39 提示音關 → 14 步就是 14 行', /巨集 1 \/ 1（14 行）/.test(macro()));
    el.checked = true;
    el.listeners.change();
    eq('T39 切換提示音 → 立刻存起來', store['ffxiv-crafter-macro-echo-v1'], '1');
    check('T39 切換提示音 → 當場重組巨集（不必重新求解）',
      /巨集 1 \/ 1（15 行）/.test(macro()) && /\/echo 製作完成/.test(macro()), macro().slice(0, 120));
    sandbox.localStorage = realLS;
    R.init(RDEPS);
  }
}

// ===== T60：配方的最低能力要求（Owner 2026-08-19：「這部分有做管控嗎」→ 當時完全沒有）=====
// 13874 個配方裡 3396 個有 required_craftsmanship / required_control，而全站對這兩欄零引用 ⇒
// 數值不夠的人照樣求解、照樣拿到巨集，**進遊戲才發現製作筆記根本不給做**（站上零訊號）。
// 比較基準必須是 effectiveStats（含食物／藥水／專家之證）——遊戲判定同樣吃 buff，拿裸裝比會誤擋。
{
  const R = { required_craftsmanship: 700, required_control: 650 };
  const NONE = { required_craftsmanship: 0, required_control: 0 };
  const gear = (cms, ctrl) => ({ cms, ctrl, cp: 500, level: 100 });
  eq('T60 配方無門檻 → 一律通過', T.statShortfall(NONE, gear(1, 1)).ok, true);
  eq('T60 沒填角色數值 → 不謊報不足（缺數值那條由既有動線擋）', T.statShortfall(R, null).ok, true);
  const short = T.statShortfall(R, gear(600, 600));
  eq('T60 兩項都不足 → 各自算出差額', `${short.cms}/${short.ctrl}/${short.ok}`, '100/50/false');
  eq('T60 只差一項 → 另一項為 0', JSON.stringify([T.statShortfall(R, gear(700, 600)).cms, T.statShortfall(R, gear(700, 600)).ctrl]), '[0,50]');
  eq('T60 剛好等於門檻 → 通過（遊戲是 >=）', T.statShortfall(R, gear(700, 650)).ok, true);
  eq('T60 需求值一併回傳（給畫面寫出「需求 X／Y」）', `${short.need.cms}/${short.need.ctrl}`, '700/650');
  // 食藥加成算數：base 600 + 食物 20%（上限 100）→ 700／650，剛好達標（沿用 T22 的 fixture 手法）
  const oldCC = sandbox.CraftConsumable;
  try {
    sandbox.CraftConsumable = { get: (kind) => (kind === 'food' ? { cm: 20, cm_max: 100, ct: 20, ct_max: 100 } : null) };
    eq('T60 食物加成算進門檻判定（遊戲同樣吃 buff，拿裸裝比會誤擋）', T.statShortfall(R, gear(600, 600)).ok, true);
  } finally { sandbox.CraftConsumable = oldCC; }
  eq('T60 拿掉食物 → 回到不足', T.statShortfall(R, gear(600, 600)).ok, false);
}

// ===== T61：門檻不足時 doSolve 必須擋下並說明差多少 =====
{
  const SOLVE_SRC = fs.readFileSync(path.join(ROOT, 'app-solve.js'), 'utf8');
  const sent = [];
  const toasts = [];
  const tabs = [];
  const sb = { console, Worker: function () { this.postMessage = (m) => sent.push(m); this.terminate = () => {}; },
    document: { getElementById: () => ({ hidden: true, textContent: '', innerHTML: '', classList: { add() {}, remove() {}, toggle() {} },
      querySelector: () => null, setAttribute() {}, focus() {} }) } };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(SOLVE_SRC, sb, { filename: 'app-solve.js' });
  const recipe = { id: 1, job: '鍛造', item_name: '硬鋼錠', required_craftsmanship: 5380, required_control: 4650 };
  sb.CraftSolve.init({
    $: () => ({ hidden: true, textContent: '', innerHTML: '', value: '', checked: false,
      classList: { add() {}, remove() {}, toggle() {} }, querySelector: () => null, setAttribute() {}, focus() {} }),
    toast: (m, kind) => toasts.push([m, kind]), PH_HTML: '',
    getSelected: () => ({ recipe, rlv: { class_job_level: 100 } }),
    gearFor: () => ({ cms: 5000, ctrl: 4600, cp: 700, level: 100 }),
    computeSettings: () => ({ base_progress: 100, base_quality: 100 }),
    switchTab: (name) => tabs.push(name),
    statShortfall: () => ({ need: { cms: 5380, ctrl: 4650 }, cms: 380, ctrl: 50, ok: false }),
  });
  sb.CraftSolve.doSolve();
  eq('T61 門檻不足 → 不送求解（不給一份進遊戲用不了的巨集）', sent.length, 0);
  const t = toasts.at(-1) || ['', ''];
  check('T61 訊息寫出需求值與還差多少', /5380/.test(t[0]) && /4650/.test(t[0]) && /380/.test(t[0]) && /50/.test(t[0]), JSON.stringify(t));
  eq('T61 擋下的訊息是 error 級', t[1], 'error');
  eq('T61 導去角色數值分頁（同「缺角色數值」的補救動線）', tabs.at(-1), 'stats');
  // 求解鈕不得用真 disabled（鍵盤走不到就讀不到原因）——與缺角色數值同一取捨
  check('T61 求解鈕走 aria-disabled 而不是 disabled', /solve-btn'\)\.setAttribute\('aria-disabled'/.test(fs.readFileSync(path.join(ROOT, 'app-recipe.js'), 'utf8')));
}

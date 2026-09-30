// 多分頁保存：兩個真 coordinator VM 共用保存區，可逐一放行 Web Lock 與派送 storage 事件。
import { fs, vm, path, ROOT, loadStorage, GEAR_SRC, makeEl, eq, eqObj, check } from './_harness.mjs';

function eventEl() {
  const el = makeEl(), handlers = new Map();
  let value = '';
  Object.defineProperty(el, 'value', { get: () => value, set: (next) => { value = String(next); }, configurable: true });
  el.addEventListener = (name, fn) => { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); };
  el.fire = (name, props = {}) => { for (const fn of handlers.get(name) || []) fn({ target: el, ...props }); };
  return el;
}
function pair(initial = {}, useLocks = true) {
  const store = { ...initial }, requests = [], tabs = [];
  let writes = 0, failWrites = false, failReads = false;
  const locks = { request(name, options, callback) {
    return new Promise((resolve, reject) => { requests.push({ name, options, callback, resolve, reject }); });
  } };
  function tab() {
    const events = new Map(), docEvents = new Map(), toasts = [], errors = [], els = {};
    const $ = (id) => els[id] || (els[id] = eventEl());
    const ctx = {
      console: { log() {}, warn() {}, error(...args) { errors.push(args); } },
      navigator: useLocks ? { locks } : {},
      document: { activeElement: null, visibilityState: 'visible', getElementById: $, querySelector: () => null,
        addEventListener(name, fn) { docEvents.set(name, fn); } },
      addEventListener(name, fn) { events.set(name, fn); },
      localStorage: {
        getItem(key) { if (failReads) throw new Error('SecurityError'); return store[key] ?? null; },
        setItem(key, raw) { if (failWrites) throw new Error('QuotaExceededError'); store[key] = String(raw); writes++; },
      },
    };
    ctx.globalThis = ctx; vm.createContext(ctx); loadStorage(ctx);
    ctx.CraftStorage.init({ toast: (message, level) => toasts.push([message, level]) });
    const result = { ctx, $, els, toasts, errors,
      fire(name) { events.get(name)?.({}); },
      storage(key) { events.get('storage')?.({ key, storageArea: ctx.localStorage }); },
      hide() { ctx.document.visibilityState = 'hidden'; docEvents.get('visibilitychange')?.(); },
    };
    tabs.push(result); return result;
  }
  async function release(index = 0) {
    const req = requests.splice(index, 1)[0];
    if (!req) throw new Error('沒有待放行的保存鎖');
    try { req.resolve(req.callback()); } catch (error) { req.reject(error); }
    await Promise.resolve();
  }
  async function reject() {
    requests.shift().reject(new Error('Lock request denied'));
    await Promise.resolve(); await Promise.resolve();
  }
  return { store, tab, release, reject, requests, get writes() { return writes; },
    set failWrites(value) { failWrites = value; }, set failReads(value) { failReads = value; } };
}
const GKEY = 'ffxiv-crafter-gearsets-v1', LKEY = 'ffxiv-crafter-craftlist-v1';
const DOH = ['木工', '鍛造', '甲冑', '金工', '皮革', '裁縫', '鍊金', '烹調'];
function gearTab(p) {
  const t = p.tab();
  vm.runInContext(GEAR_SRC, t.ctx, { filename: 'app-gear.js' });
  t.ctx.CraftGear.init({ $: t.$, esc: String, toast: (m, v) => t.toasts.push([m, v]), iconUrl: String,
    DOH, JOB_ICON: {}, afterInput() { t.invalidations = (t.invalidations || 0) + 1; } });
  t.ctx.CraftGear.loadGear();
  t.input = (field, value) => t.ctx.CraftGear.onGearInput({ target: { dataset: { job: '木工', f: field }, value: String(value) } });
  t.toggle = (job) => { const target = { dataset: { job }, checked: true }; t.ctx.CraftGear.onSpecialistToggle({ target }); return target; };
  return t;
}
function listTab(p) {
  const t = p.tab();
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'crafting-list.js'), 'utf8'), t.ctx, { filename: 'crafting-list.js' });
  t.ctx.CraftList.init({ $: t.$, esc: String, iconUrl: String, ITEMS: {}, INGREDIENTS: {},
    RECIPES: [{ id: 100, item_name: '鐵錠' }, { id: 200, item_name: '鋼錠' }],
    toast: (m, v) => t.toasts.push([m, v]), isCrystal: () => false, pickRecipeForItem: () => null,
    vendorHtml: () => '', onChange() {}, });
  return t;
}
const objectCodec = { parse: (raw) => JSON.parse(raw) || {} };
const leaf = (field, value) => ({ kind: 'set', read: (model) => model[field], apply(model) { model[field] = value; return model; } });

// 不同欄位保留；提交結果取代舊 model，並走既有求解失效鏈。
{
  const p = pair({ [GKEY]: JSON.stringify({ 木工: { level: 100, cms: 4000, ctrl: 3900, cp: 600 } }) });
  const a = gearTab(p), b = gearTab(p);
  a.input('cms', 4100); b.input('cp', 620);
  await p.release(); await p.release(); a.storage(GKEY); b.storage(GKEY);
  eq('M1 不同 gear 欄位兩者均保存', JSON.stringify(JSON.parse(p.store[GKEY]).木工), JSON.stringify({ level: 100, cms: 4100, ctrl: 3900, cp: 620 }));
  eq('M1 別 tab 刷新 model 跟上 commit', a.ctx.CraftGear.gearFor('木工').cp, 620);
  check('M1 gear storage 刷新走 afterInput', a.invalidations > 1);
  eq('M1 刷新不回寫', p.writes, 2);
}
// 同 recipe 的 delta 累加，提示使用實際提交次數而非過期快照。
{
  const p = pair(), a = listTab(p), b = listTab(p);
  const pa = a.ctx.CraftList.addRuns(100, 2), pb = b.ctx.CraftList.addRuns(100, 3);
  await p.release(); await p.release(); await Promise.all([pa, pb]);
  a.storage(LKEY); b.storage(LKEY);
  eq('M1 同 recipe delta 累加', JSON.parse(p.store[LKEY])[0].qty, 5);
  eq('M1 兩 tab 清單同步次數', JSON.stringify([a.ctx.CraftList.count(100), b.ctx.CraftList.count(100)]), '[5,5]');
  check('M1 數量 toast 使用 commit 結果', b.toasts.some(([m]) => m.includes('製作 5 次')));
  const pc = a.ctx.CraftList.add(200), pd = b.ctx.CraftList.removeOne(100);
  await p.release(); await p.release(); await Promise.all([pc, pd]);
  eq('M1 不同 recipe 增減均保留', JSON.stringify(JSON.parse(p.store[LKEY])), '[{"id":100,"qty":4},{"id":200,"qty":1}]');
}
// 別 tab 先到數量上限，即使本 tab 尚未收到事件，也必須同步實際值而非謊報 +1。
{
  const p = pair({ [LKEY]: '[{"id":100,"qty":998}]' }), a = listTab(p), b = listTab(p);
  const pb = b.ctx.CraftList.add(100); await p.release(); await pb;
  const pa = a.ctx.CraftList.add(100); await p.release(); await pa;
  eq('M1 過期 tab 的上限操作同步 fresh model', a.ctx.CraftList.count(100), 999);
  check('M1 過期 tab 上限不謊報增量', a.toasts.some(([m, level]) => m.includes('已達單筆製作上限') && level === 'warn'));
}
// 不同任務 id 的集合操作也不會整包覆蓋。
{
  const key = 'ffxiv-crafter-quests-v1', p = pair(), a = p.tab(), b = p.tab();
  const codec = { parse: (raw) => JSON.parse(raw) || { job: '', done: [], hideDone: false } };
  for (const t of [a, b]) t.ctx.CraftStorage.open(key, codec);
  const member = (id, checked = true) => ({ kind: 'member', apply(model) {
    const done = new Set(model.done); if (checked) done.add(id); else done.delete(id);
    model.done = [...done]; return model;
  } });
  const pa = a.ctx.CraftStorage.update(key, member(1)), pb = b.ctx.CraftStorage.update(key, member(2));
  await p.release(); await p.release(); await Promise.all([pa, pb]);
  eq('M1 不同 quest id 兩者均保留', JSON.stringify(JSON.parse(p.store[key]).done), '[1,2]');
  const pc = a.ctx.CraftStorage.update(key, leaf('job', '木工')), pd = b.ctx.CraftStorage.update(key, leaf('hideDone', true));
  await p.release(); await p.release(); await Promise.all([pc, pd]);
  eq('M1 quest job/hideDone 不互相覆蓋', JSON.stringify(JSON.parse(p.store[key])), '{"job":"木工","done":[1,2],"hideDone":true}');
  const pe = a.ctx.CraftStorage.update(key, member(1, false)), pf = b.ctx.CraftStorage.update(key, member(3));
  await p.release(); await p.release(); await Promise.all([pe, pf]);
  eq('M1 不同 quest id 的移除與新增均保留', JSON.stringify(JSON.parse(p.store[key]).done), '[2,3]');
}
// 同欄 set/delete 最後提交勝；只通知真正覆蓋過期基線的一方。
{
  const p = pair({ opts: '{"x":1,"y":9}' }), a = p.tab(), b = p.tab();
  for (const t of [a, b]) t.ctx.CraftStorage.open('opts', objectCodec);
  const pa = a.ctx.CraftStorage.update('opts', leaf('x', 2)), pb = b.ctx.CraftStorage.update('opts', leaf('x', 3));
  await p.release(); await p.release(); const [ra, rb] = await Promise.all([pa, pb]);
  eq('M1 同欄最後提交勝', p.store.opts, '{"x":3,"y":9}');
  eq('M1 第一個 commit 無衝突', ra.conflict, false);
  eq('M1 後提交過期欄位有衝突', rb.conflict, true);
  eq('M1 同欄衝突顯示指定 warn 一次', JSON.stringify(b.toasts), JSON.stringify([['其他分頁也修改了這個欄位，已採用最後儲存的值', 'warn']]));
  const pc = a.ctx.CraftStorage.update('opts', { kind: 'delete', read: (m) => m.x, apply(m) { delete m.x; return m; } });
  await p.release(); const rc = await pc;
  eq('M1 delete 保留其他欄位', p.store.opts, '{"y":9}');
  eq('M1 delete 同樣比對欄位基線', rc.conflict, true);
}
// 兩個分頁競爭最後一張專家之證，鎖內重新計數，第四張 DOM 回滾。
{
  const p = pair({ [GKEY]: JSON.stringify({ 木工: { specialist: true }, 鍛造: { specialist: true } }) });
  const a = gearTab(p), b = gearTab(p), third = a.toggle('甲冑'), fourth = b.toggle('金工');
  await p.release(); await p.release();
  eq('M1 同搶第三/第四專家之證仍只有三個', Object.values(JSON.parse(p.store[GKEY])).filter((v) => v.specialist).length, 3);
  eq('M1 第三專家之證 DOM 維持勾選', third.checked, true);
  eq('M1 第四專家之證被拒後 DOM 回滾', fourth.checked, false);
  check('M1 被拒專家之證有原上限提示', b.toasts.some(([m, v]) => m.includes('最多 3 個') && v === 'warn'));
}
// 寫入失敗與 lock reject 都走各層的一次性提醒，Promise 不漏 rejection。
{
  const p = pair(), a = listTab(p);
  p.failWrites = true;
  let result = a.ctx.CraftList.add(100); await p.release();
  eq('M1 setItem 失敗回報 commit failure', (await result).ok, false);
  eq('M1 寫入失敗仍保留清單變更', a.ctx.CraftList.count(100), 1);
  p.failWrites = false;
  result = a.ctx.CraftList.add(100); await p.reject();
  eq('M1 lock reject 回報 commit failure', (await result).ok, false);
  eq('M1 lock reject 後連續新增仍累加', a.ctx.CraftList.count(100), 2);
  eq('M1 持續保存失敗只 toast 一次', a.toasts.filter(([m]) => m.includes('無法保存製造清單')).length, 1);
  eq('M1 失敗不寫入保存區', p.store[LKEY], undefined);
  result = a.ctx.CraftList.add(100); await p.release(); await result;
  eq('M1 恢復保存時一併寫入未落盤 delta', JSON.parse(p.store[LKEY])[0].qty, 3);
}
// 自己的操作仍排隊時收到別 tab 事件：顯示 fresh＋pending；不刷新回寫。
{
  const p = pair({ opts: '{"x":1,"y":1}' }), a = p.tab(), b = p.tab();
  for (const t of [a, b]) t.ctx.CraftStorage.open('opts', objectCodec);
  let shown;
  a.ctx.CraftStorage.subscribe('opts', (value) => { shown = value; });
  const pa = a.ctx.CraftStorage.update('opts', leaf('x', 7));
  const pb = b.ctx.CraftStorage.update('opts', leaf('y', 8));
  await p.release(1); await pb; a.storage('opts');
  eq('M1 storage event 重套自己排隊中的 operation', JSON.stringify(shown), '{"x":7,"y":8}');
  eq('M1 refresh 不回寫自己的 pending operation', p.store.opts, '{"x":1,"y":8}');
  eq('M1 refresh 不增加寫入次數', p.writes, 1);
  await p.release(); await pa;
  eq('M1 pending commit 保留他 tab 欄位', p.store.opts, '{"x":7,"y":8}');
}
// 關分頁與背景隱藏同步 flush；晚到的原 lock callback 不可再提交同一 operation。
for (const lifecycle of ['pagehide', 'hidden']) {
  const p = pair({ [LKEY]: '[{"id":100,"qty":1}]' }), a = p.tab();
  a.ctx.CraftStorage.open(LKEY, { parse: (raw) => JSON.parse(raw) || [] });
  const pending = a.ctx.CraftStorage.update(LKEY, { kind: 'set', read: (m) => m.find((e) => e.id === 100)?.qty,
    apply(m) { m.find((e) => e.id === 100).qty = 12; return m; } });
  if (lifecycle === 'hidden') a.hide(); else a.fire('pagehide');
  eq(`M1 ${lifecycle} 同步保存等鎖中的 qty edit`, JSON.parse(p.store[LKEY])[0].qty, 12);
  eq(`M1 ${lifecycle} 回傳真正 commit 結果`, (await pending).ok, true);
  await p.release();
  eq(`M1 ${lifecycle} 原 callback 晚到不重複寫`, p.writes, 1);
}
// 無鎖 fallback 仍同步，且 fresh-read 不會覆蓋不同欄位。
{
  const p = pair({ opts: '{"x":1,"y":1}' }, false), a = p.tab(), b = p.tab();
  for (const t of [a, b]) t.ctx.CraftStorage.open('opts', objectCodec);
  a.ctx.CraftStorage.update('opts', leaf('x', 2)); b.ctx.CraftStorage.update('opts', leaf('y', 3));
  eq('M1 無鎖 fallback 同 task 完成並保留其他欄位', p.store.opts, '{"x":2,"y":3}');
}

function loadLayer(t, name) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, name), 'utf8'), t.ctx, { filename: name });
}
function consumableTab(p) {
  const t = p.tab();
  loadLayer(t, 'app-consumable.js');
  t.ctx.CraftConsumable.init({ $: t.$, esc: String, iconUrl: String,
    toast: (m, v) => t.toasts.push([m, v]), onChange() {} });
  t.ctx.CraftConsumable.setData([{ name: '食物', cm: 10, is_hq: true }], [{ name: '藥水', cp: 10, is_hq: true }]);
  t.pick = (kind, name) => t.$(`${kind}-menu`).fire('click', { target: { closest: () => ({ dataset: { name } }) } });
  return t;
}
function questTab(p) {
  const t = p.tab(), checks = [1, 2].map((id) => Object.assign(eventEl(), { dataset: { quest: String(id) } }));
  t.$('quest-body').querySelectorAll = (sel) => sel === '.crafter-qt-done' ? checks : [];
  loadLayer(t, 'app-quests.js');
  t.ctx.CraftQuests.init({ $: t.$, esc: String, iconUrl: String, toast: (m, v) => t.toasts.push([m, v]),
    mbItem: String, selectRecipe() {}, switchTab() {}, copyText() {},
    getItems: () => ({}), getIngredients: () => ({}), getRecipesById: () => ({}), getRecipeByItem: () => ({}) });
  t.ctx.CraftQuests.setData([{ job: '木工', quests: [1, 2].map((id) => ({ id, lv: id, name: `任務${id}`, items: [] })) }]);
  t.done = (i) => { checks[i].checked = true; checks[i].onchange(); };
  return t;
}

// read/write/lock 三種失敗均不得撤銷本次瀏覽的變更；下一筆操作也不可丟掉前一筆。
for (const failure of ['read', 'write', 'lock']) {
  const p = pair({ [GKEY]: '{"木工":{"level":100,"cms":4000,"ctrl":3900,"cp":600}}' });
  const list = listTab(p), gear = gearTab(p), cons = consumableTab(p), quests = questTab(p);
  if (failure === 'read') p.failReads = true;
  if (failure === 'write') p.failWrites = true;
  const finish = () => failure === 'lock' ? p.reject() : p.release();
  list.ctx.CraftList.add(100); await finish(); list.ctx.CraftList.addRuns(100, 2); await finish();
  eq(`M1 ${failure} failure 重複 list adds 留在記憶體`, list.ctx.CraftList.count(100), 3);
  gear.input('cms', 4100); await finish(); gear.input('cp', 620); await finish();
  gear.toggle('木工'); await finish();
  eq(`M1 ${failure} failure gear 後續 toggle 保留先前數值`,
    JSON.stringify([gear.ctx.CraftGear.gearFor('木工').cms, gear.ctx.CraftGear.gearFor('木工').cp, gear.ctx.CraftGear.specialistFor('木工')]), '[4100,620,true]');
  cons.pick('food', '食物'); await finish(); cons.pick('potion', '藥水'); await finish();
  eq(`M1 ${failure} failure 食藥後續選擇不撤銷前一項`, JSON.stringify([cons.ctx.CraftConsumable.label('food'), cons.ctx.CraftConsumable.label('potion')]), '["食物","藥水"]');
  quests.done(0); await finish(); quests.done(1); await finish();
  check(`M1 ${failure} failure 任務 UI 保留兩次勾選`, quests.$('quest-progress').innerHTML.includes('已完成 <b>2</b>'));
  for (const [t, word] of [[list, '製造清單'], [gear, '角色數值'], [cons, '食物/藥水'], [quests, '職業任務進度']]) {
    eq(`M1 ${failure} failure ${word} 只警告一次`, t.toasts.filter(([m]) => m.includes(`無法保存${word}`)).length, 1);
  }
  eq(`M1 ${failure} failure 未覆寫保存區`, p.writes, 0);
}

// 未落盤的操作在別 tab fresh 值上重套，恢復後保存合併結果而非舊整包。
{
  const p = pair({ opts: '{"x":1,"y":1}' }, false), a = p.tab(), b = p.tab();
  for (const t of [a, b]) t.ctx.CraftStorage.open('opts', objectCodec);
  let shown;
  a.ctx.CraftStorage.subscribe('opts', (value) => { shown = value; });
  p.failWrites = true;
  await a.ctx.CraftStorage.update('opts', { ...leaf('x', 2), field: 'x' });
  await a.ctx.CraftStorage.update('opts', { ...leaf('x', 3), field: 'x' });
  p.failWrites = false;
  await b.ctx.CraftStorage.update('opts', leaf('y', 9)); a.storage('opts');
  eq('M1 遠端 refresh 保留失敗的同欄最後選擇', JSON.stringify(shown), '{"x":3,"y":9}');
  eq('M1 未保存 refresh 不回寫', p.writes, 1);
  await a.ctx.CraftStorage.update('opts', leaf('z', 4));
  eq('M1 恢復後合併未保存與遠端不同欄', p.store.opts, '{"x":3,"y":9,"z":4}');
  eq('M1 同欄多次保存失敗不把自己的未落盤值誤報成衝突', a.toasts.length, 0);
}

// 保存失敗的 set/delete 之後才落盤，仍須對原始基線檢查他 tab 同欄變更；當前 op 同欄或別欄均適用。
for (const kind of ['set', 'delete']) for (const current of ['x', 'y']) {
  const p = pair({ opts: '{"x":1,"y":1}' }), a = p.tab(), b = p.tab();
  for (const t of [a, b]) t.ctx.CraftStorage.open('opts', objectCodec);
  const retained = kind === 'set' ? { ...leaf('x', 2), field: 'x' }
    : { kind: 'delete', field: 'x', read: (m) => m.x, apply(m) { delete m.x; return m; } };
  p.failWrites = true;
  const failed = a.ctx.CraftStorage.update('opts', retained); await p.release(); await failed;
  p.failWrites = false;
  const remote = b.ctx.CraftStorage.update('opts', leaf('x', 3)); await p.release(); await remote;
  a.storage('opts');
  const recovered = a.ctx.CraftStorage.update('opts', leaf(current, 4)); await p.release();
  const result = await recovered;
  const expected = current === 'x' ? { x: 4, y: 1 } : kind === 'set' ? { x: 2, y: 4 } : { y: 4 };
  eqObj(`M1 未落盤 ${kind} 恢復後 ${current} commit 保持最後提交勝`, JSON.parse(p.store.opts), expected);
  eq(`M1 未落盤 ${kind} 恢復後 ${current} commit 回報保留操作衝突`, result.conflict, true);
  eq(`M1 未落盤 ${kind} 恢復後 ${current} commit 只提示一次精確 warn`, JSON.stringify(a.toasts),
    JSON.stringify([['其他分頁也修改了這個欄位，已採用最後儲存的值', 'warn']]));
}

// 聚焦不代表有草稿：背景 tab 的未編輯欄位必須追上遠端值；真的未提交文字仍保留。
{
  const p = pair({ [GKEY]: '{"木工":{"level":100,"cms":4000,"ctrl":3900,"cp":600}}' }, false), t = gearTab(p);
  const inp = eventEl(); inp.dataset = { job: '木工', f: 'cms' }; inp.value = '4000';
  t.$('gearsets').querySelectorAll = (sel) => sel === '.gear-in' ? [inp] : [];
  t.ctx.CraftGear.renderGearsets(); t.ctx.document.activeElement = inp; inp.fire('focus');
  p.store[GKEY] = '{"木工":{"level":100,"cms":4200,"ctrl":3900,"cp":600}}'; t.storage(GKEY);
  eq('M1 gear 聚焦未編輯欄位同步遠端值', inp.value, '4200');
  inp.value = '43';
  p.store[GKEY] = '{"木工":{"level":100,"cms":4500,"ctrl":3900,"cp":600}}'; t.storage(GKEY);
  eq('M1 gear 聚焦未提交文字仍保留', inp.value, '43');
  eq('M1 gear 保留文字但有效 model 已同步', t.ctx.CraftGear.gearFor('木工').cms, 4500);
}
{
  const key = 'ffxiv-crafter-level-sync-v1', p = pair({ [key]: '{"level":70}' }, false), t = p.tab();
  loadLayer(t, 'app-level-sync.js');
  t.ctx.CraftSync.init({ $: t.$, toast() {}, onChange() {} });
  const inp = t.$('ls-level'); inp.value = '70'; t.ctx.document.activeElement = inp; inp.fire('focus');
  p.store[key] = '{"level":80}'; t.storage(key);
  eq('M1 level-sync 聚焦未編輯欄位同步遠端值', inp.value, '80');
  inp.value = '9'; p.store[key] = '{"level":85}'; t.storage(key);
  eq('M1 level-sync 聚焦未提交文字仍保留', inp.value, '9');
}
{
  const p = pair({ [LKEY]: '[{"id":100,"qty":1}]' }, false), t = listTab(p), box = t.$('craft-list');
  let row, input;
  Object.defineProperty(box, 'innerHTML', { configurable: true, set(html) {
    const match = html.match(/class="cl-qty-in[^"]*"[^>]*value="([^"]*)"/);
    if (!match) { row = input = null; return; }
    row = eventEl(); row.dataset = { id: '100' };
    input = eventEl(); input.value = match[1]; input.classList.contains = (name) => name === 'cl-qty-in';
    input.closest = () => row;
    input.focus = () => { t.ctx.document.activeElement = input; input.fire('focus'); };
    const go = eventEl(), del = eventEl();
    row.querySelector = (sel) => sel === '.cl-qty-in' ? input : sel === '.cl-go' ? go : del;
  } });
  box.querySelectorAll = (sel) => sel === '.cl-row' && row ? [row] : [];
  box.querySelector = (sel) => sel.includes('.cl-qty-in') ? input : null;
  t.storage(LKEY); input.focus();
  p.store[LKEY] = '[{"id":100,"qty":5}]'; t.storage(LKEY);
  eq('M1 list 聚焦未編輯 qty 同步遠端值', input.value, '5');
  eq('M1 list qty refresh 保留焦點', t.ctx.document.activeElement, input);
  input.value = '12'; p.store[LKEY] = '[{"id":100,"qty":8}]'; t.storage(LKEY);
  eq('M1 list 聚焦已編輯 qty 保留草稿', input.value, '12');
  eq('M1 list 草稿不阻擋 totals model 同步', t.ctx.CraftList.count(100), 8);
  input.fire('change');
  eq('M1 list 草稿可提交且沿用編輯基線', JSON.parse(p.store[LKEY])[0].qty, 12);
  eq('M1 list 草稿覆蓋遠端變更顯示一次衝突', t.toasts.filter(([m]) => m === t.ctx.CraftStorage.CONFLICT_MESSAGE).length, 1);
}

// node tools/test-formulas.mjs — 前端純函式 golden 回歸 + 健檢機械哨兵（無框架、vm sandbox）
// 2026-07-11 R2 批次 0（quality A1 / BACKLOG B-004）建立：把 app.js 的公式純函式在 node 載入斷言，
// golden 值＝spec §4 對抗驗證過的真實遊戲數（rlv640/工藝4048/90級 → base_progress 250）。
// 手法參考 island-workshop test/solver.test.js：vm 載 app.js（給假 DOM，fetch 立即 reject → 頂層 IIFE 走 catch 分支無害），
// 再導出純函式斷言。守：computeSettings（含專家之證 CP+15）/ hqPercent 斷點 / recipeMaxes + 2 條安全哨兵。
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const APP_SRC = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const RENDER_SRC = fs.readFileSync(path.join(ROOT, 'app-render.js'), 'utf8'); // 結果渲染層（hqPercent 純函式住此）

// ---------- 可控 DOM stub ----------
const dom = {};
function makeEl() {
  return {
    checked: false, value: '', innerHTML: '', textContent: '', hidden: true, disabled: false,
    max: '', min: '', placeholder: '', dataset: {}, style: {},
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, removeEventListener() {},
    querySelectorAll() { return []; }, querySelector() { return null; },
    appendChild() {}, removeChild() {}, insertAdjacentHTML() {},
    focus() {}, scrollIntoView() {}, select() {}, onclick: null, onkeydown: null,
  };
}
const getEl = (id) => dom[id] || (dom[id] = makeEl());

const sandbox = {
  console,
  document: {
    getElementById: getEl, querySelector() { return null; }, querySelectorAll() { return []; },
    createElement() { return makeEl(); }, body: makeEl(),
  },
  location: { hostname: 'localhost', search: '' },
  window: {},
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  Worker: function () { this.postMessage = () => {}; this.terminate = () => {}; },
  fetch: () => Promise.reject(new Error('test: no network')), // loadData 失敗 → IIFE catch → 不跑後續 init
  setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(RENDER_SRC, sandbox, { filename: 'app-render.js' }); // 先定義 globalThis.CraftRender（hqPercent 純函式、不需 init）
vm.runInContext(
  APP_SRC + '\n;globalThis.__t = { computeSettings, recipeMaxes, effectiveStats, esc, mbItem, mbCraft, selectRecipe, hqPercent: globalThis.CraftRender.hqPercent };',
  sandbox, { filename: 'crafter-app.js' });
const T = sandbox.__t;

// ---------- 迷你斷言框架 ----------
let pass = 0, fail = 0;
function check(name, ok, extra) {
  console.log((ok ? '✓ ' : '✗ ') + name + (ok || !extra ? '' : '  ' + extra));
  ok ? pass++ : fail++;
}
const norm = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1))));
function eqObj(name, got, want) { check(name, norm(got) === norm(want), `\n    got =${norm(got)}\n    want=${norm(want)}`); }
function eq(name, got, want) { check(name, got === want, `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }

// ---------- 共用 fixture（spec §4 對抗驗證過的真實 rlv640）----------
const rlv640 = {
  id: 640, class_job_level: 90, difficulty: 4400, quality: 9000, durability: 70,
  progress_divider: 130, quality_divider: 115, progress_modifier: 80, quality_modifier: 70,
};
const recipe100 = { difficulty_factor: 100, quality_factor: 100, durability_factor: 100, is_expert: false };
const gear = { level: 90, cms: 4048, ctrl: 3980, cp: 600 };

// 設 computeSettings 讀的所有 DOM 輸入（求解選項 / 消耗品 / 專家之證），求純函式決定性
function setInputs({ specialist = false, mode = 'quality', target = '', manip = true, heart = false, qi = false, backload = false, adv = false } = {}) {
  getEl('specialist').checked = specialist;
  getEl('food').value = ''; getEl('potion').value = '';       // 無食藥（FOOD/POTION 因 loadData 失敗為空 → getConsumable 回 null）
  getEl('opt-manip').checked = manip; getEl('opt-heart').checked = heart; getEl('opt-qi').checked = qi;
  getEl('opt-backload').checked = backload; getEl('opt-adversarial').checked = adv;
  getEl('solve-mode').value = mode; getEl('opt-target').value = target;
}

// ===== T0：載入 smoke =====
check('app.js 純函式導出成功（computeSettings 為函式）', typeof T.computeSettings === 'function');
check('effectiveStats/hqPercent/recipeMaxes 均為函式',
  typeof T.effectiveStats === 'function' && typeof T.hqPercent === 'function' && typeof T.recipeMaxes === 'function');

// ===== T1：computeSettings baseline（spec §4 golden：base_progress 250、base_quality 266）=====
{
  setInputs({});
  const s = T.computeSettings(recipe100, rlv640, gear);
  eqObj('T1 computeSettings baseline 全欄 golden', s, {
    max_cp: 600, max_durability: 70, max_progress: 4400, max_quality: 9000,
    base_progress: 250, base_quality: 266, job_level: 90,
    use_manipulation: true, use_heart_and_soul: false, use_quick_innovation: false,
    use_trained_eye: false, adversarial: false,
    backload_progress: false, stellar_steady_hand_charges: 0,
    target_quality: 9000, initial_quality: 0,
  });
}

// ===== T2：M1 專家之證 → 作業/加工 +20、CP +15（本輪修復；金鎖）=====
{
  setInputs({ specialist: true });
  const s = T.computeSettings(recipe100, rlv640, gear);
  eq('T2 專家之證 CP +15（max_cp 600→615）', s.max_cp, 615);
  eq('T2 專家之證 作業 +20（base_progress 250→251）', s.base_progress, 251);
  eq('T2 專家之證 加工 +20（base_quality 266→267）', s.base_quality, 267);
  // effectiveStats 直驗 +20/+20/+15
  eqObj('T2 effectiveStats(+20/+20/+15)', T.effectiveStats(gear), { cms: 4068, ctrl: 4000, cp: 615 });
}
{
  setInputs({ specialist: false });
  eqObj('T2b effectiveStats 無專家＝原值', T.effectiveStats(gear), { cms: 4048, ctrl: 3980, cp: 600 });
}

// ===== T3：computeSettings 模式/技能閘 golden =====
{
  setInputs({ mode: 'nq' });                                   // NQ 模式 → target_quality 0
  eq('T3 NQ 模式 target_quality=0', T.computeSettings(recipe100, rlv640, gear).target_quality, 0);
}
{
  setInputs({ target: '5000' });                               // 指定目標品質（< max）
  eq('T3 指定 target=5000 帶入', T.computeSettings(recipe100, rlv640, gear).target_quality, 5000);
  setInputs({ target: '99999' });                              // 超上限 → clamp 到 max_quality
  eq('T3 target 超上限 clamp 到 max_quality', T.computeSettings(recipe100, rlv640, gear).target_quality, 9000);
}
{
  setInputs({});
  const lv100 = { ...gear, level: 100 };                       // 等級 ≥ rlv+10 → 精修之眼開
  eq('T3 use_trained_eye（lv100 ≥ 90+10）', T.computeSettings(recipe100, rlv640, lv100).use_trained_eye, true);
  const expert = { ...recipe100, is_expert: true };
  setInputs({ adv: true });
  const se = T.computeSettings(expert, rlv640, lv100);
  eq('T3 高難度配方 → use_trained_eye 強制關', se.use_trained_eye, false);
  eq('T3 高難度配方 → adversarial 強制關', se.adversarial, false);
}

// ===== T4：hqPercent 斷點抽樣（品質% → HQ%；含邊界 100/99/98、5/2、0、超上限、maxQ=0）=====
{
  const M = 9000;
  eq('T4 hqPercent p=100 → 100', T.hqPercent(9000, M), 100);
  eq('T4 hqPercent p=99 → 98（邊界）', T.hqPercent(8910, M), 98);
  eq('T4 hqPercent p=98 → 96（邊界）', T.hqPercent(8820, M), 96);
  eq('T4 hqPercent p=75 → 47', T.hqPercent(6750, M), 47);
  eq('T4 hqPercent p=50 → 15', T.hqPercent(4500, M), 15);
  eq('T4 hqPercent p=5 → 2（邊界）', T.hqPercent(450, M), 2);
  eq('T4 hqPercent p=2 → null（表 1-4% 缺口）', T.hqPercent(180, M), null);
  eq('T4 hqPercent p=0 → 1', T.hqPercent(0, M), 1);
  eq('T4 hqPercent 品質溢出上限 → 夾到 100', T.hqPercent(9500, M), 100);
  eq('T4 hqPercent maxQuality=0 → null（守衛）', T.hqPercent(500, 0), null);
}

// ===== T5：recipeMaxes 三上限（顯示與求解共用算式；floor）=====
{
  eqObj('T5 recipeMaxes factor=100', T.recipeMaxes(recipe100, rlv640),
    { max_progress: 4400, max_quality: 9000, max_durability: 70 });
  const rf = { difficulty_factor: 50, quality_factor: 90, durability_factor: 100 };
  eqObj('T5 recipeMaxes 非整除 → floor', T.recipeMaxes(rf, { difficulty: 4401, quality: 9005, durability: 70 }),
    { max_progress: 2200, max_quality: 8104, max_durability: 70 });
}

// ===== T6：安全哨兵（sec A1/A2 修復固化，防回歸）=====
{
  // sec A1：gear.level render 前必 Number() 硬化（localStorage self-XSS sink）— 裸插 ${g.level || …} 復活即紅燈
  check('T6 sec-A1：無裸插 ${g.level || …}（須 Number(g.level)）',
    !/\$\{\s*g\.level\s*\|\|/.test(APP_SRC), '偵測到裸插 g.level（應為 Number(g.level)）');
  check('T6 sec-A1：Number(g.level) 硬化在位', /Number\(g\.level\)/.test(APP_SRC));

  // sec A2：禁空 catch（saveGear 已補 console.warn + toast）— 去註解後不得殘留 catch(){}
  const stripped = APP_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const empties = stripped.match(/catch\s*(\([^)]*\))?\s*\{\s*\}/g) || [];
  check('T6 sec-A2：無空 catch 區塊（失敗至少 console.warn）', empties.length === 0, `空 catch ${empties.length} 處`);
}

// ===== T7：crafting-list aggregateMats（清單素材彙總純函式；獨立 vm 載 crafting-list.js）=====
{
  const CL_SRC = fs.readFileSync(path.join(ROOT, 'crafting-list.js'), 'utf8');
  const clSandbox = { console };
  clSandbox.globalThis = clSandbox;
  vm.createContext(clSandbox);
  vm.runInContext(CL_SRC, clSandbox, { filename: 'crafting-list.js' });
  const agg = clSandbox.CraftList.aggregateMats;
  const ING = { '100': [[5, 2], [8, 1], [16, 3]], '200': [[5, 1], [9, 4]] };
  const J = JSON.stringify;
  eq('T7 aggregateMats 跨配方同素材加總×qty', J(agg([{ id: 100, qty: 2 }, { id: 200, qty: 1 }], ING)),
    J([[5, 5], [8, 2], [9, 4], [16, 6]]));
  eq('T7 aggregateMats qty=0/NaN → clamp 1', J(agg([{ id: 100, qty: 0 }], ING)), J([[5, 2], [8, 1], [16, 3]]));
  eq('T7 aggregateMats qty>999 → clamp 999', J(agg([{ id: 200, qty: 5000 }], ING)), J([[5, 999], [9, 3996]]));
  eq('T7 aggregateMats 未知配方 id 略過', J(agg([{ id: 999, qty: 3 }], ING)), J([]));
  eq('T7 aggregateMats 空清單 → []', J(agg([], ING)), J([]));
}

// ===== T8：marketboard 深連結 helper 契約（來源整合；痛點2 對抗審回歸）=====
{
  // route 契約用 endsWith/regex，不鎖死 base URL → dev(localhost)/prod(pages.dev) 環境無關（對抗審：勿寫死 localhost URL）
  check('T8 mbItem → …#/item/{iid}', /#\/item\/5468$/.test(T.mbItem(5468)));
  check('T8 mbCraft → …#/craft/{itemId}', /#\/craft\/12345$/.test(T.mbCraft(12345)));
  check('T8 item(查價) 與 craft(BOM) route 前綴不混淆', /#\/item\//.test(T.mbItem(1)) && /#\/craft\//.test(T.mbCraft(1)) && T.mbItem(1) !== T.mbCraft(1));
  // 型別收斂：非正整數 id 不得產出壞連結（#/item/undefined、NaN…），一律回退 '#'
  check('T8 壞輸入(undefined/字串/0/負/null/NaN) → #',
    [undefined, 'abc', 0, -1, null, NaN].every((bad) => T.mbItem(bad) === '#' && T.mbCraft(bad) === '#'));
  check('T8 合法數字字串 id 收斂為數字', /#\/item\/42$/.test(T.mbItem('42')));
}

// ===== T9：selectRecipe 回傳契約（goSolve 失敗不切頁的守衛依據；對抗審狀態機覆蓋）=====
{
  // harness 無資料（loadData fetch reject → RECIPES=[]）→ 任何 id 皆找不到配方 → 必回 false（goSolve 據此不切頁）
  eq('T9 selectRecipe 未知 id → false', T.selectRecipe(999999), false);
}

// ===== T10：crafting-list add/has/count 契約 + 上限誠實（對抗審 codex/grok：清單同步 + cap 謊報回歸鎖）=====
{
  const CL_SRC = fs.readFileSync(path.join(ROOT, 'crafting-list.js'), 'utf8');
  const stubEl = () => ({ innerHTML: '', textContent: '', dataset: {},
    classList: { toggle() {}, add() {}, remove() {} },
    querySelector() { return null; }, querySelectorAll() { return []; },
    appendChild() {}, addEventListener() {}, onclick: null });
  const box = { store: null };  // localStorage 後備
  const cl = {
    console,
    localStorage: { getItem() { return box.store; }, setItem(k, v) { box.store = v; }, removeItem() { box.store = null; } },
    document: { getElementById() { return stubEl(); }, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return stubEl(); }, body: stubEl() },
  };
  cl.globalThis = cl;
  vm.createContext(cl);
  vm.runInContext(CL_SRC, cl, { filename: 'crafting-list.js' });
  const CL = cl.CraftList;
  const RECIPES = [{ id: 100, item_name: '鐵錠' }, { id: 200, item_name: '鋼錠' }];
  let notifyN = 0; const toasts = [];
  const mkDeps = () => ({ $: () => stubEl(), esc: (s) => s, iconUrl: () => '', RECIPES,
    ITEMS: {}, INGREDIENTS: {}, selectRecipe() {}, switchTab() {}, showPicker() {},
    toast: (m, v) => toasts.push([m, v]), copyText() {}, mbItem: () => '#', mbCraft: () => '#',
    onChange: () => { notifyN++; }, goSolve() {} });

  box.store = null; CL.init(mkDeps());                    // 空清單起步
  eq('T10 count 空清單 → 0', CL.count(100), 0);
  eq('T10 has 空清單 → false', CL.has(100), false);
  CL.add(100);
  eq('T10 add 新配方 → count 1 + has true', CL.count(100) === 1 && CL.has(100) === true, true);
  CL.add(100);
  eq('T10 add 既有 → count 2', CL.count(100), 2);
  eq('T10 未知 id add 無效（byId 無 → 不入清單）', (CL.add(999), CL.has(999)), false);
  eq('T10 每次有效 add 觸發 onChange 一次（共 2）', notifyN, 2);

  // 上限誠實：load 一筆 qty=999，再 add 不得超界／不得謊報 +1／不得觸發無效 onChange
  box.store = JSON.stringify([{ id: 200, qty: 999 }]);
  notifyN = 0; toasts.length = 0;
  CL.init(mkDeps());
  eq('T10 load qty 上限帶入 999', CL.count(200), 999);
  CL.add(200);
  eq('T10 add 到上限 → count 仍 999（不超界）', CL.count(200), 999);
  eq('T10 add 到上限 → 不觸發 onChange', notifyN, 0);
  const lt = toasts[toasts.length - 1] || ['', ''];
  check('T10 add 到上限 → warn toast 且不謊報 +1', lt[1] === 'warn' && !/\+1/.test(lt[0]), JSON.stringify(lt));
}

// ===== T12：crafting-list 成品採購清單 CSV（送端契約 + 三道收端上限）=====
{
  const CL_SRC = fs.readFileSync(path.join(ROOT, 'crafting-list.js'), 'utf8');
  const cl = { console };
  cl.globalThis = cl;
  vm.createContext(cl);
  vm.runInContext(CL_SRC, cl, { filename: 'crafting-list.js' });
  const build = cl.CraftList.buildShoplistCsv;
  const recipes = new Map([
    [100, { item_id: 5000, item_amount: 3 }],
    [200, { item_id: 6000 }],
    [201, { item_id: 5000, item_amount: 2 }],
    [300, {}],
  ]);
  const J = JSON.stringify;
  eq('T12 正常 CSV 使用成品 id 並計算 yield', J(build([{ id: 100, qty: 2 }], recipes)),
    J({ csv: '5000:6', error: null, count: 1, invalidCount: 0 }));
  eq('T12 同 item_id 合併不同配方產量', J(build([{ id: 100, qty: 1 }, { id: 201, qty: 2 }], recipes)),
    J({ csv: '5000:7', error: null, count: 1, invalidCount: 0 }));
  eq('T12 空清單 → null CSV', J(build([], recipes)),
    J({ csv: null, error: null, count: 0, invalidCount: 0 }));
  const overTypes = new Map(Array.from({ length: 101 }, (_, i) => [i + 1, { item_id: 10000 + i }]));
  const overTypeResult = build(Array.from({ length: 101 }, (_, i) => ({ id: i + 1, qty: 1 })), overTypes);
  check('T12 成品種類超過 100 → error', overTypeResult.error !== null && overTypeResult.count === 101);
  const overQtyResult = build([{ id: 100, qty: 10000 }], recipes);
  check('T12 單項 finished qty 超過 9999 → error', overQtyResult.error !== null && overQtyResult.count === 1);
  const longRecipes = new Map(Array.from({ length: 100 }, (_, i) => [i + 1, { item_id: 1000000000000001 + i }]));
  const longResult = build(Array.from({ length: 100 }, (_, i) => ({ id: i + 1, qty: 1 })), longRecipes);
  check('T12 CSV 超過 1800 字元 → error', longResult.error !== null && longResult.count === 100);
  eq('T12 無 item_id 略過並計 invalidCount', J(build([{ id: 100, qty: 1 }, { id: 300, qty: 4 }], recipes)),
    J({ csv: '5000:3', error: null, count: 1, invalidCount: 1 }));
  eq('T12 多 item_id 依 itemId 升冪排序（反序輸入 → 穩定輸出）', J(build([{ id: 200, qty: 1 }, { id: 100, qty: 1 }], recipes)),
    J({ csv: '5000:3,6000:1', error: null, count: 2, invalidCount: 0 }));
}

// ===== T11：app-browse.js 配方瀏覽層（對抗審 codex/grok：拆分後瀏覽層需真測，非靠 app.js 公式閘背書）=====
{
  const AB_SRC = fs.readFileSync(path.join(ROOT, 'app-browse.js'), 'utf8');
  const els = {};
  const abEl = () => ({ value: '', textContent: '', innerHTML: '', dataset: {},
    classList: { toggle() {}, add() {}, remove() {} },
    querySelector() { return null; }, querySelectorAll() { return []; },
    appendChild() {}, addEventListener() {}, onclick: null, onkeydown: null });
  const $ = (id) => els[id] || (els[id] = abEl());
  const ab = { console, document: { createElement: abEl, getElementById: $ } };
  ab.globalThis = ab;
  vm.createContext(ab);
  vm.runInContext(AB_SRC, ab, { filename: 'app-browse.js' });
  const CB = ab.CraftBrowse;
  const DOH = ['木工', '鍛造', '甲冑', '金工', '皮革', '裁縫', '鍊金', '烹調'];
  const DEP = { $, esc: (s) => String(s), iconUrl: () => '', DOH, JOB_ICON: {},
    NAME_COLLATOR: new Intl.Collator('zh-Hant'), getRINDEX: () => rindex, getSelected: () => null,
    selectRecipe: () => {}, toast: () => {} };

  // init 缺依賴 assert（grok F5）
  let threwMiss = false;
  try { CB.init({ $ }); } catch (e) { threwMiss = /缺依賴/.test(e.message); }
  check('T11 init 缺依賴 → 早炸（注入契約不變量）', threwMiss);

  let rindex = [
    { id: 1, name: '青銅錠', job: '鍛造', rlv: 10, level: 5, icon: null, category: '金屬' },
    { id: 2, name: '橡木材', job: '木工', rlv: 20, level: 15, icon: null, category: '木材' },
    { id: 3, name: '亞麻布', job: '裁縫', rlv: 30, level: 25, icon: null, category: '布料' },
  ];
  CB.init(DEP);

  CB.renderChips();
  eq('T11 renderChips → 9 顆職業按鈕（全部+8 DoH）', ($('job-chips').innerHTML.match(/job-btn/g) || []).length, 9);

  const rowCount = () => ($('recipe-table').innerHTML.match(/class="rt-row/g) || []).length;
  $('recipe-search').value = ''; $('level-filter').value = ''; $('rlv-filter').value = '';
  CB.renderTable();
  eq('T11 renderTable 無篩選 → 3 列', rowCount(), 3);
  eq('T11 recipe-count 顯示總數', $('recipe-count').textContent, '3 個配方');
  eq('T11 種類副行渲染（rt-cat）', /rt-cat[^>]*>金屬</.test($('recipe-table').innerHTML), true);

  $('recipe-search').value = '青銅'; CB.renderTable();
  eq('T11 搜尋「青銅」→ 1 列', rowCount(), 1);

  // rlvVal 空狀態修正（codex/grok：僅 rlv 篩選 0 命中 → 「無符合配方」非空白）
  $('recipe-search').value = ''; $('rlv-filter').value = '999'; CB.renderTable();
  eq('T11 僅 rlv 篩選 0 命中 → 「無符合配方」', $('recipe-count').textContent, '無符合配方');

  // 分頁（PER_PAGE=60，取代舊的 CAP 120 硬截斷）：130 筆 → 3 頁
  $('rlv-filter').value = '';
  rindex = Array.from({ length: 130 }, (_, i) => ({ id: i + 1, name: '物' + i, job: '鍛造', rlv: 10, level: 5, icon: null, category: '金屬' }));
  CB.renderTable();
  eq('T11 130 筆 → 第 1 頁 60 列', rowCount(), 60);
  eq('T11 recipe-count 顯示總數與頁碼', $('recipe-count').textContent, '130 個配方（第 1 / 3 頁）');
  check('T11 翻頁器渲染上/下一頁 + 頁數資訊',
    /data-pg="prev"/.test($('recipe-pager').innerHTML) && /data-pg="next"/.test($('recipe-pager').innerHTML)
    && /共 130 個配方/.test($('recipe-pager').innerHTML));
  check('T11 第 1 頁「上一頁」停用（不得可按）', /data-pg="prev" disabled/.test($('recipe-pager').innerHTML));

  // 翻到最後一頁：130 = 60+60+10
  const nextBtn = { dataset: { pg: 'next' }, disabled: false, closest: () => nextBtn };
  const fire = () => $('recipe-pager').onclick({ target: nextBtn });
  fire(); eq('T11 翻到第 2 頁 → 仍 60 列', rowCount(), 60);
  fire(); eq('T11 翻到第 3 頁（末頁）→ 餘 10 列', rowCount(), 10);
  check('T11 末頁「下一頁」停用', /data-pg="next" disabled/.test($('recipe-pager').innerHTML));

  // 篩選變更必須回第 1 頁（否則使用者搜完停在不存在的第 3 頁 → 空白表）
  $('recipe-search').value = '物1'; CB.renderTable();
  check('T11 篩選變更 → 回第 1 頁', /第 1 \//.test($('recipe-count').textContent) || !/頁/.test($('recipe-count').textContent));
  $('recipe-search').value = ''; CB.renderTable();
  eq('T11 清空篩選 → 回第 1 頁 60 列', rowCount(), 60);

  // 單頁時翻頁器收起（不留空條、不誤導還有別頁）
  rindex = rindex.slice(0, 10); CB.renderTable();
  eq('T11 只有一頁 → 翻頁器清空', $('recipe-pager').innerHTML, '');
  eq('T11 只有一頁 → recipe-count 不顯示頁碼', $('recipe-count').textContent, '10 個配方');

  // markListState 無 CraftList → 守衛不拋錯（grok F4/F2）
  let threwMLS = false;
  try { CB.markListState(); } catch (e) { threwMLS = true; }
  check('T11 markListState 無 CraftList → 守衛早退不拋錯', !threwMLS);
}

// ===== T13：飛行中求解的世代守衛（2026-07-25 健檢 HIGH）=====
// doSolve 原本只 postMessage(settings)、不帶任何身分；onWorkerMsg 收到就 render。
// 換配方 / 改設定不會取消飛行中的 job（selectRecipe 不 cancelSolve；invalidateResults 在
// results.hidden 時 early return，而求解中正是 hidden）→ 舊配方的結果會蓋在新配方的標題下，
// 玩家可能複製到「配方 A 的手法 + 配方 B 的標題」錯綁巨集。
{
  const SOLVE_SRC = fs.readFileSync(path.join(ROOT, 'app-solve.js'), 'utf8');
  const sent = [];            // worker 收到的訊息
  let onmsg = null;           // app-solve 掛上的 onmessage
  const rendered = [];        // CraftRender.render 的呼叫

  const sbDom = {};
  const sbEl = (id) => sbDom[id] || (sbDom[id] = makeEl());
  const sb = {
    console,
    document: { getElementById: sbEl, createElement() { return makeEl(); } },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Worker: function () {
      this.postMessage = (m) => sent.push(m);
      this.terminate = () => {};
      Object.defineProperty(this, 'onmessage', { set(fn) { onmsg = fn; }, get() { return onmsg; } });
      Object.defineProperty(this, 'onerror', { set() {}, get() { return null; } });
    },
  };
  sb.globalThis = sb;
  sb.CraftRender = { render: (r) => rendered.push(r) };
  vm.createContext(sb);
  vm.runInContext(SOLVE_SRC, sb, { filename: 'app-solve.js' });

  sb.CraftSolve.init({
    $: sbEl,
    toast: () => {},
    PH_HTML: '',
    getSelected: () => ({ recipe: { job: '木工' }, rlv: 700 }),
    gearFor: () => ({ craftsmanship: 4000, control: 4000, cp: 600 }),
    computeSettings: () => ({ base_progress: 100, base_quality: 100 }),
    switchTab: () => {},
  });

  sb.CraftSolve.doSolve();
  const gen1 = sent.at(-1) && sent.at(-1).gen;
  check('T13 doSolve 送出的訊息帶世代號（身分依據）', gen1 !== undefined, `got=${JSON.stringify(sent.at(-1))}`);

  sb.CraftSolve.doSolve();          // 使用者換配方後重新求解
  const gen2 = sent.at(-1) && sent.at(-1).gen;
  check('T13 第二次求解的世代號遞增（新舊可區分）', gen2 !== undefined && gen2 !== gen1, `gen1=${gen1} gen2=${gen2}`);

  // 舊世代（配方 A）的結果晚回 → 必須丟棄
  onmsg({ data: { ok: true, gen: gen1, result: { steps: ['舊配方結果'] } } });
  eq('T13 過期世代的結果不得渲染（否則舊手法配新標題）', rendered.length, 0);

  // 當前世代正常渲染
  onmsg({ data: { ok: true, gen: gen2, result: { steps: ['當前結果'] } } });
  eq('T13 當前世代的結果正常渲染', rendered.length, 1);

  // 取消後，該次求解的結果回來也不得渲染
  sb.CraftSolve.doSolve();
  const gen3 = sent.at(-1).gen;
  sb.CraftSolve.cancelSolve();
  onmsg({ data: { ok: true, gen: gen3, result: { steps: ['已取消的結果'] } } });
  eq('T13 已取消的求解結果不得渲染', rendered.length, 1);

  // 錯誤幀同樣要判世代（舊配方的 NoSolution 不該汙染新配方的 UI）
  let toasted = 0;
  sb.CraftSolve.init({
    $: sbEl, toast: () => { toasted++; }, PH_HTML: '',
    getSelected: () => ({ recipe: { job: '木工' }, rlv: 700 }),
    gearFor: () => ({}), computeSettings: () => ({ base_progress: 100, base_quality: 100 }),
    switchTab: () => {},
  });
  sb.CraftSolve.doSolve();
  const gen4 = sent.at(-1).gen;
  sb.CraftSolve.doSolve();
  onmsg({ data: { ok: false, gen: gen4, error: 'NoSolution' } });
  eq('T13 過期世代的錯誤幀不得 toast（不汙染新求解的 UI）', toasted, 0);

  // 【求解中改設定】invalidateInFlight 必須作廢當前世代（2026-07-27 外審【高】）：
  // invalidateResults 的 early return 看的是 results.hidden，而求解期間正是 hidden →
  // 若不在那之前先作廢，舊 worker 回來時 gen 未變、守衛放行 → 舊設定算的手法配新設定的畫面。
  {
    let toasted2 = 0, focused = 0;
    const btn = sbEl('solve-btn'); btn.focus = () => { focused++; };
    sb.CraftSolve.init({
      $: sbEl, toast: () => { toasted2++; }, PH_HTML: '',
      getSelected: () => ({ recipe: { job: '木工' }, rlv: 700 }),
      gearFor: () => ({}), computeSettings: () => ({ base_progress: 100, base_quality: 100 }),
      switchTab: () => {},
    });
    const before = rendered.length;
    sb.CraftSolve.doSolve();
    const genA = sent.at(-1).gen;
    sbEl('cancel-btn').hidden = false;                    // setSolving(true) 的效果（stub 不自動連動）
    eq('T13 求解中 invalidateInFlight → 回報真的取消了', sb.CraftSolve.invalidateInFlight(), true);
    onmsg({ data: { ok: true, gen: genA, result: { steps: ['改設定前算的舊結果'] } } });
    eq('T13 改設定作廢後，舊世代結果不得渲染', rendered.length, before);
    // 自動作廢**不得**搶焦點：使用者可能正在打字改目標品質
    eq('T13 自動作廢不移焦到求解鈕（不打斷輸入）', focused, 0);
    eq('T13 自動作廢不跳「已取消求解」toast（非使用者主動取消）', toasted2, 0);
    sbEl('cancel-btn').hidden = true;
    eq('T13 未求解時 invalidateInFlight → false（不做事）', sb.CraftSolve.invalidateInFlight(), false);
  }

  // worker.js 契約：必須把 gen 原樣回傳，否則主執行緒無從比對
  const WORKER_SRC = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8');
  check('T13 worker.js 回傳訊息帶回 gen（世代守衛的另一半）',
    /gen/.test(WORKER_SRC) && /postMessage\(\s*\{[^}]*gen/.test(WORKER_SRC),
    'worker.js 未回傳 gen → 主執行緒收到的訊息無身分，守衛失效');
}

// ===== T14：app-flow.js 流程引導狀態機（設計系統 §功能頁引導標準的可測落點）=====
// 「現在該做什麼」是純函式決定的 → 這裡鎖住四條驗收線裡機械可驗的兩條：
//   ② 多步流程要有當前步驟指示（完成／進行中／待辦三態齊全、且同時只有一步 current）
//   ② 上游變更必須使下游失效（有結果 → invalidateResults 後 hasResult=false → ③ 退回待辦）
{
  const FLOW_SRC = fs.readFileSync(path.join(ROOT, 'app-flow.js'), 'utf8');
  const fl = { console };
  fl.globalThis = fl;
  vm.createContext(fl);
  vm.runInContext(FLOW_SRC, fl, { filename: 'app-flow.js' });
  const flowState = fl.CraftFlow.flowState;
  const states = (ctx) => flowState(ctx).steps.map(s => s.state).join(',');
  const curCount = (ctx) => flowState(ctx).steps.filter(s => s.state === 'current' || s.state === 'blocked').length;

  eq('T14 冷啟動（未選配方）→ ① 進行中、②③ 待辦', states({}), 'current,todo,todo');
  check('T14 冷啟動的下一步指向選配方', /①/.test(flowState({}).next));

  const picked = { hasRecipe: true, recipeName: '2級耐力之寶水', job: '鍊金' };
  eq('T14 選了配方但缺角色數值 → ② 無法進行（不是待辦，要看得出卡住）',
    states({ ...picked, gearOk: false }), 'done,blocked,todo');
  check('T14 缺數值時下一步寫出「哪個職業要填什麼」',
    /鍊金/.test(flowState({ ...picked, gearOk: false }).next) && /角色數值/.test(flowState({ ...picked, gearOk: false }).next));

  eq('T14 配方+數值齊備、尚未求解 → ② 進行中', states({ ...picked, gearOk: true }), 'done,current,todo');
  eq('T14 求解中 → ③ 進行中', states({ ...picked, gearOk: true, solving: true }), 'done,done,current');
  eq('T14 有結果 → 三步皆完成', states({ ...picked, gearOk: true, hasResult: true }), 'done,done,done');

  // 上游變更使下游失效：同一組輸入只把 hasResult 拿掉（＝invalidateResults 後）→ ③ 必須退回待辦
  eq('T14 設定變更使結果失效 → ③ 退回待辦（不得停在完成）',
    states({ ...picked, gearOk: true, hasResult: false }), 'done,current,todo');
  // 換配方（回列表 → hasRecipe false）→ 整條流程回到 ①
  eq('T14 回配方列表 → 流程回到 ①', states({ hasRecipe: false, hasResult: false }), 'current,todo,todo');

  // 「同時只有一個進行中」——兩處高亮＝使用者不知道該看哪
  check('T14 任一情境同時只有一步進行中', [
    {}, { ...picked, gearOk: false }, { ...picked, gearOk: true },
    { ...picked, gearOk: true, solving: true }, { ...picked, gearOk: true, hasResult: true },
  ].every(c => curCount(c) <= 1));

  // 每步都要有非空文案（步驟軸不得出現空白格）
  check('T14 每步都有標題與說明、且必有「下一步」文案', [
    {}, { ...picked, gearOk: false }, { ...picked, gearOk: true, hasResult: true },
  ].every(c => { const st = flowState(c); return st.next && st.steps.every(s => s.title && s.note); }));

  // init 缺依賴早炸（同 CraftBrowse 注入契約）
  let flowMiss = false;
  try { fl.CraftFlow.init({ $: () => ({}) }); } catch (e) { flowMiss = /缺依賴/.test(e.message); }
  check('T14 CraftFlow.init 缺依賴 → 早炸（注入契約不變量）', flowMiss);
}

// ===== T15：app-consumable.js 食物/藥水選擇層（自繪 listbox 取代原生 select 後，選擇與保存需真測）=====
{
  const CS_SRC = fs.readFileSync(path.join(ROOT, 'app-consumable.js'), 'utf8');
  const els = {};
  const csEl = () => ({ checked: false, value: '', innerHTML: '', hidden: true, open: false, dataset: {},
    classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, focus() {}, scrollIntoView() {} });
  const $ = (id) => els[id] || (els[id] = csEl());
  const store = {};
  const cs = { console, document: { getElementById: $, addEventListener() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
  cs.globalThis = cs;
  vm.createContext(cs);
  vm.runInContext(CS_SRC, cs, { filename: 'app-consumable.js' });
  const CS = cs.CraftConsumable;
  const DEP = { $, esc: (s) => String(s), iconUrl: () => '', toast: () => {}, onChange: () => {} };

  let csMiss = false;
  try { CS.init({ $ }); } catch (e) { csMiss = /缺依賴/.test(e.message); }
  check('T15 CraftConsumable.init 缺依賴 → 早炸（注入契約不變量）', csMiss);

  const MEALS = [
    { name: '低品級料理', level: 640, is_hq: false, cm: 3, cm_max: 90, ct: null, ct_max: null, cp: 10, cp_max: 50, icon: '/i/024000/024001.png' },
    { name: '低品級料理', level: 640, is_hq: true, cm: 4, cm_max: 100, ct: null, ct_max: null, cp: 12, cp_max: 60, icon: '/i/024000/024001.png' },
    { name: '高品級料理', level: 750, is_hq: false, cm: null, cm_max: null, ct: 4, ct_max: 92, cp: 21, cp_max: 80, icon: '/i/024000/024107.png' },
    { name: '高品級料理', level: 750, is_hq: true, cm: null, cm_max: null, ct: 5, ct_max: 115, cp: 26, cp_max: 100, icon: '/i/024000/024107.png' },
    { name: '無加成點心', level: 700, is_hq: false, cm: null, cm_max: null, ct: null, ct_max: null, cp: null, cp_max: null, icon: null },
  ];
  const MEDS = [
    { name: '強化藥', level: 675, is_hq: false, cm: null, cm_max: null, ct: null, ct_max: null, cp: 5, cp_max: 21, icon: '/i/020000/020001.png' },
    { name: '強化藥', level: 675, is_hq: true, cm: null, cm_max: null, ct: null, ct_max: null, cp: 6, cp_max: 27, icon: '/i/020000/020001.png' },
  ];

  check('T15 無作業/加工/CP 加成的品項不進選單（選了也沒用）', !CS.build(MEALS)['無加成點心'] && !!CS.build(MEALS)['高品級料理']);
  eq('T15 功效文字含百分比與上限（高品級的意義在上限，只印 % 看不出差別）',
    CS.effText(MEALS[3]), '加工 +5%（≤115）・CP +26%（≤100）');
  eq('T15 只有部分加成的品項不印空欄位', CS.effText(MEDS[1]), 'CP +6%（≤27）');

  CS.init(DEP);
  CS.setData(MEALS, MEDS);
  eq('T15 選單依物品品級高→低排序', JSON.stringify(CS.names('food')), JSON.stringify(['高品級料理', '低品級料理']));
  eq('T15 未選時 get 回 null、label 為空', JSON.stringify([CS.get('food'), CS.label('food')]), JSON.stringify([null, '']));

  // 保存往返：寫入 → 新 sandbox 重載 → 選擇/HQ/專家之證/展開狀態都要回來（重開瀏覽器不遺失）
  store['ffxiv-crafter-consumables-v1'] = JSON.stringify({ food: '高品級料理', potion: '強化藥', foodHq: false, potionHq: true, specialist: true, open: false });
  const cs2 = { console, document: { getElementById: $, addEventListener() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
  cs2.globalThis = cs2;
  vm.createContext(cs2);
  vm.runInContext(CS_SRC, cs2, { filename: 'app-consumable.js' });
  const CS2 = cs2.CraftConsumable;
  CS2.init(DEP);
  CS2.setData(MEALS, MEDS);
  eq('T15 重載後回復選擇（食物）', CS2.label('food'), '高品級料理');
  eq('T15 重載後回復 HQ 勾選狀態（食物 NQ / 藥水 HQ）',
    JSON.stringify([$('food-hq').checked, $('potion-hq').checked]), JSON.stringify([false, true]));
  eq('T15 重載後回復專家之證與展開狀態', JSON.stringify([$('specialist').checked, $('consumable-block').open]), JSON.stringify([true, false]));
  eq('T15 HQ 未勾 → get 回 NQ 版本（加成較低）', CS2.get('food').cp, 21);
  $('food-hq').checked = true;
  eq('T15 HQ 勾選 → get 回 HQ 版本', CS2.get('food').cp, 26);

  // 資料改版後保存值可能已不存在 → 必須清掉，不留「選了但算不出加成」的幽靈狀態
  CS2.setData([MEALS[2], MEALS[3]], []);
  eq('T15 保存的品項在新資料中消失 → 清除選擇（不留幽靈）',
    JSON.stringify([CS2.label('potion'), CS2.get('potion')]), JSON.stringify(['', null]));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

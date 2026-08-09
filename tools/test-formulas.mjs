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
const GEAR_SRC = fs.readFileSync(path.join(ROOT, 'app-gear.js'), 'utf8');
const RECIPE_SRC = fs.readFileSync(path.join(ROOT, 'app-recipe.js'), 'utf8');
const RENDER_SRC = fs.readFileSync(path.join(ROOT, 'app-render.js'), 'utf8'); // 結果渲染層（hqPercent 純函式住此）
const CSS_SRC = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');       // T17 首載空間預留（CLS）規則哨兵
const HANDWRITTEN_JS = ['app.js', 'app-flow.js', 'app-render.js', 'app-solve.js', 'app-browse.js',
  'app-consumable.js', 'app-quality-stages.js', 'app-level-sync.js', 'crafting-list.js', 'worker.js'];

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
vm.runInContext(GEAR_SRC, sandbox, { filename: 'app-gear.js' });
vm.runInContext(RECIPE_SRC, sandbox, { filename: 'app-recipe.js' });
vm.runInContext(RENDER_SRC, sandbox, { filename: 'app-render.js' }); // 先定義 globalThis.CraftRender（hqPercent 純函式、不需 init）
vm.runInContext(
  APP_SRC + '\n;globalThis.__t = { computeSettings, recipeMaxes, effectiveStats, esc, mbItem, mbCraft, selectRecipe, DOH, JOB_ICON, hqPercent: globalThis.CraftRender.hqPercent };',
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
const gearSpec = { ...gear, specialist: true };   // 同一角色但該職業持有專家之證

// 設 computeSettings 讀的所有 DOM 輸入（求解選項 / 消耗品），求純函式決定性。
// 專家之證**不在此列**：2026-08-09 起它是「角色數值」分頁裡該職業的狀態，由 gear.specialist 帶入
// （gearFor 附上），故測法＝換 gear fixture，不是撥 DOM 開關。
function setInputs({ mode = 'quality', target = '', manip = true, heart = false, qi = false, backload = false, adv = false } = {}) {
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
  setInputs({});
  const s = T.computeSettings(recipe100, rlv640, gearSpec);
  eq('T2 專家之證 CP +15（max_cp 600→615）', s.max_cp, 615);
  eq('T2 專家之證 作業 +20（base_progress 250→251）', s.base_progress, 251);
  eq('T2 專家之證 加工 +20（base_quality 266→267）', s.base_quality, 267);
  // effectiveStats 直驗 +20/+20/+15
  eqObj('T2 effectiveStats(+20/+20/+15)', T.effectiveStats(gearSpec), { cms: 4068, ctrl: 4000, cp: 615 });
}
{
  setInputs({});
  eqObj('T2b effectiveStats 無專家＝原值', T.effectiveStats(gear), { cms: 4048, ctrl: 3980, cp: 600 });
}

// ===== T22：effectiveStats 食物／藥水加成 golden（百分比、上限、base 與專家之證順序）=====
{
  const oldCraftConsumable = sandbox.CraftConsumable;
  let fixture = { food: null, potion: null };
  sandbox.CraftConsumable = { get: (kind) => fixture[kind] || null };
  try {
    setInputs({});
    fixture = { food: { cm: 7, cm_max: 999 }, potion: null };
    eqObj('T22 百分比加成取 floor', T.effectiveStats(gear),
      { cms: 4048 + Math.floor(4048 * 7 / 100), ctrl: 3980, cp: 600 });

    fixture = { food: { cm: 10, cm_max: 5 }, potion: null };
    eqObj('T22 硬上限小於百分比結果時取上限', T.effectiveStats(gear),
      { cms: 4048 + 5, ctrl: 3980, cp: 600 });

    fixture = { food: { cm: 3, cm_max: 999 }, potion: { cm: 4, cm_max: 999 } };
    eqObj('T22 食物與藥水都以原始 base 計算', T.effectiveStats(gear),
      { cms: 4048 + Math.floor(4048 * 3 / 100) + Math.floor(4048 * 4 / 100), ctrl: 3980, cp: 600 });

    fixture = { food: { cm: 10, cm_max: 999, ct: 10, ct_max: 999, cp: 10, cp_max: 999 }, potion: null };
    eqObj('T22 專家之證先疊入食藥加成 base', T.effectiveStats(gearSpec),
      {
        cms: 4068 + Math.floor(4068 * 10 / 100),
        ctrl: 4000 + Math.floor(4000 * 10 / 100),
        cp: 615 + Math.floor(615 * 10 / 100),
      });
  } finally {
    sandbox.CraftConsumable = oldCraftConsumable;
  }
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

// ===== T23：專心致志／快速改革必須隨專家之證 gate =====
// 沒有 Soul of the Crafter 就沒有這兩個技能；公式層必須是最後一道防線，不能只靠 UI disabled。
{
  setInputs({ heart: true, qi: true });
  const noSpecialist = T.computeSettings(recipe100, rlv640, gear);
  eq('T23 無專家之證 → 專心致志強制關', noSpecialist.use_heart_and_soul, false);
  eq('T23 無專家之證 → 快速改革強制關', noSpecialist.use_quick_innovation, false);

  const specialist = T.computeSettings(recipe100, rlv640, gearSpec);
  eq('T23 有專家之證 → 專心致志可用', specialist.use_heart_and_soul, true);
  eq('T23 有專家之證 → 快速改革可用', specialist.use_quick_innovation, true);

  // gate 的程式化 uncheck 不得反向保存，把玩家暫時拔證後的偏好永久清掉。
  const mkCtx = (store) => {
    const els = {};
    const el = () => ({ checked: false, value: '', innerHTML: '', textContent: '', hidden: true,
      disabled: false, max: '', min: '', placeholder: '', dataset: {}, style: {},
      classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, getAttribute: () => null,
      addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
      appendChild() {}, removeChild() {}, insertAdjacentHTML() {}, focus() {}, scrollIntoView() {}, select() {} });
    const ctx = {
      console, document: { getElementById: (id) => els[id] || (els[id] = el()), querySelector: () => null,
        querySelectorAll: () => [], createElement: el, body: el() },
      location: { hostname: 'localhost', search: '' }, window: {},
      localStorage: { getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
      Worker: function () { this.postMessage = () => {}; this.terminate = () => {}; },
      fetch: () => Promise.reject(new Error('test: no network')),
      setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams,
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(GEAR_SRC, ctx, { filename: 'app-gear-t23.js' });
    vm.runInContext(RECIPE_SRC, ctx, { filename: 'app-recipe-t23.js' });
    vm.runInContext(APP_SRC, ctx, { filename: 'crafter-app-t23.js' });
    return ctx;
  };
  const store = { 'ffxiv-crafter-solve-opts-v1': JSON.stringify({ 'opt-heart': true, 'opt-qi': false }) };
  const ctx = mkCtx(store);
  ctx.loadSolveOpts();
  ctx.refreshSpecialistGate();
  eq('T23 gate 強制 uncheck 不覆寫已保存的專心致志偏好',
    JSON.parse(store['ffxiv-crafter-solve-opts-v1'])['opt-heart'], true);
}

// ===== T24：角色等級輸入收斂到 0..100（0 ＝未填） =====
// rlv640 的 class_job_level=90 會讓 Lv100/Lv150 走同一公式分支，拿它測 clamp 是空殼；這裡特意用 100。
{
  const rlv100 = { ...rlv640, class_job_level: 100 };
  setInputs({});
  const lv100 = T.computeSettings(recipe100, rlv100, { ...gear, level: 100 });
  const lv150 = T.computeSettings(recipe100, rlv100, { ...gear, level: 150 });
  eq('T24 新 fixture：Lv100 吃等級懲罰（base_progress=250）', lv100.base_progress, 250);
  eq('T24 新 fixture：Lv150 不吃等級懲罰（base_progress=313）', lv150.base_progress, 313);
  eq('T24 新 fixture：Lv100 use_trained_eye=false', lv100.use_trained_eye, false);
  eq('T24 新 fixture：Lv150 use_trained_eye=true', lv150.use_trained_eye, true);

  const mkGearCtx = (store) => {
    const els = {};
    const el = () => ({ checked: false, value: '', innerHTML: '', textContent: '', hidden: true,
      disabled: false, max: '', min: '', placeholder: '', dataset: {}, style: {},
      classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, getAttribute: () => null,
      addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
      appendChild() {}, removeChild() {}, insertAdjacentHTML() {}, focus() {}, scrollIntoView() {}, select() {} });
    const ctx = {
      console, document: { getElementById: (id) => els[id] || (els[id] = el()), querySelector: () => null,
        querySelectorAll: () => [], createElement: el, body: el() },
      location: { hostname: 'localhost', search: '' }, window: {},
      localStorage: { getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
      Worker: function () { this.postMessage = () => {}; this.terminate = () => {}; },
      fetch: () => Promise.reject(new Error('test: no network')),
      setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams,
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(GEAR_SRC, ctx, { filename: 'app-gear-t24.js' });
    vm.runInContext(RECIPE_SRC, ctx, { filename: 'app-recipe-t24.js' });
    vm.runInContext(APP_SRC, ctx, { filename: 'crafter-app-t24.js' });
    return ctx;
  };
  const runLevelInput = (raw) => {
    const store = { 'ffxiv-crafter-gearsets-v1': JSON.stringify({ '木工': { level: 100, cms: 4048, ctrl: 3980, cp: 600 } }) };
    const ctx = mkGearCtx(store);
    ctx.loadGear();
    let inputValue = raw;
    let writes = 0;
    const target = {
      dataset: { job: '木工', f: 'level' },
      get value() { return inputValue; },
      set value(v) { writes++; inputValue = String(v); },
    };
    ctx.onGearInput({ target });
    const saved = JSON.parse(store['ffxiv-crafter-gearsets-v1']);
    const gearFor = ctx.gearFor('木工');
    return {
      savedLevel: saved['木工'].level,
      inputValue,
      writes,
      gearFor,
      jobLevel: ctx.computeSettings(recipe100, rlv100, gearFor).job_level,
    };
  };

  const lv150Input = runLevelInput('150');
  eq('T24 onGearInput 將超界等級存成 100', lv150Input.savedLevel, 100);
  eq('T24 gearFor 讀到 clamp 後的等級', lv150Input.gearFor.level, 100);
  eq('T24 clamp 後 computeSettings 只會使用 Lv100', lv150Input.jobLevel, 100);
  eq('T24 Lv150 輸入框回填 100', lv150Input.inputValue, '100');

  const blankInput = runLevelInput('');
  eq('T24 清空等級存成 0（代表未填）', blankInput.savedLevel, 0);
  eq('T24 清空等級輸入框維持空白', blankInput.inputValue, '');
  eq('T24 清空等級 computeSettings 走未填假設 Lv100', blankInput.jobLevel, 100);

  const zeroInput = runLevelInput('0');
  eq('T24 顯式輸入 0 存成 0', zeroInput.savedLevel, 0);
  eq('T24 顯式輸入 0 正規化為空白', zeroInput.inputValue, '');

  const negativeInput = runLevelInput('-5');
  eq('T24 負等級收斂到 0', negativeInput.savedLevel, 0);
  eq('T24 負等級輸入框正規化為空白', negativeInput.inputValue, '');

  const boundaryInput = runLevelInput('100');
  eq('T24 Lv100 邊界存值不變', boundaryInput.savedLevel, 100);
  eq('T24 Lv100 邊界輸入框不變', boundaryInput.inputValue, '100');
  eq('T24 Lv100 邊界不寫回輸入框', boundaryInput.writes, 0);

  const normalInput = runLevelInput('85');
  eq('T24 Lv85 正常值存值不變', normalInput.savedLevel, 85);
  eq('T24 Lv85 正常值輸入框不變', normalInput.inputValue, '85');
  eq('T24 Lv85 正常值不寫回輸入框', normalInput.writes, 0);
}

// ===== T25：角色數值更新不得遺失成果；等級同步改變 rlv 時同步重算三上限 =====
{
  const LS_SRC = fs.readFileSync(path.join(ROOT, 'app-level-sync.js'), 'utf8');
  let invalidated = 0;
  const mkT25Ctx = ({ recipe, rlvTable, syncMap = null, level }) => {
    const els = {}, store = { 'ffxiv-crafter-gearsets-v1': JSON.stringify({ 木工: { level, cms: 4048, ctrl: 3980, cp: 600 } }) };
    const makeEl = () => {
      const attrs = {};
      return { checked: false, value: '', innerHTML: '', textContent: '', hidden: true, disabled: false,
        max: '', min: '', placeholder: '', dataset: {}, style: {}, className: '',
        classList: { toggle() {}, add() {}, remove() {} },
        setAttribute(k, v) { attrs[k] = String(v); }, getAttribute(k) { return attrs[k] ?? null; },
        addEventListener() {}, removeEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
        appendChild() {}, removeChild() {}, insertAdjacentHTML() {}, focus() {}, scrollIntoView() {}, select() {} };
    };
    const ingredients = { _html: '', _inputs: [],
      set innerHTML(v) { this._html = v; this._inputs = [{ value: '0', dataset: { iid: '42', amt: '2' }, addEventListener() {} }]; },
      get innerHTML() { return this._html; },
      querySelectorAll(sel) { return sel === '.ing-hq-in' ? this._inputs : []; }, querySelector() { return null; } };
    const ctx = {
      console: { log() {}, error() {}, warn() {} },
      document: { getElementById: (id) => id === 'ingredients' ? ingredients : (els[id] || (els[id] = makeEl())),
        querySelector() { return null; }, querySelectorAll() { return []; }, body: makeEl(), activeElement: null },
      location: { hostname: 'localhost', search: '' }, window: { FFXIVToast: { show() {} } },
      localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem() {} },
      Worker: function () {}, fetch: () => Promise.reject(new Error('test: no network')),
      setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams,
      CraftFlow: { setTargetMode() {}, update() {} },
      // 換配方必須作廢飛行中的求解（見下方 T25 最後一條）：這個 stub 記錄呼叫次數
      // app.js init 會先呼叫 init/newWorker，stub 缺任一個就會在更早處拋錯（CraftRecipe.init 就跑不到）
      CraftSolve: { init() {}, newWorker() {}, invalidateInFlight() { invalidated++; return false; } },
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(GEAR_SRC, ctx, { filename: 'app-gear-t25.js' });
    vm.runInContext(RECIPE_SRC, ctx, { filename: 'app-recipe-t25.js' });
    vm.runInContext(APP_SRC, ctx, { filename: 'crafter-app-t25.mjs' });
    vm.runInContext(`RECIPES = ${JSON.stringify([recipe])}; RLV = ${JSON.stringify(rlvTable)}; ITEMS = {"42":{"name":"測試素材","can_be_hq":true,"level":100}}; INGREDIENTS = {"${recipe.id}":[[42,2]]};`, ctx);
    if (syncMap) {
      vm.runInContext(LS_SRC, ctx, { filename: 'app-level-sync-t25.js' });
      ctx.CraftSync.setData(syncMap);
    }
    return { ctx, ingredients, store };
  };
  const baseRecipe = { id: 1, item_id: 0, item_name: 'T25 測試配方', job: '木工', rlv: 90,
    difficulty_factor: 100, quality_factor: 100, durability_factor: 100, material_quality_factor: 50, is_expert: false };
  const baseRlv = { id: 90, class_job_level: 90, difficulty: 1000, quality: 1000, durability: 40,
    progress_divider: 130, quality_divider: 115, progress_modifier: 80, quality_modifier: 70 };
  const stable = mkT25Ctx({ recipe: baseRecipe, rlvTable: { 90: baseRlv }, level: 90 });
  stable.ctx.loadGear();
  stable.ctx.selectRecipe(1);
  const stableTarget = stable.ctx.document.getElementById('opt-target');
  stableTarget.value = '432';
  stable.ingredients._inputs[0].value = '1';
  stable.ctx.updateInitial(baseRecipe, 1000);
  const initialBefore = vm.runInContext('computedInitial', stable.ctx);
  stable.ctx.onGearInput({ target: { dataset: { job: '木工', f: 'cms' }, value: '4100' } });
  eq('T25 生效 rlv 不變 → 目標品質保留', stableTarget.value, '432');
  eq('T25 生效 rlv 不變 → computedInitial 保留', vm.runInContext('computedInitial', stable.ctx), initialBefore);
  eq('T25 生效 rlv 不變 → HQ 數量保留', stable.ingredients._inputs[0].value, '1');

  const syncRecipe = { ...baseRecipe, id: 2, item_name: 'T25 同步配方', rlv: 100 };
  const rlv70 = { ...baseRlv, id: 70, class_job_level: 70, difficulty: 700, quality: 700, durability: 30 };
  const rlv100 = { ...baseRlv, id: 100, class_job_level: 100, difficulty: 1000, quality: 1000, durability: 40 };
  const synced = mkT25Ctx({ recipe: syncRecipe, rlvTable: { 70: rlv70, 100: rlv100 }, syncMap: { '2': 100 }, level: 100 });
  synced.ctx.loadGear();
  synced.ctx.selectRecipe(2);
  const syncedTarget = synced.ctx.document.getElementById('opt-target');
  syncedTarget.value = '900';
  synced.ingredients._inputs[0].value = '1';
  synced.ctx.updateInitial(syncRecipe, 1000);
  synced.ctx.onGearInput({ target: { dataset: { job: '木工', f: 'level' }, value: '70' } });
  const activeRlv = vm.runInContext('selected.rlv', synced.ctx);
  eq('T25 改角色等級 → 同步配方生效 rlv 改為 Lv70 基準', activeRlv.id, 70);
  eqObj('T25 改角色等級 → 難度/品質/耐久三上限跟著 rlv 變', synced.ctx.recipeMaxes(syncRecipe, activeRlv),
    { max_progress: 700, max_quality: 700, max_durability: 30 });
  eq('T25 生效 rlv 改變 → 目標品質保留但收在新品質上限', syncedTarget.value, '700');
  // 換配方 → 必須作廢飛行中的求解。T13 只驗了 CraftSolve.invalidateInFlight 本身，
  // **沒有任何測試驗 selectRecipe 真的會呼叫它** —— 2026-08-02 抽 app-recipe.js 時用突變測試發現
  // （把那一行刪掉，239 條全綠）。少了它：舊配方的手法會渲染在新配方標題下，玩家可能複製到錯綁巨集。
  {
    const before = invalidated;
    stable.ctx.selectRecipe(1);
    eq('T25 換配方 → 作廢飛行中的求解（selectRecipe 必須呼叫 invalidateInFlight）',
      invalidated, before + 1);
  }
  eq('T25 生效 rlv 改變 → HQ 數量保留', synced.ingredients._inputs[0].value, '1');
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

  // sec A2：每個 catch 都要有可觀測回報；不能用 regex 截斷巢狀 `{}`，否則 app.js init catch 會誤判。
  const skipJsTrivia = (src, start) => {
    let i = start;
    for (;;) {
      while (/\s/.test(src[i] || '')) i++;
      if (src.startsWith('//', i)) { const nl = src.indexOf('\n', i + 2); i = nl < 0 ? src.length : nl + 1; continue; }
      if (src.startsWith('/*', i)) { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 2; continue; }
      return i;
    }
  };
  const skipJsString = (src, start) => {
    const quote = src[start];
    let i = start + 1;
    while (i < src.length) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === quote) return i + 1;
      i++;
    }
    return src.length;
  };
  const matchingJs = (src, start, open, close) => {
    let depth = 0;
    for (let i = start; i < src.length; i++) {
      if (src[i] === '\'' || src[i] === '"' || src[i] === '`') { i = skipJsString(src, i) - 1; continue; }
      if (src.startsWith('//', i)) { const nl = src.indexOf('\n', i + 2); i = nl < 0 ? src.length : nl; continue; }
      if (src.startsWith('/*', i)) { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 1; continue; }
      if (src[i] === open) depth++;
      else if (src[i] === close && --depth === 0) return i;
    }
    return -1;
  };
  const catchBodies = (src) => {
    const bodies = [];
    for (let i = 0; i < src.length; i++) {
      if (src[i] === '\'' || src[i] === '"' || src[i] === '`') { i = skipJsString(src, i) - 1; continue; }
      if (src.startsWith('//', i)) { const nl = src.indexOf('\n', i + 2); i = nl < 0 ? src.length : nl; continue; }
      if (src.startsWith('/*', i)) { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 1; continue; }
      if (src.slice(i, i + 5) !== 'catch' || /[\w$]/.test(src[i - 1] || '') || /[\w$]/.test(src[i + 5] || '')) continue;
      let j = skipJsTrivia(src, i + 5);
      if (src[j] === '(') { const end = matchingJs(src, j, '(', ')'); if (end < 0) continue; j = skipJsTrivia(src, end + 1); }
      if (src[j] !== '{') continue;
      const end = matchingJs(src, j, '{', '}');
      if (end >= 0) bodies.push(src.slice(j + 1, end));
    }
    return bodies;
  };
  const silentCatches = [];
  for (const file of HANDWRITTEN_JS) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const body of catchBodies(src)) {
      // worker 的 catch 有明確 postMessage 回報，這是唯一的具體白名單，不放寬成整檔跳過。
      if (!body.includes('console.') && !(file === 'worker.js' && /\bpostMessage\s*\(/.test(body))) {
        silentCatches.push(file);
      }
    }
  }
  check('T6 sec-A2：全部手寫 JS 的 catch 都有回報（worker postMessage 為具體白名單）',
    silentCatches.length === 0, silentCatches.length ? `靜默 catch：${silentCatches.join(', ')}` : '');

  // sec A2 行為回歸：壞掉／錯型別的 localStorage 不得靜默當成正常空設定。
  const mkGearLoadCtx = (raw) => {
    const warnings = [], toasts = [];
    const el = () => ({ addEventListener() {}, classList: { toggle() {}, add() {}, remove() {} },
      setAttribute() {}, getAttribute() { return null; }, querySelectorAll() { return []; } });
    const store = { 'ffxiv-crafter-gearsets-v1': raw };
    const ctx = {
      console: { log() {}, error() {}, warn(...args) { warnings.push(args); } },
      document: { getElementById: () => el(), querySelector() { return null; }, querySelectorAll() { return []; }, body: el() },
      location: { hostname: 'localhost', search: '' }, window: { FFXIVToast: { show(...args) { toasts.push(args); } } },
      localStorage: { getItem: (k) => store[k] ?? null, setItem() {}, removeItem() {} },
      Worker: function () {}, fetch: () => Promise.reject(new Error('test: no network')),
      setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams,
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(GEAR_SRC, ctx, { filename: 'app-gear-gear-load.js' });
    vm.runInContext(RECIPE_SRC, ctx, { filename: 'app-recipe-gear-load.js' });
    vm.runInContext(APP_SRC, ctx, { filename: 'crafter-app-gear-load.mjs' });
    ctx.loadGear();
    return { ctx, warnings, toasts };
  };
  const malformed = mkGearLoadCtx('{{{');
  check('T6 sec-A2：壞 JSON 讀取後重置為空物件',
    vm.runInContext('gearsets', malformed.ctx) && Object.keys(vm.runInContext('gearsets', malformed.ctx)).length === 0);
  check('T6 sec-A2：壞 JSON 至少 console.warn 且有一次性提示', malformed.warnings.length > 0 && malformed.toasts.length === 1);
  const wrongType = mkGearLoadCtx(JSON.stringify('a string'));
  check('T6 sec-A2：非物件 JSON 也走重置與回報路徑',
    Object.keys(vm.runInContext('gearsets', wrongType.ctx)).length === 0 && wrongType.warnings.length > 0);
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
    { id: 1, name: '青銅錠', nameSc: '青铜锭', job: '鍛造', rlv: 10, level: 5, icon: null, category: '金屬' },
    { id: 2, name: '橡木材', nameSc: '橡木材', job: '木工', rlv: 20, level: 15, icon: null, category: '木材' },
    { id: 3, name: '亞麻布', nameSc: '亚麻布', job: '裁縫', rlv: 30, level: 25, icon: null, category: '布料' },
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

  // 簡中搜尋：很多人記的是陸服名或直接從簡中攻略貼過來，打簡體查不到會以為工具沒這個配方。
  // **只比對、不顯示**——顯示一律繁中（繁中服至上）。
  $('recipe-search').value = '青铜'; CB.renderTable();
  eq('T11 搜尋簡中「青铜」→ 1 列（簡繁都查得到）', rowCount(), 1);
  eq('T11 簡中命中仍顯示繁中名', /青銅錠/.test($('recipe-table').innerHTML), true);
  $('recipe-search').value = '亚麻'; CB.renderTable();
  eq('T11 搜尋簡中「亚麻」→ 1 列', rowCount(), 1);
  // nameSc 缺失（舊資料／查無簡中名）不得炸掉搜尋
  rindex = [{ id: 9, name: '無簡名物', job: '鍛造', rlv: 10, level: 5, icon: null, category: '金屬' }];
  $('recipe-search').value = '無簡名'; CB.renderTable();
  eq('T11 nameSc 缺失時搜尋仍可用', rowCount(), 1);
  rindex = [
    { id: 1, name: '青銅錠', nameSc: '青铜锭', job: '鍛造', rlv: 10, level: 5, icon: null, category: '金屬' },
    { id: 2, name: '橡木材', nameSc: '橡木材', job: '木工', rlv: 20, level: 15, icon: null, category: '木材' },
    { id: 3, name: '亞麻布', nameSc: '亚麻布', job: '裁縫', rlv: 30, level: 25, icon: null, category: '布料' },
  ];

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
  $('recipe-search').value = '物'; CB.renderTable();
  eq('T11 篩選變更 → 回第 1 頁（結果仍跨 3 頁）', $('recipe-count').textContent, '130 個配方（第 1 / 3 頁）');
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

// ===== T27：WASM 引擎初始化失敗必須可辨識且可重試（B-012）=====
// init() 的 Promise 在 worker 模組層級只建立一次；若把 await ready 與 solve() 共用 catch，
// 該 worker 會永久卡在 reject，玩家只能重新整理。這裡鎖住分流、誠實訊息與「abortSolve→重建 worker」契約。
{
  const SOLVE_SRC = fs.readFileSync(path.join(ROOT, 'app-solve.js'), 'utf8');
  const WORKER_SRC = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8');
  const sent = [];
  let onmsg = null;
  let workerCount = 0;
  const rendered = [];
  const toasted = [];
  const sbDom = {};
  const sbEl = (id) => sbDom[id] || (sbDom[id] = makeEl());
  const sb = {
    console,
    document: { getElementById: sbEl, createElement() { return makeEl(); } },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Worker: function () {
      workerCount++;
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
    toast: (msg) => toasted.push(msg),
    PH_HTML: '',
    getSelected: () => ({ recipe: { job: '木工' }, rlv: 700 }),
    gearFor: () => ({ craftsmanship: 4000, control: 4000, cp: 600 }),
    computeSettings: () => ({ base_progress: 100, base_quality: 100 }),
    switchTab: () => {},
  });

  check('T27 solveErrorMessage 已匯出供分類測試', typeof sb.CraftSolve.solveErrorMessage === 'function');
  for (const raw of ['Failed to fetch', 'expected magic word', 'WebAssembly.instantiate']) {
    const msg = sb.CraftSolve.solveErrorMessage(raw);
    check(`T27 ${raw} → 引擎/網路訊息且不導向調整設定`, /引擎|網路/.test(msg) && !/調整設定/.test(msg), `msg=${msg}`);
  }

  check('T27 worker init/solve 兩種失敗型別都原樣帶回 gen',
    /ok:\s*false,\s*gen,\s*kind:\s*["']init/.test(WORKER_SRC)
      && /ok:\s*false,\s*gen,\s*kind:\s*["']solve/.test(WORKER_SRC));

  sb.CraftSolve.doSolve();
  const failedGen = sent.at(-1).gen;
  onmsg({ data: { ok: false, gen: failedGen, kind: 'init', error: 'Failed to fetch' } });
  // 訊息用 textContent 寫入（純文字，不進 innerHTML）；文案唯一來源＝solveErrorMessage
  check('T27 kind:init → 顯示引擎失敗與重試鈕，不走一般求解失敗文案',
    /求解引擎載入失敗（可能是網路問題）/.test(sbEl('solve-status').textContent)
      && sbEl('solve-retry-btn').hidden === false
      && !/調整設定/.test(sbEl('solve-status').textContent));
  // 2026-08-02 實測：抽掉 pkg/*.wasm 時 Chrome 吐的是這句，只比對 `WebAssembly.instantiate` 會漏掉
  check('T27 實測過的真實引擎失敗字串也要分類為引擎問題',
    /引擎|網路/.test(sb.CraftSolve.solveErrorMessage(
      "Failed to execute 'compile' on 'WebAssembly': HTTP status code is not ok")));
  eq('T27 kind:init → 不跳一般求解失敗 toast', toasted.length, 0);

  const workersBeforeRetry = workerCount;
  sbEl('solve-retry-btn').onclick();
  const retryGen = sent.at(-1).gen;
  check('T27 重試 → abortSolve 先遞增世代、再重建 worker 並送出新世代',
    workerCount === workersBeforeRetry + 1 && retryGen === failedGen + 2,
    `workers=${workerCount} retryGen=${retryGen} failedGen=${failedGen}`);
  eq('T27 重試不 toast「已取消求解」', toasted.filter((msg) => /已取消求解/.test(msg)).length, 0);

  onmsg({ data: { ok: true, gen: failedGen, result: { steps: ['舊結果'] } } });
  eq('T27 重試後舊世代結果不得渲染', rendered.length, 0);
}

// ===== T28：求解計時不應每秒重建 aria-live 節點 + listbox 焦點不可消失（B-014）=====
// live region 的狀態節點必須固定；這裡用 T28 專用 DOM stub 保留節點物件參照，
// 不改共用 makeEl()，避免把其他 sandbox 一起改成「看不出 innerHTML 重建」的假綠。
{
  const SOLVE_SRC = fs.readFileSync(path.join(ROOT, 'app-solve.js'), 'utf8');
  let now = 0;
  let tick = null;
  const els = {};

  function solveNode(text = '', attrs = {}) {
    let value = String(text);
    const attributes = { ...attrs };
    const el = {
      checked: false, value: '', hidden: true, disabled: false, dataset: {}, style: {},
      classList: { toggle() {}, add() {}, remove() {} },
      setAttribute(name, v) { attributes[name] = String(v); },
      getAttribute(name) { return attributes[name] ?? null; },
      querySelector() { return null; }, querySelectorAll() { return []; },
      appendChild() {}, removeChild() {}, focus() {},
      textWrites: 0,
    };
    Object.defineProperty(el, 'textContent', {
      get() { return value; },
      set(v) { value = String(v); el.textWrites++; },
    });
    return el;
  }

  const status = solveNode();
  let statusMarkup = '';
  status.markupWrites = 0;
  Object.defineProperty(status, 'innerHTML', {
    get() { return statusMarkup; },
    set(v) {
      statusMarkup = String(v);
      status.markupWrites++;
      status.messageNode = solveNode('求解中…（高難度配方可能數十秒）');
      status.elapsedNode = solveNode('已耗時 0 秒', { 'aria-hidden': 'true' });
    },
  });
  status.querySelector = (selector) => selector === '.crafter-solve-status__message'
    ? status.messageNode
    : selector === '.crafter-solve-status__elapsed' ? status.elapsedNode : null;
  els['solve-status'] = status;
  const sbEl = (id) => els[id] || (els[id] = solveNode());
  const sb = {
    console,
    Date: { now: () => now },
    document: { getElementById: sbEl, createElement() { return solveNode(); } },
    setInterval(fn) { tick = fn; return 1; },
    clearInterval() { tick = null; },
    Worker: function () { this.postMessage = () => {}; this.terminate = () => {}; },
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(SOLVE_SRC, sb, { filename: 'app-solve.js' });
  sb.CraftSolve.init({
    $: sbEl, toast() {}, PH_HTML: '',
    getSelected: () => ({ recipe: { job: '木工' }, rlv: 700 }),
    gearFor: () => ({ craftsmanship: 4000, control: 4000, cp: 600 }),
    computeSettings: () => ({ base_progress: 100, base_quality: 100 }),
    switchTab() {},
  });

  sb.CraftSolve.doSolve();
  const firstMessage = status.messageNode;
  const firstElapsed = status.elapsedNode;
  const initialElapsed = firstElapsed.textContent;
  eq('T28 求解開始只建立一次狀態結構', status.markupWrites, 1);
  eq('T28 秒數節點帶 aria-hidden="true"', firstElapsed.getAttribute('aria-hidden'), 'true');

  now = 2000; tick();
  now = 3000; tick();
  eq('T28 多次計時後狀態文字仍是同一個節點', status.messageNode, firstMessage);
  eq('T28 多次計時後秒數節點仍是同一個節點', status.elapsedNode, firstElapsed);
  check('T28 每秒只改秒數節點的 textContent', firstElapsed.textContent !== initialElapsed
    && firstElapsed.textContent === '已耗時 3 秒');

  now = 60000; tick();
  const overtimeWrites = firstMessage.textWrites;
  now = 61000; tick();
  eq('T28 跨過 60 秒仍不重建狀態文字節點', status.messageNode, firstMessage);
  eq('T28 ≥60 秒升級文案只寫一次', firstMessage.textWrites, overtimeWrites);

  // CSS 哨兵只擋「已知會壞的形狀」；文字比對驗不了 ring 是否真的在視覺上可見，須用鍵盤實測。
  const optRules = [...CSS_SRC.matchAll(/\.crafter-cons__opt[^{}]*\{([^}]*)\}/g)]
    .map((m) => m[1]).join('\n');
  check('T28 食藥 listbox focus 規則不得 outline:none', !/outline\s*:\s*none\b/.test(optRules),
    `實際規則：${optRules}`);
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

  // ===== T17：index.html 的靜態流程軸 == flowHtml({}) 冷啟動輸出（CLS 預留標記防漂移）=====
  // 流程軸原本是空殼等 JS 填 → 首屏 +73px 位移。改成靜態標記後，兩邊字串一旦不同就會出現
  // 「先顯示舊文案、JS 一跑換掉」的閃動 → 這裡逐字比對，測試紅了就把新字串貼回 index.html。
  const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const cold = fl.CraftFlow.flowHtml({}, T.esc);
  const pick = (re) => (HTML.match(re) || [, null])[1];
  eq('T17 index.html 靜態步驟軸 == flowHtml({}) 冷啟動輸出',
    pick(/<ol id="flow-steps" class="crafter-flow">([\s\S]*?)<\/ol>/), cold.steps);
  eq('T17 index.html 靜態「下一步」== flowHtml({}) 冷啟動輸出',
    pick(/<p id="flow-next" class="crafter-flow__next" role="status">([\s\S]*?)<\/p>/), cold.next);
  // 預留高度的 class 必須存在且會被卸下（少了任一邊＝空井或位移復發）
  check('T17 #picker 靜態帶 is-loading（首載預留 chips／筆數／翻頁器高度）',
    /<div id="picker" class="is-loading">/.test(HTML));
  check('T17 app.js 會卸下 is-loading（成功與失敗路徑各一）',
    (APP_SRC.match(/classList\.remove\('is-loading'\)/g) || []).length >= 2);
  check('T17 載入佔位撐到與載入後同高（.recipe-loading min-height 60vh == .recipe-table max-height）',
    /\.recipe-loading\s*\{[^}]*min-height:\s*60vh/.test(CSS_SRC) && /\.recipe-table\s*\{[^}]*max-height:\s*60vh/.test(CSS_SRC));
  const bodyRule = (CSS_SRC.match(/(?:^|\n)body\s*\{([\s\S]*?)\n\}/) || [])[1] || '';
  check('T17 body 首屏預留 portal navbar：padding-top 64px + margin 0',
    /padding-top\s*:\s*64px/.test(bodyRule) && /margin\s*:\s*0/.test(bodyRule));
  // T26：食藥 listbox 不得再寫死超過手機視窗的最小寬（2026-08-02 實測迴歸）。
  // ⚠ 這兩條只擋「已知會壞的形狀」，**不保證版面真的不溢出**——CSS 文字比對驗不了 layout。
  // 真正的驗收＝同源 iframe 定寬實測七種寬度（1400/1018/900/800/430/390/360）量 getBoundingClientRect，
  // 手法與判準見 AGENTS.md「開發注意」段；改這一區的寬度/定位時必須重跑那個實測。
  const menuRule = (CSS_SRC.match(/\.crafter-cons__menu\s*\{([^}]*)\}/) || [])[1] || '';
  check('T26 食藥 listbox 寬度不得寫死無上界的最小寬（360px 手機會溢出）',
    /width:\s*max\(100%,\s*min\(/.test(menuRule), `實際：${menuRule.match(/width:[^;]*/)?.[0] || '(找不到 width)'}`);
  check('T26 窄屏另有規則讓選單收進容器內（不得只靠 min-width 硬撐）',
    /@media\s*\([^)]*max-width:\s*\d+px[^)]*\)\s*\{[\s\S]*?\.crafter-cons__menu\s*\{[^}]*width:\s*100%/.test(CSS_SRC));
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

  // 保存往返：寫入 → 新 sandbox 重載 → 選擇/HQ/展開狀態都要回來（重開瀏覽器不遺失）
  // specialist 刻意留在舊格式裡：2026-08-09 搬去 gearsets 後，殘留欄位必須被忽略而非炸掉
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
  eq('T15 重載後回復展開狀態', $('consumable-block').open, false);
  eq('T15 舊保存值殘留的 specialist 欄位被忽略（已搬到角色數值）', $('specialist').checked, false);
  eq('T15 HQ 未勾 → get 回 NQ 版本（加成較低）', CS2.get('food').cp, 21);
  $('food-hq').checked = true;
  eq('T15 HQ 勾選 → get 回 HQ 版本', CS2.get('food').cp, 26);

  // 資料改版後保存值可能已不存在 → 必須清掉，不留「選了但算不出加成」的幽靈狀態
  CS2.setData([MEALS[2], MEALS[3]], []);
  eq('T15 保存的品項在新資料中消失 → 清除選擇（不留幽靈）',
    JSON.stringify([CS2.label('potion'), CS2.get('potion')]), JSON.stringify(['', null]));
}

// ===== T18：app-quality-stages.js 品質階段層 =====
// 換算錯的後果與「算錯巨集」同級：玩家照著求解、貼進遊戲卻差一格達不到門檻，且過程零錯誤訊號。
{
  const QS_SRC = fs.readFileSync(path.join(ROOT, 'app-quality-stages.js'), 'utf8');
  const mk = () => {
    const el = { options: [], value: '', textContent: '', hidden: false, selectedIndex: -1,
      addEventListener() {}, append(...xs) { el.options.push(...xs); } };
    Object.defineProperty(el, 'innerHTML', { get: () => '', set: () => { el.options.length = 0; } });
    return el;
  };
  const els = {};
  const $q = (id) => els[id] || (els[id] = mk());
  const qs = { console, document: { getElementById: $q },
    Option: function (text, value) { return { textContent: text, value: String(value), disabled: false }; } };
  qs.globalThis = qs;
  vm.createContext(qs);
  vm.runInContext(QS_SRC, qs, { filename: 'app-quality-stages.js' });
  const QS = qs.CraftStages;

  // 換算（純函式）：兩種來源單位不同，混用會靜默給出錯誤目標
  eq('T18 收藏品：收藏價值 ×10', QS._toQuality('collectable', 190, 99999), 1900);
  eq('T18 收藏品：不得超過配方滿品質', QS._toQuality('collectable', 200, 1500), 1500);
  eq('T18 宇宙任務：滿品質百分比', QS._toQuality('cosmic', 85, 14900), 12665);
  // 進位方向是有意義的：floor 會落在門檻下方，求出來的手法剛好差一格
  eq('T18 宇宙任務：百分比無條件進位（非捨去/四捨五入）', QS._toQuality('cosmic', 97, 101), 98);
  eq('T18 門檻 0 ＝沒這一檔 → 0', QS._toQuality('cosmic', 0, 14900), 0);
  eq('T18 未知來源不猜換算', QS._toQuality('mystery', 50, 14900), 0);

  QS.setData({ 36199: { src: 'cosmic', stages: [50, 60, 85] }, 900: { src: 'collectable', stages: [0, 160, 200] } });
  QS.setRecipe({ id: 12345 }, 5000);
  eq('T18 配方無分階 → 階段欄整組隱藏', $q('target-stage-field').hidden, true);

  QS.setRecipe({ id: 36199 }, 14900);
  eq('T18 有分階 → 階段欄顯示', $q('target-stage-field').hidden, false);
  eq('T18 選項＝滿品質＋三階＋自訂', $q('opt-target-stage').options.map((o) => o.value).join(','),
    ',7450,8940,12665,custom');
  eq('T18 提示列出來源與門檻原值', $q('target-stage-hint').textContent,
    '宇宙探索任務 · 一階 50%／二階 60%／三階 85%');

  // 某一檔為 0 → 不得列出（點了沒反應的選項比沒有更糟）
  QS.setRecipe({ id: 900 }, 99999);
  eq('T18 一階為 0 → 只列二/三階', $q('opt-target-stage').options.map((o) => o.textContent).join(','),
    '滿品質（99999）,二階（1600）,三階（2000）,自訂');
  // 階名要用 stages 的原始位置：對 filter 後的陣列取索引會把二階標成「一階」
  eq('T18 一階為 0 → 提示的階名不得位移', $q('target-stage-hint').textContent,
    '收藏品交易 · 二階 160／三階 200（收藏價值）');

  // 目標沒達到必須講出來：raphael 達不到目標時回「最佳努力」而非失敗，complete 只看進展
  // ⇒ 沒這行就會出現「✓ 可完成」配上達不到門檻的品質（2026-08-01 實測 三階 12665 / 實際 8488 全綠）
  const SF = sandbox.CraftRender.shortfallHtml;
  eq('T18 未達目標 → 出警語並寫出差額', /未達目標品質 12665.*實際 8488.*差 4177/.test(SF(12665, 8488)), true);
  eq('T18 達到目標 → 不警告', SF(12665, 12665), '');
  eq('T18 超過目標 → 不警告', SF(7450, 7509), '');
  eq('T18 未設目標（欄位留空／NQ）→ 不警告', SF(0, 100), '');

  QS.setRecipe({ id: 36199 }, 14900);
  $q('opt-target').value = '8940';
  QS.syncFromInput();
  eq('T18 手打數字等於二階 → 下拉指到二階',
    $q('opt-target-stage').options[$q('opt-target-stage').selectedIndex].value, '8940');
  $q('opt-target').value = '9999';
  QS.syncFromInput();
  eq('T18 手打數字不等於任何一檔 → 顯示自訂',
    $q('opt-target-stage').options[$q('opt-target-stage').selectedIndex].value, 'custom');
  $q('opt-target').value = '';
  QS.syncFromInput();
  eq('T18 清空 → 回滿品質', $q('opt-target-stage').selectedIndex, 0);
}

// ===== T19：求解選項一律預設不勾 + 本機保存 =====
// 為什麼要守：技能是玩家練到才有的（掌握 Lv65；專心致志/快速改革需專家之證），
// 預設替他勾＝預設產出他按不出來的巨集。這條防有人日後把 checked 加回 index.html。
{
  const HTML19 = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const OPT_IDS = ['opt-manip', 'opt-heart', 'opt-qi', 'opt-backload', 'opt-adversarial'];
  OPT_IDS.forEach(id => {
    const tag = (HTML19.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)) || [''])[0];
    check(`T19 ${id} 預設不勾（index.html 無 checked）`, !!tag && !/\bchecked\b/.test(tag), `tag=${tag}`);
  });

  // 保存往返：獨立 context + 有實體的 localStorage（主 sandbox 的是 no-op stub）
  const mkCtx = (store) => {
    const els = {};
    const el = () => ({ checked: false, value: '', innerHTML: '', textContent: '', hidden: true,
      disabled: false, max: '', min: '', placeholder: '', dataset: {}, style: {},
      classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, getAttribute: () => null,
      addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
      appendChild() {}, removeChild() {}, insertAdjacentHTML() {}, focus() {}, scrollIntoView() {}, select() {} });
    const ctx = {
      console: { log() {}, warn() {}, error() {} },
      document: { getElementById: (id) => els[id] || (els[id] = el()), querySelector: () => null,
        querySelectorAll: () => [], createElement: el, body: el() },
      location: { hostname: 'localhost', search: '' }, window: {},
      localStorage: { getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
      Worker: function () { this.postMessage = () => {}; this.terminate = () => {}; },
      fetch: () => Promise.reject(new Error('test: no network')),
      setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams,
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(GEAR_SRC, ctx, { filename: 'app-gear-t19.js' });
    vm.runInContext(RECIPE_SRC, ctx, { filename: 'app-recipe-t19.js' });
    vm.runInContext(APP_SRC, ctx, { filename: 'crafter-app-t19.js' });
    return ctx;
  };

  const store = {};
  const a = mkCtx(store);
  a.document.getElementById('opt-manip').checked = true;
  a.document.getElementById('opt-backload').checked = true;
  a.saveSolveOpts();
  const b = mkCtx(store);                       // 新開一次頁
  b.loadSolveOpts();
  eq('T19 保存往返：勾選的選項重載後仍勾', b.document.getElementById('opt-manip').checked, true);
  eq('T19 保存往返：未勾的仍未勾', b.document.getElementById('opt-heart').checked, false);
  eq('T19 保存往返：第二群組也保存', b.document.getElementById('opt-backload').checked, true);

  // 竄改防禦：非布林值不套用（退回 HTML 預設），不因 localStorage 被亂改就產出怪狀態
  const bad = { 'ffxiv-crafter-solve-opts-v1': JSON.stringify({ 'opt-manip': 'yes', 'opt-qi': 1 }) };
  const c = mkCtx(bad);
  c.loadSolveOpts();
  eq('T19 保存值非布林 → 不套用', c.document.getElementById('opt-manip').checked, false);
  eq('T19 保存值為數字 → 不套用', c.document.getElementById('opt-qi').checked, false);
}

// ===== T20：app-level-sync.js 等級同步層（宇宙探索配方）=====
// 算錯的後果與「算錯巨集」同級且零訊號：Lv70 拿 rlv690 的難度 4026（實際 658）→ 求解回「做不到」，
// 或給一份貼進遊戲完全對不上的手法。identity（滿等不得改變任何東西）是這層最重要的護欄。
{
  const LS_SRC = fs.readFileSync(path.join(ROOT, 'app-level-sync.js'), 'utf8');
  const HTML_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const mkEl = () => ({ value: '', textContent: '', placeholder: '', hidden: false, addEventListener() {} });
  const mkCtx = (store) => {
    const els = {};
    const ctx = {
      console,
      document: { getElementById: (id) => els[id] || (els[id] = mkEl()), activeElement: null },
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
      },
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(LS_SRC, ctx, { filename: 'app-level-sync.js' });
    ctx._els = els;
    return ctx;
  };

  const RLVT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/recipe_levels.json'), 'utf8'));
  const SYNCMAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/level-sync.json'), 'utf8'));
  const ctx = mkCtx({});
  const LS = ctx.CraftSync;

  // 基準 rlv＝該職業等級的最小 rlv。690/290 是實測值，不是推導出來的常數。
  eq('T20 Lv100 的基準 rlv', LS._minRlvId(RLVT, 100), 690);
  eq('T20 Lv70 的基準 rlv', LS._minRlvId(RLVT, 70), 290);
  eq('T20 Lv60 的基準 rlv（60 級有多列，取最小）', LS._minRlvId(RLVT, 60), 150);
  eq('T20 資料沒有的等級 → null（不硬湊相近的）', LS._minRlvId(RLVT, 101), null);

  LS.setData(SYNCMAP);
  const COSMIC = { id: 36165, rlv: 690, job: '木工' };
  const NORMAL = { id: 12345, rlv: 640, job: '木工' };

  eq('T20 不會同步的配方 → 不介入', LS.resolve(NORMAL, RLVT, 70), null);
  eq('T20 Lv70 做宇宙配方 → 降到 rlv 290', LS.resolve(COSMIC, RLVT, 70).row.id, 290);
  // identity：滿等時生效 rlv 必須就是配方存的那個 —— 這條同時也是「取最小 rlv」這個對照的依據
  eq('T20 identity：Lv100 的生效 rlv == 配方原始 rlv', LS.resolve(COSMIC, RLVT, 100).row.id, COSMIC.rlv);
  eq('T20 未填角色等級 → 不猜（回 null，沿用配方原始值）', LS.resolve(COSMIC, RLVT, 0), null);

  // 手動覆寫優先於角色等級；清空回到跟隨
  LS._setOverride(80);
  eq('T20 手動指定優先於角色等級', LS.resolve(COSMIC, RLVT, 70).row.id, 430);
  eq('T20 手動指定會標記為 manual', LS.resolve(COSMIC, RLVT, 70).manual, true);
  LS._setOverride(150);
  eq('T20 手動指定超過資料上限 → 收在上限（不外插出不存在的等級）',
    LS.resolve(COSMIC, RLVT, 70).row.id, 690);
  LS._setOverride(null);
  eq('T20 清空手動值 → 回到跟隨角色等級', LS.resolve(COSMIC, RLVT, 70).row.id, 290);

  // 不靜默換數字：同步後的說明必須寫出生效 rlv、三上限與配方原始值
  LS.render(COSMIC, LS.resolve(COSMIC, RLVT, 70), 70,
    { max_progress: 658, max_quality: 1728, max_durability: 40 });
  const note = ctx._els['ls-note'].textContent;
  eq('T20 說明寫出依據的等級與生效 rlv', /Lv 70.*rlv 290/.test(note), true);
  eq('T20 說明寫出三上限', /658.*1728.*40/.test(note), true);
  eq('T20 說明寫出配方原始值（讓玩家對得上遊戲畫面）', /原始.*Lv 100.*rlv 690/.test(note), true);
  eq('T20 會同步的配方 → 顯示這一區', ctx._els['level-sync'].hidden, false);
  LS.render(NORMAL, null, 70, null);
  eq('T20 不會同步的配方 → 整區隱藏（不留一個永遠沒作用的輸入框）', ctx._els['level-sync'].hidden, true);

  // 保存往返
  const store = {};
  const w = mkCtx(store);
  w.CraftSync.init({ $: null, onChange() {} });
  w._els['ls-level'].value = '70';
  w._els['ls-level'].addEventListener = () => {};
  w.CraftSync._setOverride(70);
  w.CraftSync.setData(SYNCMAP);
  // 直接走公開路徑保存：init 綁的是 DOM 事件，這裡用內部 setter + 再開一次頁驗證
  vm.runInContext('localStorage.setItem("ffxiv-crafter-level-sync-v1", JSON.stringify({level:70}))', w);
  const w2 = mkCtx(store);
  w2.CraftSync.init({ $: null, onChange() {} });
  w2.CraftSync.setData(SYNCMAP);
  eq('T20 保存往返：手動等級重載後仍生效', w2.CraftSync.resolve(COSMIC, RLVT, 100).row.id, 290);

  const bad = mkCtx({ 'ffxiv-crafter-level-sync-v1': JSON.stringify({ level: 'seventy' }) });
  bad.CraftSync.init({ $: null, onChange() {} });
  bad.CraftSync.setData(SYNCMAP);
  eq('T20 保存值非合法等級 → 退回跟隨角色等級', bad.CraftSync.resolve(COSMIC, RLVT, 100).row.id, 690);

  // 實資料不變量：**每一個**會同步的配方，其原始 rlv 都必須等於「資料所依據的最高等級」的基準 rlv。
  // 這條把「等級→rlv＝取該等級最小 rlv」這個對照釘在真實資料上：上游改版讓對照失效時會直接紅。
  const RECIPES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/recipes.json'), 'utf8'));
  const byId = new Map(RECIPES.map((r) => [String(r.id), r]));
  const ids = Object.keys(SYNCMAP);
  const orphan = ids.filter((id) => !byId.has(id));
  const broken = ids.filter((id) => byId.has(id)
    && LS._minRlvId(RLVT, SYNCMAP[id]) !== byId.get(id).rlv);
  check(`T20 level-sync.json 有資料（現況 768，實測 ${ids.length}）`, ids.length >= 700);
  eq('T20 同步清單裡沒有本站不存在的配方', orphan.length, 0);
  eq('T20 每個同步配方的原始 rlv == 其最高等級的基準 rlv（identity 全量）', broken.length, 0);
  eq('T20 index.html 有等級同步靜態骨架（不靠 JS 建 DOM，免 CLS 與游標遺失）',
    /id="level-sync"[\s\S]*id="ls-level"[\s\S]*id="ls-note"/.test(HTML_SRC), true);
  check('T20 index.html 載入 app-level-sync.js',
    HTML_SRC.includes('<script src="app-level-sync.js"></script>'));
}

// ===== T21：`hidden` 屬性必須真的收得起來（[hidden] 守衛哨兵）=====
// UA 樣式的 [hidden]{display:none} 優先權最低，本地 `.x{display:flex}` 一寫就蓋掉它 →
// JS 設 `el.hidden = true` 完全沒作用，元素照樣顯示。這個坑在本 repo 反覆出現（styles.css 已有 6 條
// 手寫守衛），且**用 `el.hidden` 斷言驗不出來**（屬性是 true、畫面是顯示）——2026-08-02 等級同步面板
// 就是這樣過了測試卻每個配方都顯示。故改成機械掃描：index.html 裡帶 hidden 的元素，其 id/class 若在
// styles.css 被指定了非 none 的 display，就必須有對應的 `[hidden]` 守衛。
// 涵蓋範圍限本地 styles.css（portal CDN 的 .codex-* 不在此檔，其守衛見 styles.css 檔頭 B-006 註）。
{
  const HTML_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sels = new Set();
  for (const m of HTML_SRC.matchAll(/<\w+\s([^>]*)>/g)) {
    const attrs = m[1];
    if (!/(^|\s)hidden(\s|$|=)/.test(attrs)) continue;
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    const cls = (attrs.match(/\bclass="([^"]+)"/) || [])[1];
    if (id) sels.add('#' + id);
    if (cls) cls.split(/\s+/).filter(Boolean).forEach((c) => sels.add('.' + c));
  }
  const unguarded = [];
  for (const s of sels) {
    const rule = CSS_SRC.match(
      new RegExp('(?:^|[,}\\s])' + s.replace(/[.#]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm'));
    if (!rule) continue;                                   // 本地 CSS 沒管這個選擇器 → UA 規則生效，安全
    const display = rule[1].match(/display\s*:\s*([^;!]+)/);
    if (!display || /none/.test(display[1])) continue;      // 沒設 display 或本來就 none → 蓋不到
    if (!CSS_SRC.includes(s + '[hidden]')) unguarded.push(`${s}(display:${display[1].trim()})`);
  }
  check(`T21 哨兵本身有效：掃到帶 hidden 的選擇器（實測 ${sels.size} 個）`, sels.size >= 20);
  eq('T21 帶 hidden 的元素若被本地 CSS 指定 display，必須有 [hidden] 守衛',
    unguarded.join(' '), '');
}

// ===== T29：DOH / JOB_ICON 是刻意的 local hardcode（B-001）——用不變量取代上游 sync =====
// jobs.json 只散布 21 個戰鬥職、不含製作職 ⇒ 這兩份沒有權威源可對。防漂移改用「對得起實際資料」：
// 遊戲加/改製作職，或有人手滑改壞任一份，這裡就會紅。
{
  const recipes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'recipes.json'), 'utf8'));
  const rows = Array.isArray(recipes) ? recipes : (recipes.recipes || Object.values(recipes));
  const jobsInData = [...new Set(rows.map((r) => r.job))].sort();
  const doh = [...T.DOH].sort();
  eq('T29 DOH == recipes.json 實際出現的所有職業', doh.join('|'), jobsInData.join('|'));
  eq('T29 JOB_ICON 的鍵集合 == DOH', Object.keys(T.JOB_ICON).sort().join('|'), doh.join('|'));
  check('T29 JOB_ICON 每個值都是 icon 路徑',
    Object.values(T.JOB_ICON).every((v) => /^\/i\/\d{6}\/\d{6}\.png$/.test(v)));
}


// ===== T30：專家之證＝逐職業的角色狀態（上限 3；2026-08-09 從「素材與加成」搬到「角色數值」）=====
// 為什麼要測：遊戲一個角色同時最多持有 3 個專家之證。上限若沒守住，玩家會替 8 個職業全勾，
// 求解器照樣算得出漂亮巨集 —— 而那份巨集他在遊戲裡按不出來（專心致志／快速改革根本沒有），
// 且過程零錯誤訊號。另一半是 fallback：某職沒填數值時走「預設」數值，但**證是綁職業的**，
// 不能跟著 fallback 一起變成「預設」那格（沒有那格）。
{
  const mkSpecCtx = (store) => {
    const els = {};
    const el = () => ({ checked: false, value: '', innerHTML: '', textContent: '', hidden: true,
      disabled: false, max: '', min: '', placeholder: '', dataset: {}, style: {},
      classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, getAttribute: () => null,
      addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
      appendChild() {}, removeChild() {}, insertAdjacentHTML() {}, focus() {}, scrollIntoView() {}, select() {} });
    const ctx = {
      // app.js 的 init 會因缺 CraftConsumable 而早炸（本測只需 CraftGear，那之前已 init 完）→ 吞掉那行噪音
      console: { log: console.log, warn() {}, error() {} },
      document: { getElementById: (id) => els[id] || (els[id] = el()), querySelector: () => null,
        querySelectorAll: () => [], createElement: el, body: el() },
      location: { hostname: 'localhost', search: '' },
      window: { FFXIVToast: { show() {} } },   // toast 走 codex 版 → 不落 alert 分支
      localStorage: { getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
      Worker: function () { this.postMessage = () => {}; this.terminate = () => {}; },
      fetch: () => Promise.reject(new Error('test: no network')),
      setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams,
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(GEAR_SRC, ctx, { filename: 'app-gear-t30.js' });
    vm.runInContext(RECIPE_SRC, ctx, { filename: 'app-recipe-t30.js' });
    vm.runInContext(APP_SRC, ctx, { filename: 'crafter-app-t30.js' });
    ctx.loadGear();
    return ctx;
  };
  const toggle = (ctx, job, on) => {
    const target = { checked: on, dataset: { job } };
    ctx.CraftGear.onSpecialistToggle({ target });
    return target;   // 超過上限時 handler 會把 checked 改回 false → 由呼叫端斷言
  };

  const store = { 'ffxiv-crafter-gearsets-v1': JSON.stringify({
    '預設': { level: 100, cms: 4000, ctrl: 3900, cp: 600 },
    '木工': { level: 100, cms: 4048, ctrl: 3980, cp: 620 },
  }) };
  const ctx = mkSpecCtx(store);

  toggle(ctx, '木工', true); toggle(ctx, '鍛造', true); toggle(ctx, '甲冑', true);
  eq('T30 勾 3 個職業 → 計數 3', ctx.CraftGear.specialistCount(), 3);
  eq('T30 上限常數＝遊戲的 3', ctx.CraftGear.SPEC_MAX, 3);

  const fourth = toggle(ctx, '金工', true);
  eq('T30 第 4 個被擋下（勾選回退）', fourth.checked, false);
  eq('T30 第 4 個不進保存', ctx.CraftGear.specialistFor('金工'), false);
  eq('T30 被擋下後計數維持 3', ctx.CraftGear.specialistCount(), 3);

  eq('T30 保存到 gearsets（重開瀏覽器不遺失）',
    JSON.parse(store['ffxiv-crafter-gearsets-v1'])['木工'].specialist, true);
  eq('T30 保存不動到數值欄',
    JSON.parse(store['ffxiv-crafter-gearsets-v1'])['木工'].cms, 4048);

  // 有自己數值的職業
  eq('T30 gearFor 帶出該職業的專家之證', ctx.gearFor('木工').specialist, true);
  // 沒有自己數值的職業 → 數值走「預設」，但證仍看自己那格
  const gSmith = ctx.gearFor('鍛造');
  eq('T30 數值走 fallback「預設」', gSmith._src, '預設');
  eq('T30 證不跟著 fallback 走（鍛造有證）', gSmith.specialist, true);
  eq('T30 沒勾的職業＝無證（即使同樣走預設數值）', ctx.gearFor('皮革').specialist, false);

  // 公式端：證是唯一 gate（UI disabled 不算數）
  const rlvT = { id: 640, class_job_level: 90, difficulty: 4400, quality: 9000, durability: 70,
    progress_divider: 130, quality_divider: 115, progress_modifier: 80, quality_modifier: 70 };
  ctx.document.getElementById('opt-heart').checked = true;
  ctx.document.getElementById('opt-qi').checked = true;
  eq('T30 有證的職業 → 專心致志可用',
    ctx.computeSettings(recipe100, rlvT, ctx.gearFor('木工')).use_heart_and_soul, true);
  eq('T30 無證的職業 → 快速改革強制關',
    ctx.computeSettings(recipe100, rlvT, ctx.gearFor('皮革')).use_quick_innovation, false);
  eq('T30 有證的職業 → 數值 +20/+20/+15',
    JSON.stringify(ctx.effectiveStats(ctx.gearFor('木工'))), JSON.stringify({ cms: 4068, ctrl: 4000, cp: 635 }));

  // 取消一個就空出一格（上限是「同時持有」，不是「一輩子只能勾 3 次」）
  toggle(ctx, '木工', false);
  eq('T30 取消後計數 2', ctx.CraftGear.specialistCount(), 2);
  const refilled = toggle(ctx, '金工', true);
  eq('T30 空出一格後可再勾別的職業', refilled.checked, true);
  eq('T30 補勾後計數回到 3', ctx.CraftGear.specialistCount(), 3);

  // 「預設」不是職業（是數值 fallback）→ 不得佔用上限；壞掉的保存值也不能把計數灌爆
  const store2 = { 'ffxiv-crafter-gearsets-v1': JSON.stringify({
    '預設': { level: 100, cms: 4000, ctrl: 3900, cp: 600, specialist: true },
    '木工': { cms: 1, ctrl: 1, cp: 1, specialist: true },
  }) };
  const ctx2 = mkSpecCtx(store2);
  eq('T30 「預設」的 specialist 不計入上限', ctx2.CraftGear.specialistCount(), 1);
}


// ===== T31：app-quests.js 職業任務層（素材展開 / 完成過濾）=====
// 為什麼要守：這一頁的輸出是「玩家照著去買素材」的清單。算錯不會有任何錯誤訊號——
// 畫面照樣是一張漂亮的表，人是到了市場板才發現少買。三個易錯點各釘一條：
// ① 配方一次產 n 個 → 要 m 個是做 ceil(m/n) 次，素材照「做幾次」乘，不是照「要幾個」
// ② 交付數量未知（qty=null）時以 1 份估算 —— 不能當成 0 直接不算
// ③ 資料出環（A 的素材是 B、B 的素材是 A）不能把瀏覽器轉死
{
  const QUESTS_SRC = fs.readFileSync(path.join(ROOT, 'app-quests.js'), 'utf8');
  const qctx = { console, document: { getElementById: () => null }, localStorage: { getItem: () => null, setItem() {} } };
  qctx.globalThis = qctx;
  vm.createContext(qctx);
  vm.runInContext(QUESTS_SRC, qctx, { filename: 'app-quests.js' });
  const Q = qctx.CraftQuests;
  check('T31 CraftQuests 導出 expandMats / view', typeof Q.expandMats === 'function' && typeof Q.view === 'function');

  // 配方 1：成品 100（一次產 3 個）← 素材 200×2 + 素材 300×1
  // 配方 2：中間材 200 ← 底層 400×5
  const ctx = {
    recipesById: { 1: { id: 1, item_amount: 3 }, 2: { id: 2, item_amount: 1 } },
    recipeByItem: { 100: 1, 200: 2 },
    ingredients: { 1: [[200, 2], [300, 1]], 2: [[400, 5]] },
  };
  const flat = (arr) => Object.fromEntries(arr);

  {
    const r = Q.expandMats([{ id: 100, qty: 1 }], ctx);
    // 要 1 個成品 → 做 1 次（產 3 但只需 1）→ 中間材 200 要 2、底層 300 要 1
    // 中間材 200 要 2 → 配方 2 一次產 1 → 做 2 次 → 底層 400 要 10
    eq('T31 一次產 3 個的配方：要 1 個仍是做 1 次', flat(r.inter)[200], 2);
    eq('T31 中間材再展開到底層（2 × 5）', flat(r.base)[400], 10);
    eq('T31 沒有配方的素材直接進底層', flat(r.base)[300], 1);
    eq('T31 交付物本身不列進「要先做出來的」', flat(r.inter)[100], undefined);
  }
  {
    const r = Q.expandMats([{ id: 100, qty: 4 }], ctx);
    // 要 4 個 → ceil(4/3)=2 次 → 素材照 2 次算（不是照 4 個）
    eq('T31 產出量取 ceil：要 4 個做 2 次 → 中間材 4', flat(r.inter)[200], 4);
    eq('T31 底層跟著「做幾次」放大（4 × 5）', flat(r.base)[400], 20);
    eq('T31 非配方素材同樣照次數（2 次 × 1）', flat(r.base)[300], 2);
  }
  {
    const unknown = Q.expandMats([{ id: 100, qty: null }], ctx);
    const one = Q.expandMats([{ id: 100, qty: 1 }], ctx);
    eq('T31 數量未知（null）以 1 份估算、不是當 0 漏算',
      JSON.stringify(unknown), JSON.stringify(one));
  }
  {
    // 出環：500 的配方需要 600、600 的配方需要 500
    const cyc = {
      recipesById: { 9: { id: 9, item_amount: 1 }, 10: { id: 10, item_amount: 1 } },
      recipeByItem: { 500: 9, 600: 10 },
      ingredients: { 9: [[600, 1]], 10: [[500, 1]] },
    };
    const r = Q.expandMats([{ id: 500, qty: 1 }], cyc);   // 不得無限遞迴
    check('T31 配方資料出環不會轉死，需求仍被記下', r.base.length + r.inter.length > 0);
  }
  {
    const quests = [{ id: 1, lv: 1 }, { id: 2, lv: 5 }, { id: 3, lv: 10 }];
    const done = new Set([2]);
    const all = Q.view({ quests }, done, false);
    const hide = Q.view({ quests }, done, true);
    eq('T31 不隱藏時列出全部', all.quests.length, 3);
    eq('T31 進度計已完成數', all.doneCount, 1);
    eq('T31 「只顯示未完成」濾掉已完成', hide.quests.map((q) => q.id).join(','), '1,3');
    eq('T31 素材彙總永遠只看未完成（與是否隱藏無關）',
      JSON.stringify([all.remaining.map((q) => q.id), hide.remaining.map((q) => q.id)]),
      JSON.stringify([[1, 3], [1, 3]]));
  }
  {
    // 資料檔本身的不變量：11 職、每個任務至少一件交付物、qty 不是 0/負數
    const jq = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'job-quests.json'), 'utf8'));
    eq('T31 job-quests.json 收 11 個製作/採集職', jq.length, 11);
    const items = jq.flatMap((j) => j.quests.flatMap((q) => q.items));
    check('T31 每個任務都有交付物（沒有空任務列）', jq.every((j) => j.quests.every((q) => q.items.length > 0)));
    check('T31 qty 只會是正整數或 null（0/負數是資料壞了）',
      items.every((it) => it.qty == null || (Number.isSafeInteger(it.qty) && it.qty > 0)));
    check('T31 交付物都有繁中名（不是 #id）', items.every((it) => it.name && !/^#\d+$/.test(it.name)));
    // 木工 Lv10 交 12 個梣木木材＝Owner 提供的試算表對到解包的實證，數字變了要有人知道
    const wood10 = jq.find((j) => j.job === '木工師').quests.find((q) => q.lv === 10);
    eq('T31 木工 Lv10 交付物與數量（試算表 × 解包對帳過的 golden）',
      JSON.stringify(wood10.items.map((i) => [i.name, i.qty])), JSON.stringify([['梣木木材', 12]]));
  }
}


// ===== T32：商人資訊的兩個來源必須分清楚（解包說有賣才出徽章）=====
// 「哪裡買得到」有兩個來源：is_gil_shop（解包，權威）與試算表的地點/單價（社群整理）。
// 混在一起的後果是**叫玩家跑去一個沒有商人的地方** —— 走一趟才發現，畫面上完全看不出來。
{
  const QSRC = fs.readFileSync(path.join(ROOT, 'app-quests.js'), 'utf8');
  const c2 = { console, document: { getElementById: () => null }, localStorage: { getItem: () => null, setItem() {} } };
  c2.globalThis = c2;
  vm.createContext(c2);
  vm.runInContext(QSRC, c2, { filename: 'app-quests-t32.js' });
  const Q = c2.CraftQuests;
  Q.init({ $: () => null, esc: (s) => String(s), iconUrl: () => '', toast() {}, mbItem: () => '#',
    selectRecipe: () => true, switchTab() {}, getItems: () => ({}), getIngredients: () => ({}),
    getRecipesById: () => ({}), getRecipeByItem: () => ({}) });
  Q.setVendors({
    1: { shop: 1, price: 18, npcs: [{ npc: '斯姆爾維布', title: '行會供應商', zone: '烏爾達哈現世回廊', x: 10.6, y: 9.6 }], more: 5 },
    2: { shop: 1 },
  });

  const full = Q.vendorHtml(1), bare = Q.vendorHtml(2), none = Q.vendorHtml(3);
  check('T32 沒有商人資料的物品不出徽章', none === '');
  check('T32 有販售地點時寫出地名、座標、NPC 與單價',
    /烏爾達哈現世回廊/.test(full) && /10\.6, 9\.6/.test(full) && /斯姆爾維布/.test(full) && /18 G/.test(full));
  check('T32 NPC 太多時用「另有 N 處」帶過，不塞一長串', /另有 5 處/.test(full));
  check('T32 只知道「有賣」但不知道在哪 → 誠實說沒有販售地點資料',
    /商人有賣/.test(bare) && /沒有這件的販售地點資料/.test(bare));

  // 資料檔不變量：vendors.json 每筆都是解包確認有賣；帶 NPC 的必須有地名（沒地名的地點資訊沒用）
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'vendors.json'), 'utf8'));
  const rows = Object.values(v);
  check('T32 vendors.json 每筆都是「解包確認有 NPC 賣」', rows.length > 0 && rows.every((e) => e.shop === 1));
  check('T32 每個 NPC 都帶地名（沒地名的販售點對玩家沒用）',
    rows.every((e) => !e.npcs || e.npcs.every((n) => n.zone && n.npc)));
  check('T32 販售地點覆蓋率沒有倒退（現況 172 件，之前靠社群資料只有 38 件）',
    rows.filter((e) => e.npcs && e.npcs.length).length >= 150);
}


// ===== T33：要交 HQ 的任務，商人徽章不得說「買得到」=====
// 商人賣的是 NQ。任務要 HQ 時把徽章寫成「商人有賣」＝叫玩家買一堆交不掉的東西，
// 而且他是**買完到 NPC 面前才發現**——畫面上一路都正常。這條就是釘住那個分流。
{
  const QSRC = fs.readFileSync(path.join(ROOT, 'app-quests.js'), 'utf8');
  const c3 = { console, document: { getElementById: () => null }, localStorage: { getItem: () => null, setItem() {} } };
  c3.globalThis = c3;
  vm.createContext(c3);
  vm.runInContext(QSRC, c3, { filename: 'app-quests-t33.js' });
  const Q = c3.CraftQuests;
  Q.init({ $: () => null, esc: (s) => String(s), iconUrl: () => '', toast() {}, mbItem: () => '#',
    selectRecipe: () => true, switchTab() {}, getItems: () => ({}), getIngredients: () => ({}),
    getRecipesById: () => ({}), getRecipeByItem: () => ({}) });
  Q.setVendors({ 7: { shop: 1, loc: '西薩納蘭-銅鈴銅山', price: 18 } });

  const nq = Q.vendorHtml(7, false);      // 任務不要求 HQ → 照常說買得到
  const hq = Q.vendorHtml(7, true);       // 任務要求 HQ → 必須改口
  const unknown = Q.vendorHtml(7, null);  // 不知道要不要 HQ → 要照實提醒

  check('T33 不要求 HQ → 徽章照常顯示可購買與單價', /18 G/.test(nq) && !/只賣 NQ/.test(nq));
  check('T33 要求 HQ → 徽章改成「只賣 NQ」', /只賣 NQ/.test(hq));
  check('T33 要求 HQ → 說明講清楚買來的不能交、要自己做', /不能直接交/.test(hq) && /HQ/.test(hq));
  check('T33 要求 HQ 的徽章不得沿用「買得到」的樣式', /crafter-qt-tag--nq/.test(hq) && !/crafter-qt-tag--shop/.test(hq));
  check('T33 HQ 需求未知 → 徽章仍出，但說明要提醒可能交不了', /不確定這件是否要求 HQ/.test(unknown));

  // 資料檔：hq 只會是 true / null（試算表有列但沒標＝false 也可以），不得出現字串等雜訊
  const jq = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'job-quests.json'), 'utf8'));
  const items = jq.flatMap((j) => j.quests.flatMap((q) => q.items));
  check('T33 hq 欄只會是 true/false/null', items.every((it) => it.hq === true || it.hq === false || it.hq == null));
  check('T33 確實有標到要求 HQ 的任務（哨兵本身有效）', items.filter((it) => it.hq === true).length >= 50);
  // 木工 Lv25 胡桃木材＝已用 can_be_hq 全量反驗過的 golden（標 ୭ 的 92 件全部可 HQ、0 例外）
  const w25 = jq.find((j) => j.job === '木工師').quests.find((q) => q.lv === 25);
  eq('T33 木工 Lv25 要交 HQ 胡桃木材（golden）',
    JSON.stringify(w25.items.map((i) => [i.name, i.hq])), JSON.stringify([['胡桃木材', true]]));
  const w10 = jq.find((j) => j.job === '木工師').quests.find((q) => q.lv === 10);
  eq('T33 木工 Lv10 不要求 HQ（早期任務；反向 golden）',
    JSON.stringify(w10.items.map((i) => [i.name, i.hq])), JSON.stringify([['梣木木材', false]]));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

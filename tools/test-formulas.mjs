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
// 站台手寫 JS＝repo 根的 .js，**掃描產生、不手維護清單**。
// 由來（健檢 2026-08-15 docs-drift／tests 同一根因）：這份清單原本是手打的 10 支，
// 漏掉 app-quests.js（第二大模組）／app-gear.js／app-recipe.js —— 靜默 catch 哨兵宣稱掃「全部手寫 JS」
// 卻只掃 10/13，而且**漏掃的症狀就是全綠**。新增模組時沒有人會記得回來加一行，所以改成掃描。
// （pkg/ 是 wasm-pack 產物、tools/ 與 tests/ 是工具鏈、functions/ 是 CF Pages Functions，都不在此範圍。）
const HANDWRITTEN_JS = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js')).sort();

// ---------- 分層 stub（app.js init 對每一支分層檔都硬失敗，RES-02）----------
// 真實頁面一定同時載入全部分層；harness 只載其中幾支，所以缺的用 no-op stub 補。
// 收成一份共用常數：新增分層檔時只要改這裡，不必逐個 harness 補（先前 T23/T24 就是各自漏了 CraftSolve）。
// ⚠ 各 harness 要覆寫的（例如 T25 的 invalidateInFlight 計數器）用展開覆蓋，不要改這份。
const LAYER_STUBS = () => ({
  CraftSolve: { init() {}, newWorker() {}, invalidateInFlight() { return false; } },
  CraftRender: { init() {}, render() {} },
  CraftFlow: { setTargetMode() {}, update() {}, updateConsumableSummary() {} },
  CraftConsumable: { init() {}, setData() {}, label() { return ''; }, get() { return { food: null, potion: null }; } },
  CraftQuests: { init() {}, setData() {}, setVendors() {} },
  CraftStages: { init() {}, setData() {}, setRecipe() {}, syncFromInput() {}, stageSelection: () => null, applyStageSelection: () => false },
  CraftSync: { init() {}, setData() {}, resolve: () => null, render() {} },
  CraftBrowse: { init() {}, renderChips() {}, renderTable() {}, markListState() {} },
  CraftList: { init() {}, add() {}, has: () => false, count: () => 0 },
  CraftNext: { init() {}, setData() {}, countFor: () => 0, open() {}, close() {} },
});

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
  ...LAYER_STUBS(),
  console,
  document: {
    getElementById: getEl, querySelector() { return null; }, querySelectorAll() { return []; },
    createElement() { return makeEl(); }, body: makeEl(),
  },
  location: { hostname: 'localhost', search: '' },
  window: {},
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  navigator: {},          // 瀏覽器一定有 navigator；沒有 clipboard 屬性＝非安全脈絡，正好走 execCommand 退場路徑
  alert() {},             // toast 的最後退場（CDN 未載 + 重要訊息）會用它；瀏覽器一定有
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
  APP_SRC + '\n;globalThis.__t = { computeSettings, recipeMaxes, effectiveStats, esc, mbItem, mbCraft, selectRecipe, copyText, DOH, JOB_ICON, hqPercent: globalThis.CraftRender.hqPercent };',
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
      ...LAYER_STUBS(),
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
      ...LAYER_STUBS(),
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
    ctx.CraftGear.onGearInput({ target });
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
  const QSTAGE_SRC = fs.readFileSync(path.join(ROOT, 'app-quality-stages.js'), 'utf8');
  const mkT25Ctx = ({ recipe, rlvTable, syncMap = null, stageMap = null, level, gearExtra = {}, extraStore = {} }) => {
    const els = {}, store = { 'ffxiv-crafter-gearsets-v1': JSON.stringify({ 木工: { level, cms: 4048, ctrl: 3980, cp: 600, ...gearExtra } }), ...extraStore };
    const makeEl = () => {
      const attrs = {}, on = {};
      return { checked: false, value: '', innerHTML: '', textContent: '', hidden: true, disabled: false,
        max: '', min: '', placeholder: '', dataset: {}, style: {}, className: '',
        classList: { toggle() {}, add() {}, remove() {} },
        setAttribute(k, v) { attrs[k] = String(v); }, getAttribute(k) { return attrs[k] ?? null; },
        // 錄下監聽器：T37 要走「真的觸發 ls-level 的 input 事件」那條路，不能自己去呼叫 onChange
        // （那等於測試自己寫的接線，接線斷掉照樣綠）
        addEventListener(t, fn) { (on[t] || (on[t] = [])).push(fn); }, removeEventListener() {},
        _fire(t, ev) { (on[t] || []).forEach((fn) => fn(ev || {})); },
        querySelectorAll() { return []; }, querySelector() { return null; },
        appendChild() {}, removeChild() {}, insertAdjacentHTML() {}, focus() {}, scrollIntoView() {}, select() {} };
    };
    const ingredients = { _html: '', _inputs: [],
      set innerHTML(v) { this._html = v; this._inputs = [{ value: '0', dataset: { iid: '42', amt: '2' }, addEventListener() {} }]; },
      get innerHTML() { return this._html; },
      querySelectorAll(sel) { return sel === '.ing-hq-in' ? this._inputs : []; }, querySelector() { return null; } };
    // 品質階段的下拉是真的 <select>（有 options／append），makeEl 那種泛用 stub 撐不住 setRecipe 重建選項
    const stageEl = { options: [], value: '', selectedIndex: -1, hidden: false, textContent: '',
      addEventListener() {}, append(...xs) { stageEl.options.push(...xs); } };
    Object.defineProperty(stageEl, 'innerHTML', { get: () => '', set: () => { stageEl.options.length = 0; } });
    const ctx = {
      ...LAYER_STUBS(),
      console: { log() {}, error() {}, warn() {} },
      Option: function (text, value) { return { textContent: text, value: String(value), disabled: false }; },
      document: { getElementById: (id) => id === 'ingredients' ? ingredients
          : id === 'opt-target-stage' ? stageEl
          : (els[id] || (els[id] = makeEl())),
        querySelector() { return null; }, querySelectorAll() { return []; }, body: makeEl(), activeElement: null },
      location: { hostname: 'localhost', search: '' }, window: { FFXIVToast: { show() {} } },
      localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem() {} },
      Worker: function () {}, fetch: () => Promise.reject(new Error('test: no network')),
      setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams,
      CraftFlow: { setTargetMode() {}, update() {} },
      // 換配方必須作廢飛行中的求解（見下方 T25 最後一條）：這個 stub 記錄呼叫次數
      // app.js init 會先呼叫 init/newWorker，stub 缺任一個就會在更早處拋錯（CraftRecipe.init 就跑不到）
      CraftSolve: { init() {}, newWorker() {}, invalidateInFlight() { invalidated++; return false; } },
      // app.js init 對 app-consumable.js 是硬失敗（部署不完整就早報）→ 少了這個 stub，init 會在 :348 拋出，
      // 後面的 CraftSync.init（接 ls-level 輸入事件）就永遠接不上，T37 那條路在測試裡等於不存在。
      CraftConsumable: { init() {}, setData() {}, label() { return ''; }, get() { return { food: null, potion: null }; } },
      // showPicker → deps.renderTable() → CraftBrowse（T45 走真路徑，不能只呼叫內部函式）
      CraftBrowse: { init() {}, renderChips() {}, renderTable() {}, markListState() {} },
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(GEAR_SRC, ctx, { filename: 'app-gear-t25.js' });
    vm.runInContext(RECIPE_SRC, ctx, { filename: 'app-recipe-t25.js' });
    // classic script **必須早於 app.js module**（與 index.html 的實際載入順序一致）：
    // app.js 的 init 會 `globalThis.CraftSync?.init?.(…)` 把 ls-level 的輸入事件接起來，
    // 反過來載的話那一行是 no-op ⇒ 手動指定等級整條路徑在測試裡根本不存在（T37 由來）。
    if (syncMap) vm.runInContext(LS_SRC, ctx, { filename: 'app-level-sync-t25.js' });
    if (stageMap) vm.runInContext(QSTAGE_SRC, ctx, { filename: 'app-quality-stages-t25.js' });
    vm.runInContext(APP_SRC, ctx, { filename: 'crafter-app-t25.mjs' });
    vm.runInContext(`RECIPES = ${JSON.stringify([recipe])}; RLV = ${JSON.stringify(rlvTable)}; ITEMS = {"42":{"name":"測試素材","can_be_hq":true,"level":100}}; INGREDIENTS = {"${recipe.id}":[[42,2]]};`, ctx);
    if (syncMap) ctx.CraftSync.setData(syncMap);
    if (stageMap) ctx.CraftStages.setData(stageMap);
    return { ctx, ingredients, store, stageEl };
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
  stable.ctx.CraftGear.onGearInput({ target: { dataset: { job: '木工', f: 'cms' }, value: '4100' } });
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
  synced.ctx.CraftGear.onGearInput({ target: { dataset: { job: '木工', f: 'level' }, value: '70' } });
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

  // ===== T37：手動指定同步等級，必須走與「改角色數值」同一條成果保留路徑 =====
  // 由來（健檢 2026-08-15，correctness／perf-ux／ux-flows 三個維度獨立命中同一根因）：
  // B-011 修好的是 gear 路徑（onGearInput → refreshGearNote，會先記成果再套回），
  // 但 B-016 後來加的「手動指定等級」是 app.js 的 CraftSync.onChange **直呼 refreshSelectedGear**，
  // 完全繞過那段保留邏輯 ⇒ 在等級同步的宇宙配方上打一個數字，已填的 HQ 素材與目標品質靜默歸零。
  // 成果默默遺失是本專案最忌諱的一類，且畫面全正常＝零回饋訊號。
  {
    const manual = mkT25Ctx({ recipe: syncRecipe, rlvTable: { 70: rlv70, 100: rlv100 }, syncMap: { '2': 100 }, level: 100 });
    manual.ctx.loadGear();
    manual.ctx.selectRecipe(2);
    const mTarget = manual.ctx.document.getElementById('opt-target');
    mTarget.value = '900';
    manual.ingredients._inputs[0].value = '1';
    manual.ctx.updateInitial(syncRecipe, 1000);

    const ls = manual.ctx.document.getElementById('ls-level');
    ls.value = '70';
    ls._fire('input');                     // 真的走使用者那條路：輸入事件 → setOverride → onChange

    const mRlv = vm.runInContext('selected.rlv', manual.ctx);
    eq('T37 手動指定等級 → 生效 rlv 改為 Lv70 基準', mRlv.id, 70);
    eq('T37 手動指定等級 → 目標品質保留並收在新品質上限', mTarget.value, '700');
    eq('T37 手動指定等級 → HQ 素材數量保留', manual.ingredients._inputs[0].value, '1');
    // 說明面板必須跟著更新（原本唯一呼叫 CraftSync.render 的地方在 refreshSelectedGear 裡，
    // 改走 refreshGearNote 後若沒補這一刀，面板會停在舊等級 ⇒ 修一個 bug 換一個 bug）
    const last = manual.ctx.CraftSync._last();
    eq('T37 手動指定等級 → 等級同步說明跟著重繪（生效等級）', last && last.info && last.info.level, 70);
    eq('T37 手動指定等級 → 說明標明是手動指定', last && last.info && last.info.manual, true);
  }

  // ===== T52 接線：多職業時優先挑「玩家有填數值」的職業 =====
  // 只驗 export 是空殼。這裡用真的 gearsets（只有木工有數值）驗選擇邏輯：
  // 站台若挑了他沒練的職業，他按求解只會被擋在角色數值頁 —— 而宇宙探索那批中間材
  // 動輒 3〜12 個職業可做，挑錯的機率不低。
  {
    const c = mkT25Ctx({ recipe: baseRecipe, rlvTable: { 90: baseRlv }, level: 90 });
    c.ctx.loadGear();
    // 同一件東西三個職業可做，且**鍛造排在最前面**（玩家沒填鍛造的數值）
    vm.runInContext(`
      RECIPE_BY_ID = { 10: { id:10, item_id:777, item_name:'多職品', job:'鍛造', item_amount:1 },
                       11: { id:11, item_id:777, item_name:'多職品', job:'木工', item_amount:1 } };
      RECIPES_BY_ITEM = { 777: [10, 11] };`, c.ctx);
    const CRr = c.ctx.CraftRecipe;
    eq('T52 三個職業可做 → recipesForItem 全部列出（不是只給第一個）', CRr.recipesForItem(777).length, 2);
    eq('T52 優先挑玩家有填數值的職業（木工），不是排最前面的鍛造', CRr.pickRecipeForItem(777).job, '木工');
    // 都沒填 → 沿用第一個（不假裝知道，畫面上仍給切換鈕）
    vm.runInContext(`gearsets = {};`, c.ctx);
    eq('T52 都沒填數值 → 沿用第一個', CRr.pickRecipeForItem(777).job, '鍛造');
  }

  // ===== T45：返回配方列表也要作廢飛行中的求解（CF-04）=====
  // app-solve.js 的註解早就宣告「供外部（換配方 / 返回配方列表）作廢當前求解」，但 showPicker 沒有呼叫它
  // ⇒ 返回列表後 UI 狀態（solve-btn 藏著、cancel-btn 亮著）殘留到新配方頁面，舊求解還在燒 CPU。
  // 契約寫在註解裡而程式碼另一套——與 2026-08-02 那次「selectRecipe 是否真的作廢」同型。
  {
    const before = invalidated;
    stable.ctx.showPicker();
    eq('T45 返回配方列表 → 作廢飛行中的求解', invalidated, before + 1);
  }

  // ===== T46：手動指定等級的 clamp 要回寫輸入框（CF-06）=====
  // 不回寫的話畫面停在 150 而實際生效的是 100，兩個數字不一致且沒有訊號
  // （之後的重繪刻意不覆寫使用者正聚焦的欄位，所以不會自己更正）。同 app-gear.js 的等級 clamp 行為。
  {
    const c = mkT25Ctx({ recipe: syncRecipe, rlvTable: { 70: rlv70, 100: rlv100 }, syncMap: { '2': 100 }, level: 100 });
    c.ctx.loadGear(); c.ctx.selectRecipe(2);
    const inp = c.ctx.document.getElementById('ls-level');
    // **必須模擬「使用者正聚焦在這一欄」**：CraftSync.render 對聚焦中的欄位刻意不覆寫，
    // 而那正是真實情境（人剛打完字）。不設 activeElement 的話 render 會順手把值寫回去、
    // 把 bug 遮掉 —— 這條斷言就變成恆綠的空殼（第一版就是這樣寫的，突變測試抓到）。
    c.ctx.document.activeElement = inp;
    inp.value = '150'; inp._fire('input');
    eq('T46 超上限 → 回寫成 100', inp.value, '100');
    inp.value = '0'; inp._fire('input');
    eq('T46 低於下限 → 回寫成 1', inp.value, '1');
    inp.value = ''; inp._fire('input');
    eq('T46 清空 → 維持空（＝跟隨角色等級，不硬填數字）', inp.value, '');
  }

  // ===== T43：需要專家之證的兩個選項，保存的偏好要套得回來 =====
  // 由來（健檢 2026-08-15 correctness-core）：init 的順序是 loadSolveOpts() → refreshSpecialistGate()，
  // 而那時還沒選配方（selected == null）⇒ 閘一律關 → 剛讀回來的勾選當場被清掉；
  // 之後選了有專家之證的職業，閘只是「可勾」而不會把玩家的選擇勾回去 ⇒ 這個偏好**永遠套不回**，
  // 每次開站都要重勾一次（而且他不會知道為什麼）。
  {
    const opts = JSON.stringify({ 'opt-heart': true, 'opt-qi': false });
    const withSpec = mkT25Ctx({ recipe: baseRecipe, rlvTable: { 90: baseRlv }, level: 90,
      gearExtra: { specialist: true }, extraStore: { 'ffxiv-crafter-solve-opts-v1': opts } });
    withSpec.ctx.loadGear();
    withSpec.ctx.selectRecipe(1);
    eq('T43 有專家之證 → 保存的「專心致志」勾選套得回來',
      withSpec.ctx.document.getElementById('opt-heart').checked, true);
    eq('T43 有專家之證 → 沒勾的維持沒勾（不是一律勾回來）',
      withSpec.ctx.document.getElementById('opt-qi').checked, false);

    const noSpec = mkT25Ctx({ recipe: baseRecipe, rlvTable: { 90: baseRlv }, level: 90,
      extraStore: { 'ffxiv-crafter-solve-opts-v1': opts } });
    noSpec.ctx.loadGear();
    noSpec.ctx.selectRecipe(1);
    eq('T43 沒有專家之證 → 強制取消勾選（不產出玩家按不出來的巨集）',
      noSpec.ctx.document.getElementById('opt-heart').checked, false);
    // 關鍵：此時若因為別的選項變動而存檔，不得把玩家的偏好一起洗掉
    noSpec.ctx.saveSolveOpts();
    eq('T43 閘關著時存檔 → localStorage 仍記得玩家的偏好（他只是暫時拔了證）',
      JSON.parse(noSpec.store['ffxiv-crafter-solve-opts-v1'])['opt-heart'], true);
  }

  // 接線層：refreshGearNote 真的有把「檔次」交給 CraftStages 重推嗎？
  // T38 驗的是 CraftStages 那兩支 API 本身，**不驗有沒有人用它** —— 少了這一條，
  // 把 refreshGearNote 改回「保留絕對數字」照樣全綠（本 repo 已有兩次空殼斷言前科）。
  {
    const staged = mkT25Ctx({ recipe: syncRecipe, rlvTable: { 70: rlv70, 100: rlv100 },
      syncMap: { '2': 100 }, stageMap: { '2': { src: 'cosmic', stages: [50, 60, 85] } }, level: 100 });
    staged.ctx.loadGear();
    staged.ctx.selectRecipe(2);          // rlv100 → 滿品質 1000 → 三階 = ceil(1000×85%) = 850
    const sTarget = staged.ctx.document.getElementById('opt-target');
    eq('T38 接線：選配方後階段選項已建好（滿品質＋三階＋自訂）',
      staged.stageEl.options.map((o) => o.value).join(','), ',500,600,850,custom');
    staged.stageEl.value = '850'; sTarget.value = '850';   // 玩家選三階

    const ls = staged.ctx.document.getElementById('ls-level');
    ls.value = '70'; ls._fire('input');                    // 等級同步降到 Lv70 → 滿品質 700
    eq('T38 接線：rlv 降級後目標依新滿品質重推三階（ceil(700×85%)）', sTarget.value, '595');
    eq('T38 接線：下拉指到新的三階，不是「自訂」', staged.stageEl.value, '595');
  }

  // 生效 rlv 沒變的那條路也要重繪說明：等級數字本身是說明文字的一部分
  // （Lv91→92 在同一個 rlv 級距內 → 走 cheap path，面板不重繪就會一直寫著 91）
  {
    const same = mkT25Ctx({ recipe: syncRecipe, rlvTable: { 70: rlv70, 100: rlv100 }, syncMap: { '2': 100 }, level: 100 });
    same.ctx.loadGear();
    same.ctx.selectRecipe(2);
    const ls = same.ctx.document.getElementById('ls-level');
    ls.value = '100'; ls._fire('input');   // 手動指定 100 ＝ 與目前生效的 rlv 相同 → 不重繪配方詳情
    const last = same.ctx.CraftSync._last();
    eq('T37 生效 rlv 未變 → 說明仍要重繪並標明手動指定', last && last.info && last.info.manual, true);
  }
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
  // 掃描本身也要有下限：glob 壞掉／目錄搬家時「掃到 0 支」同樣是全綠，那是最糟的假保護。
  // 逐一點名幾支一定要在的（含前一版清單漏掉的三支），比只比數字更難被「順手改壞」。
  {
    const must = ['app.js', 'app-quests.js', 'app-gear.js', 'app-recipe.js', 'worker.js'];
    const missing = must.filter((f) => !HANDWRITTEN_JS.includes(f));
    check('T6 靜默-catch 哨兵的掃描範圍涵蓋全部站台模組（掃到 0 支也算失敗）',
      missing.length === 0 && HANDWRITTEN_JS.length >= 13,
      `缺=${missing.join(',') || '無'} 掃到 ${HANDWRITTEN_JS.length} 支`);
  }

  // sec A2 行為回歸：壞掉／錯型別的 localStorage 不得靜默當成正常空設定。
  const mkGearLoadCtx = (raw) => {
    const warnings = [], toasts = [];
    const el = () => ({ addEventListener() {}, classList: { toggle() {}, add() {}, remove() {} },
      setAttribute() {}, getAttribute() { return null; }, querySelectorAll() { return []; } });
    const store = { 'ffxiv-crafter-gearsets-v1': raw };
    const ctx = {
      ...LAYER_STUBS(),
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

  // ===== T40：保存失敗必須讓玩家知道（無痕/私密模式）=====
  // 由來（健檢 2026-08-15，resilience／quality／ux-flows 三維同一根因）：六個 localStorage 保存點裡，
  // 角色數值／食藥／職業任務／求解選項都會 toast，**只有製造清單與等級同步是靜默的**。
  // 玩家會一路加十幾個配方、關掉分頁才發現整份清單不見了 —— 而且 console.warn 他不會看。
  {
    box.store = null; notifyN = 0; toasts.length = 0;
    CL.init(mkDeps());
    const realSet = cl.localStorage.setItem;
    cl.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    CL.add(100);
    const hit = () => toasts.filter(([m]) => /製造清單/.test(m) && /遺失|保存|儲存/.test(m));
    eq('T40 保存失敗 → 明確告知玩家（不是只寫 console）', hit().length, 1);
    check('T40 保存失敗的告知是 warn 級', (hit()[0] || [])[1] === 'warn');
    CL.add(100); CL.add(200);
    eq('T40 持續失敗 → 只提醒一次（每次加減都跳 toast 會變噪音）', hit().length, 1);
    cl.localStorage.setItem = realSet;
  }
}

// ===== T58：素材總需求分三組 + 「加進清單」一次加 N 次（Owner 2026-08-19：這區太陽春）=====
// 三件事只有資料斷言擋得住（畫面全都「正常」）：
//   ① 可自製／採買／晶體要分開 —— 混成一坨時玩家看不出哪些其實該自己做
//   ② 傳下去的是「做幾次」不是「要幾個」（同 craftPlan 鐵則）：一次產 3 個時要 4 個只需做 2 次，
//      傳錯的話清單次數整批偏高，而畫面完全正常
//   ③ 撞單筆上限要誠實（沿用 add() 的既有取捨，不謊報加了 N 次）
{
  const CL_SRC = fs.readFileSync(path.join(ROOT, 'crafting-list.js'), 'utf8');
  const stubEl = () => ({ innerHTML: '', textContent: '', dataset: {},
    classList: { toggle() {}, add() {}, remove() {} },
    querySelector() { return null; }, querySelectorAll() { return []; },
    appendChild() {}, addEventListener() {}, onclick: null });
  const cell = stubEl();                       // #craft-list：要保留 innerHTML 才驗得到渲染結果
  const box = { store: null };
  const cl = { console,
    localStorage: { getItem() { return box.store; }, setItem(k, v) { box.store = v; }, removeItem() { box.store = null; } },
    document: { getElementById() { return stubEl(); }, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return stubEl(); }, body: stubEl() } };
  cl.globalThis = cl;
  vm.createContext(cl);
  vm.runInContext(CL_SRC, cl, { filename: 'crafting-list.js' });
  const CL = cl.CraftList;
  const MID = { id: 50, item_name: '中間材', item_amount: 3, job: '鍛造', rlv: 1, item_id: 5 };
  const RECIPES = [{ id: 100, item_name: '成品', item_amount: 1, job: '鍛造', rlv: 1, item_id: 900 }, MID];
  const toasts = [];
  const deps = { $: () => cell, esc: (s) => s, iconUrl: () => '', RECIPES,
    ITEMS: { 5: { name: '中間材' }, 6: { name: '鐵礦' }, 7: { name: '火之晶' } },
    INGREDIENTS: { 100: [[5, 4], [6, 2], [7, 1]] },
    selectRecipe() {}, switchTab() {}, showPicker() {}, toast: (m, v) => toasts.push([m, v]),
    copyText() {}, mbItem: () => '#', mbCraft: () => '#', MARKETBOARD_BASE: '#',
    isCrystal: (iid) => iid === 7,
    pickRecipeForItem: (iid) => (iid === 5 ? MID : null),
    vendorHtml: (iid) => (iid === 6 ? '<span class="codex-badge crafter-qt-tag--shop">🏪 100 G</span>' : ''),
    onChange() {}, goSolve() {} };

  box.store = JSON.stringify([{ id: 100, qty: 1 }]);
  CL.init(deps);
  const html = () => cell.innerHTML;
  check('T58 三組都出（可自製／採集購買／晶體）',
    /可自製中間材/.test(html()) && /採集／購買/.test(html()) && /晶體/.test(html()));
  check('T58 可自製的素材給「加進清單」入口', /cl-mat-go[^>]*data-rid="50"/.test(html()));
  check('T58 傳的是「做幾次」不是「要幾個」（要 4 個、一次產 3 → 做 2 次）',
    /data-times="2"/.test(html()) && !/data-times="4"/.test(html()), html());
  check('T58 買得到的素材掛商人徽章（沿用職業任務那支 vendorHtml）', /crafter-qt-tag--shop/.test(html()));
  check('T58 晶體不給假入口（做不出來也沒商人）',
    (html().match(/cl-mat-go/g) || []).length === 1 && (html().match(/crafter-qt-tag--shop/g) || []).length === 1);
  check('T58 卡頭標出種數與合計件數', /3 種 · 合計 7 個/.test(html()), html().slice(0, 200));

  CL.addRuns(50, 2);
  eq('T58 addRuns 一次加 2 次製作', CL.count(50), 2);
  eq('T58 addRuns 只噴一次 toast（不是 add() 呼叫兩次）', toasts.length, 1);
  toasts.length = 0;
  CL.addRuns(50, 999);
  eq('T58 撞上限 → 夾到 999', CL.count(50), 999);
  const lt = toasts[toasts.length - 1] || ['', ''];
  check('T58 撞上限 → warn 且說出實際加到幾次（不謊報）', lt[1] === 'warn' && /999/.test(lt[0]), JSON.stringify(lt));
  eq('T58 未知配方 id → 不入清單', (CL.addRuns(999, 2), CL.count(999)), 0);

  // 就地取消：− 是「退一次」不是「整筆清掉」——加了 3 次的人按一下只想退一次
  {
    box.store = JSON.stringify([{ id: 50, qty: 3 }]);
    CL.init(deps);
    toasts.length = 0;
    CL.removeOne(50);
    eq('T58 removeOne → 一次 −1（不是整筆清掉）', CL.count(50), 2);
    CL.removeOne(50); CL.removeOne(50);
    eq('T58 removeOne 減到 0 → 整筆移除', CL.has(50), false);
    const last = toasts[toasts.length - 1] || [''];
    check('T58 移除時說得出是哪一筆', /中間材/.test(last[0]), JSON.stringify(last));
    eq('T58 不在清單時 removeOne 無副作用', (CL.removeOne(50), CL.count(50)), 0);
  }
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
    { id: 1, name: '青銅錠', nameSc: '青铜锭', job: '鍛造', rlv: 10, level: 5, icon: null, category: '金屬', diff: 1200, qual: 3400 },
    { id: 2, name: '橡木材', nameSc: '橡木材', job: '木工', rlv: 20, level: 15, icon: null, category: '木材', diff: 300, qual: 900, expert: true },
    { id: 3, name: '亞麻布', nameSc: '亚麻布', job: '裁縫', rlv: 30, level: 25, icon: null, category: '布料', diff: null, qual: null },
  ];
  CB.init(DEP);

  CB.renderChips();
  eq('T11 renderChips → 9 顆職業按鈕（全部+8 DoH）', ($('job-chips').innerHTML.match(/job-btn/g) || []).length, 9);

  const rowCount = () => ($('recipe-table').innerHTML.match(/class="rt-row/g) || []).length;
  $('recipe-search').value = ''; $('level-filter').value = ''; $('rlv-filter').value = '';
  CB.renderTable();
  eq('T11 renderTable 無篩選 → 3 列', rowCount(), 3);
  eq('T11 recipe-count 顯示總數', $('recipe-count').textContent, '3 個配方');
  eq('T11 種類獨立欄渲染（rt-cat）', /rt-cat[^>]*>金屬</.test($('recipe-table').innerHTML), true);

  // 2026-08-19（Owner：名稱跟類別擠在一起、空間沒用滿）：種類由名稱副行拉成獨立欄，並補難度／品質。
  // 欄數是 CSS 那組 `nth-child` 百分比寬的隱性契約 —— 只加 <td> 不改 CSS 的話最後一欄會被擠掉，
  // 而畫面只是「有點怪」不會報錯 ⇒ 這裡把兩邊一起釘住。
  {
    const html = $('recipe-table').innerHTML;
    eq('T11 表頭 8 欄（名稱/種類/職業/Lv/配方等級/難度/品質/加入）', (html.match(/<th[ >]/g) || []).length, 8);   // [ >] 才不會把 <thead 也算進去
    const cssCols = (CSS_SRC.match(/\.rt th:nth-child\(\d\)/g) || []).length;
    eq('T11 CSS 的欄寬宣告數 == 表頭欄數（漏一欄＝版面靜默走鐘）', cssCols, 8);
    check('T11 難度／品質欄有值（來自 RINDEX 的 recipeMaxes 快照）', /<td>1200<\/td><td>3400<\/td>/.test(html), html.slice(0, 400));
    check('T11 名稱不再有副行 wrapper（rt-nmwrap 已退場）', !/rt-nmwrap/.test(html) && !/rt-nmwrap/.test(CSS_SRC));
    // 缺 rlv 列時 app.js 給 null ⇒ 顯「—」而不是假的 0（0 難度會被讀成「這配方超簡單」）
    check('T11 難度／品質缺值 → 顯「—」不顯 0', /<td>—<\/td><td>—<\/td>/.test(html), html.slice(0, 400));
    // 加入鈕改內嵌向量（全形「＋」的重量／垂直位置隨系統字型跑）
    check('T11 加入鈕是向量不是字元', /class="[^"]*rt-add[^"]*"[^>]*>\s*<svg/.test(html) && !/>＋</.test(html));
    check('T11 加入鈕仍是 ghost 圖示鈕（列級豁免：不參賽 primary）',
      /rt-add/.test(html) && !/codex-btn--primary[^>]*rt-add|rt-add[^>]*codex-btn--primary/.test(html));
    check('T11 SVG 有本地尺寸（.codex-btn--icon 不管內嵌 svg 大小）', /\.rt-add > svg[^}]*width:/.test(CSS_SRC));
    check('T11 index.html 有 #expert-filter（app-browse 直接讀它，缺了 renderTable 當場炸）',
      /id="expert-filter"/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
    // 實測踩過：控件加進 index.html、篩選邏輯也寫了，但**沒接 change** ⇒ 畫面上有一顆按了沒反應的下拉，
    // 且 console 全乾淨（T11 的 renderTable 直呼測試也照樣綠）。接線只有原始碼斷言擋得住。
    check('T11 #expert-filter 有接 change → renderTable（有控件沒接線＝按了沒反應）',
      /\$\('expert-filter'\)\.addEventListener\('change'/.test(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8')));
  }

  // 高難度（expert）＝**配方屬性**不是名字（Owner 2026-08-19 特別澄清）：遊戲內製作狀態隨機，
  // 靜態巨集只能當參考 ⇒ 想練的人要找得到、想避的人要濾得掉，而它在列表上原本完全沒有痕跡。
  {
    check('T11 高難度配方掛徽章', /rt-expert[^>]*>高難度</.test($('recipe-table').innerHTML));
    eq('T11 沒掛徽章的列不會被誤標', ($('recipe-table').innerHTML.match(/rt-expert/g) || []).length, 1);
    $('expert-filter').value = 'only'; CB.renderTable();
    eq('T11 只看高難度 → 1 列', rowCount(), 1);
    check('T11 只看高難度 → 留下的是那筆 expert', /橡木材/.test($('recipe-table').innerHTML));
    $('expert-filter').value = 'hide'; CB.renderTable();
    eq('T11 排除高難度 → 2 列', rowCount(), 2);
    check('T11 排除高難度 → 那筆 expert 不在', !/橡木材/.test($('recipe-table').innerHTML));
    // 只設高難度篩選而 0 命中時要說「無符合配方」，不是一片空白（同 rlvVal 那條的既有教訓）
    $('expert-filter').value = 'only';
    rindex = [{ id: 1, name: '青銅錠', job: '鍛造', rlv: 10, level: 5, icon: null, category: '金屬' }];
    CB.renderTable();
    eq('T11 僅高難度篩選 0 命中 → 「無符合配方」', $('recipe-count').textContent, '無符合配方');
    $('expert-filter').value = '';
    rindex = [
      { id: 1, name: '青銅錠', nameSc: '青铜锭', job: '鍛造', rlv: 10, level: 5, icon: null, category: '金屬', diff: 1200, qual: 3400 },
      { id: 2, name: '橡木材', nameSc: '橡木材', job: '木工', rlv: 20, level: 15, icon: null, category: '木材', diff: 300, qual: 900, expert: true },
      { id: 3, name: '亞麻布', nameSc: '亚麻布', job: '裁縫', rlv: 30, level: 25, icon: null, category: '布料', diff: null, qual: null },
    ];
    CB.renderTable();
    // 篩選指紋漏掉新控件的話：切篩選不回第 1 頁，玩家會停在不存在的頁而看到空表
    check('T11 高難度篩選有進 filterKey（切換會回第 1 頁）', /expert-filter/.test(AB_SRC.split('function filterKey')[1].slice(0, 300)));
  }

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

  // ===== 就地取消（Owner 2026-08-19：「不要一定得到清單才能取消，＋右邊多一個取消不就好了」）=====
  // markListState 是 in-place 更新（不重建表）⇒ − 鈕必須**先 render 再用 hidden 收合**，
  // 不能「不在清單就不 render」——那會在每次清單變動時重建 DOM、把焦點吃掉。
  {
    rindex = [{ id: 1, name: '青銅錠', job: '鍛造', rlv: 10, level: 5, icon: null, category: '金屬', diff: 1, qual: 2 }];
    $('recipe-search').value = ''; $('expert-filter').value = '';
    // markListState 要能真的抓到列與鈕 → 這裡給一個會回傳假 tr/鈕的表格節點
    const delBtn = { hidden: false, dataset: { id: '1' } };
    const badgeLine = { querySelector: () => null, appendChild() {} };
    const tr = { dataset: { id: '1' }, classList: { toggle() {} },
      querySelector: (sel) => (sel === '.rt-del' ? delBtn : badgeLine) };
    const tbl = $('recipe-table');
    tbl.querySelectorAll = (sel) => (sel === '.rt-row' ? [tr] : []);
    CB.renderTable();
    const html = tbl.innerHTML;
    check('T11 每列都渲染 − 鈕（預設 hidden，不是不 render）', /rt-del[^>]*hidden|hidden[^>]*rt-del/.test(html), html.slice(0, 600));
    check('T11 − 鈕不是 danger（列級豁免：一表 60 顆紅 ✕＝紅色的狼來了）', !/rt-del[^>]*--danger|--danger[^>]*rt-del/.test(html));
    ab.CraftList = { count: () => 0, removeOne() {}, add() {} };
    CB.markListState();
    eq('T11 不在清單 → − 收起（不留一顆按了沒反應的鈕）', delBtn.hidden, true);
    ab.CraftList.count = () => 2;
    CB.markListState();
    eq('T11 已在清單 → − 出現', delBtn.hidden, false);
    // Owner 2026-08-19：− 出現／消失都不得推動 ＋。槽位固定＝兩欄定寬 grid（flex 會在 − 收掉時重新置中，
    // ＋ 往左跳一格 ⇒ 剛按完「加入」的游標正好停在 − 上，下一下就誤點成移除）。
    check('T11 ＋− 是固定兩格槽位（− 收掉時 ＋ 不位移）',
      /\.rt-act \.rt-actwrap\s*\{[^}]*inline-grid[^}]*grid-template-columns:\s*repeat\(2,/.test(CSS_SRC), 'CSS 未定義定寬兩欄槽位');
    // 點 − 要打到 removeOne（不是 add，也不是選配方進詳情）
    let removed = null, added = null, selected2 = null;
    ab.CraftList = { count: () => 1, removeOne: (id) => { removed = id; }, add: (id) => { added = id; } };
    const target = { closest: (sel) => (sel === '.rt-del' ? { dataset: { id: '1' } } : null) };
    DEP.selectRecipe = (id) => { selected2 = id; };
    CB.init(DEP); CB.renderTable();
    tbl.onclick({ target });
    eq('T11 點 − → removeOne(該配方)', removed, 1);
    check('T11 點 − 不會順便 add，也不會進配方詳情', added === null && selected2 === null);
    delete ab.CraftList;
  }

  // ===== 表格高度＝當前螢幕還剩多少（Owner 2026-08-19：只捲表格、不要連外層一起捲）=====
  // 實測踩過的坑：拿 `document.scrollHeight` 反推「表格下方佔多高」會**越縮越小**——portal 的 body
  // 公式是 `min-height:100vh` ＋ `padding-top:64px`，文件高度恆為 100vh+64、與內容無關 ⇒ 每量一次
  // 就多扣一截（實測 489→419→349）。症狀是「視窗縮放幾次後表格只剩一條縫」，不會有任何錯誤訊息。
  {
    check('T11 fitHeight 不得用 document.scrollHeight 反推（body 公式使文件高度與內容無關）',
      !/scrollHeight/.test(AB_SRC.split('function fitHeight')[1].split('function renderTable')[0]));
    const rect = { top: 100, height: 400, bottom: 500 };
    const host = { getBoundingClientRect: () => ({ bottom: 600 }) };
    const el = $('recipe-table');
    el.style = {}; el.offsetParent = {}; el.getBoundingClientRect = () => rect;
    el.closest = (sel) => (sel === 'main' ? host : null);
    el.querySelector = () => null;
    ab.window = { innerHeight: 800, addEventListener() {} };
    CB.fitHeight();
    eq('T11 表格高度＝視窗高 − 上緣 − 下方佔用 − 呼吸空隙', el.style.maxHeight, '592px');
    CB.fitHeight(); CB.fitHeight();
    eq('T11 連呼三次高度不變（冪等，不會越縮越小）', el.style.maxHeight, '592px');
    ab.window.innerHeight = 400;   // 極矮視窗：算出來會是負的 → 收在下限，不得把表格壓成一條縫
    CB.fitHeight();
    eq('T11 極矮視窗 → 收在最小高度（約 6 列）', el.style.maxHeight, '240px');
    delete el.getBoundingClientRect; delete el.offsetParent; delete el.closest; el.querySelector = () => null;
  }

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

  // setTargetMode：「只求完成（NQ）」不吃目標品質 → 目標欄與**品質階段下拉**都要停用。
  // 只停用目標欄的話，玩家仍可在下拉選「三階」——選了完全不生效（onStageChange 寫進一個停用的欄位），
  // 一個「按了沒反應」的控制項比停用更難懂（健檢 2026-08-15 ux-flows）。
  {
    const fels = {};
    fl.document = { getElementById: (id) => fels[id] || (fels[id] = { value: '', disabled: false, hidden: false, addEventListener() {} }) };
    fl.document.getElementById('solve-mode').value = 'nq';
    fl.CraftFlow.setTargetMode();
    eq('T14 NQ 模式 → 目標品質欄停用', fels['opt-target'].disabled, true);
    eq('T14 NQ 模式 → 品質階段下拉一併停用', fels['opt-target-stage'].disabled, true);
    eq('T14 NQ 模式 → 寫出原因（控制不隱藏、要說為什麼）', fels['target-why'].hidden, false);
    fels['solve-mode'].value = 'hq';
    fl.CraftFlow.setTargetMode();
    eq('T14 一般模式 → 目標品質欄恢復', fels['opt-target'].disabled, false);
    eq('T14 一般模式 → 品質階段下拉恢復', fels['opt-target-stage'].disabled, false);
    delete fl.document;   // T17 以下不需要 DOM，還原以免相互影響
  }

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

  // ===== T38：生效 rlv 改變時要保留「哪一檔」，不是那個絕對數字 =====
  // 由來（健檢 2026-08-15 correctness-data）：宇宙任務的門檻是**滿品質的百分比**，
  // rlv 一變同一檔就是不同數字。原本 refreshGearNote 在 rlv 改變時保留的是絕對品質再收斂到新上限
  // ⇒ 等級同步的宇宙配方降級後，玩家選的「三階」變成一個舊 rlv 才成立的數字，
  // 而下拉會翻成「自訂」——畫面上看不出哪裡不對，求出來的手法卻是照錯目標算的。
  {
    const stage = $q('opt-target-stage'), target = $q('opt-target');
    QS.setRecipe({ id: 36199 }, 14900);                    // Lv100：滿品質 14900
    stage.value = '12665'; target.value = '12665';         // 玩家選三階（85%）
    const keep = QS.stageSelection();
    eq('T38 選了三階 → stageSelection 回檔次 2（不是絕對品質）', keep, 2);

    QS.setRecipe({ id: 36199 }, 8000);                     // 等級同步降級：滿品質變 8000
    eq('T38 換 rlv 後套回同一檔 → 回 true', QS.applyStageSelection(keep), true);
    eq('T38 換 rlv 後套回同一檔 → 目標依新滿品質重推（ceil(8000×85%)）', target.value, '6800');
    eq('T38 換 rlv 後套回同一檔 → 下拉指到新的三階', stage.value, '6800');

    // 「滿品質」也是一種選擇（空字串），要能原樣保留
    stage.value = ''; target.value = '';
    eq('T38 選了滿品質 → stageSelection 回 full', QS.stageSelection(), 'full');
    QS.setRecipe({ id: 36199 }, 9000);
    eq('T38 滿品質套回 → 目標維持留空（＝滿品質，語意與手動清空一致）',
      QS.applyStageSelection('full') && target.value, '');

    // 自訂（手打的數字）不屬於任何一檔 → 不能硬套成某一檔，讓呼叫端沿用既有的絕對值收斂
    QS.setRecipe({ id: 36199 }, 14900);
    stage.value = 'custom'; target.value = '9999';
    eq('T38 自訂數字 → stageSelection 回 null（不猜檔次）', QS.stageSelection(), null);
    eq('T38 自訂數字 → applyStageSelection 回 false（呼叫端自行處理）', QS.applyStageSelection(null), false);

    // 新 rlv 下這一檔不存在（值算出來是 0）→ 同樣不硬湊
    QS.setData({ 901: { src: 'collectable', stages: [0, 160, 200] } });
    QS.setRecipe({ id: 901 }, 99999);
    stage.value = '1600';
    const keep2 = QS.stageSelection();
    eq('T38 缺一階時 → 檔次仍以原始位置計（二階＝1）', keep2, 1);
  }
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
      ...LAYER_STUBS(),
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
      ...LAYER_STUBS(),
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
      ...LAYER_STUBS(),
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
    ...LAYER_STUBS(),
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
    // 交付數量的對帳命中率 ratchet（B-030）：同檔的 vendors／hq 早就有，唯獨 qty 沒有。
    // 對帳是「社群名 → item id，且 id 要與解包相符」三段查詢——上游任一段退步（opencc 沒裝、
    // 試算表換欄位、item_lookup 改名）都會讓命中數掉下來，而畫面只是多幾件標「數量未知」。
    // 兩個 fail-open 疊在一起：build 端不當錯誤、前端把未知當 1 份估算 ⇒ 採購量整批偏掉而全程零訊號。
    const qtyKnown = items.filter((it) => it.qty != null).length;
    check(`T31 交付數量的對帳命中率不得倒退（現況 228/290，實測 ${qtyKnown}）`, qtyKnown >= 228, qtyKnown);
    check('T31 交付物總數不得縮水（解包任務表變少要有人知道）', items.length >= 290, items.length);
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
    selectRecipe: () => true, switchTab() {}, copyText() {}, getItems: () => ({}), getIngredients: () => ({}),
    getRecipesById: () => ({}), getRecipeByItem: () => ({}) });
  Q.setVendors({
    1: { shop: 1, price: 18, npcs: [{ npc: '斯姆爾維布', title: '行會供應商', zone: '烏爾達哈現世回廊', x: 10.6, y: 9.6 }], more: 5 },
    2: { shop: 1 },
    // 通用商人：資料裡只有名字沒有座標（實測楓木方盾就是這樣）——不能因此當成「查不到商人」
    4: { shop: 1, price: 72, npcs: [{ npc: '雜用商人', title: '購物&修理' }, { npc: '武具商' }] },
  });

  const full = Q.vendorHtml(1), bare = Q.vendorHtml(2), none = Q.vendorHtml(3);
  check('T32 沒有商人資料的物品不出徽章', none === '');
  check('T32 有販售地點時寫出地名、座標、NPC 與單價',
    /烏爾達哈現世回廊/.test(full) && /10\.6, 9\.6/.test(full) && /斯姆爾維布/.test(full) && /18 G/.test(full));
  check('T32 NPC 太多時用「另有 N 處」帶過，不塞一長串', /另有 5 處/.test(full));
  check('T32 只知道「有賣」但不知道在哪 → 誠實說沒有販售地點資料',
    /商人有賣/.test(bare) && /沒有這件的販售地點資料/.test(bare));
  // 沒座標≠沒商人：第一版用 `if n.zone` 過濾，把「武具商」這種通用商人整批丟掉，
  // 畫面說「沒有販售地點資料」，但遊戲裡到處都買得到（Owner 2026-08-09 指出）。
  {
    const generic = Q.vendorHtml(4, false);
    check('T32 沒有座標的通用商人照樣列出名字與稱號',
      /雜用商人/.test(generic) && /武具商/.test(generic) && /72 G/.test(generic));
    check('T32 有商人時不得再說「沒有販售地點資料」', !/沒有這件的販售地點資料/.test(generic));
  }

  // 資料檔不變量：vendors.json 每筆都是解包確認有賣；帶 NPC 的必須有地名（沒地名的地點資訊沒用）
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'vendors.json'), 'utf8'));
  const rows = Object.values(v);
  check('T32 vendors.json 每筆都是「解包確認有 NPC 賣」', rows.length > 0 && rows.every((e) => e.shop === 1));
  check('T32 每個 NPC 都至少有名字（沒名字的條目沒有意義）',
    rows.every((e) => !e.npcs || e.npcs.every((n) => n.npc)));
  check('T32 帶座標的商人排在前面（能直接跑過去的優先）',
    rows.every((e) => !e.npcs || e.npcs.every((n, i, a) => i === 0 || !(n.zone && !a[i - 1].zone))));
  check('T32 「跟誰買」的覆蓋率沒有倒退（現況 247/256；社群資料時代只有 38）',
    rows.filter((e) => e.npcs && e.npcs.length).length >= 240);
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
    selectRecipe: () => true, switchTab() {}, copyText() {}, getItems: () => ({}), getIngredients: () => ({}),
    getRecipesById: () => ({}), getRecipeByItem: () => ({}) });
  Q.setVendors({ 7: { shop: 1, loc: '西薩納蘭-銅鈴銅山', price: 18 } });

  const nq = Q.vendorHtml(7, false);      // 任務不要求 HQ → 照常說買得到
  const hq = Q.vendorHtml(7, true);       // 任務要求 HQ → 商人資訊對這一格毫無用處
  const unknown = Q.vendorHtml(7, null);  // 不知道要不要 HQ → 要照實提醒

  check('T33 不要求 HQ → 徽章照常顯示可購買與單價', /18 G/.test(nq));
  // 商人根本不賣 HQ：寫「有賣」是誤導（買了交不掉），寫「只賣 NQ」是廢話（Owner 2026-08-09）
  check('T33 要求 HQ → 整個商人徽章不出現', hq === '');
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


// ===== T34：複製品名鈕必須走 portal 共用元件（不自刻 emoji 鈕）=====
// 由來：複製鈕在 5 個 repo 各刻一份、glyph 四種不一致（📋/⧉/🔗），B-027 已把它升格成
// portal 的 `FFXIVIcons.btnHTML('copy', …)` ＋ `FFXIVClipboard.copy`。本站接上去時很容易
// 「順手寫個 📋 button」——那就白升格了，且 emoji 當功能性圖示會字型相依、拿不到 currentColor。
// 另一半是 HTML 合法性：素材列原本整列是 <a>，把 <button> 塞進去是非法嵌套，
// 而且點鈕會連帶跳頁（互動元素不得互套）。
{
  const QSRC = fs.readFileSync(path.join(ROOT, 'app-quests.js'), 'utf8');
  const mk = (withIcons) => {
    const calls = [];
    const ctx = { console, document: { getElementById: () => null }, localStorage: { getItem: () => null, setItem() {} } };
    if (withIcons) {
      ctx.FFXIVIcons = { btnHTML: (name, label, attrs) => { calls.push({ name, label, attrs }); return `<button class="codex-icon-btn" aria-label="${label}"><svg/></button>`; } };
    }
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(QSRC, ctx, { filename: 'app-quests-t34.js' });
    ctx.CraftQuests.init({ $: () => null, esc: (s) => String(s), iconUrl: () => '', toast() {}, mbItem: () => '#',
      selectRecipe: () => true, switchTab() {}, copyText() {}, getItems: () => ({}), getIngredients: () => ({}),
      getRecipesById: () => ({}), getRecipeByItem: () => ({}) });
    return { Q: ctx.CraftQuests, calls };
  };

  const shared = mk(true);
  const html = shared.Q.copyBtn('胡桃木材');
  eq('T34 有共用元件時一律走 FFXIVIcons.btnHTML（不自刻）', shared.calls.length, 1);
  eq('T34 用的是 copy 圖示', shared.calls[0].name, 'copy');
  check('T34 aria-label 帶得到品名（圖示鈕沒有可讀文字，SR 只剩這個）', /胡桃木材/.test(shared.calls[0].label));
  check('T34 品名寫進 data-copy-name（事件委派靠它取值）', shared.calls[0].attrs['data-copy-name'] === '胡桃木材');
  check('T34 產出的是 .codex-icon-btn', /codex-icon-btn/.test(html));

  // CDN 沒載到（本機沒開 portal svc）也要有一顆能按的鈕，功能不因此消失
  const bare = mk(false).Q.copyBtn('梣木木材');
  check('T34 無共用元件時退回可按的文字鈕、仍帶 aria-label 與 data-copy-name',
    /<button/.test(bare) && /aria-label=/.test(bare) && /data-copy-name="梣木木材"/.test(bare));
  check('T34 退場版不得用 emoji 當圖示（B-027 要收掉的正是這個）', !/📋|🔗/.test(bare));

  // 素材列結構：連結與按鈕同層，不得互套
  check('T34 素材列不再把整列包成 <a>（<a> 內不得放 <button>）',
    /class="crafter-qt-mat"/.test(QSRC) && /crafter-qt-mat__link/.test(QSRC));
  check('T34 複製鈕的點擊不得冒泡到旁邊的連結（preventDefault）',
    /data-copy-name/.test(QSRC) && /preventDefault\(\)/.test(QSRC));
  // 2026-08-15（DS-06）改為：分派（共用優先 → 本地退場）**只留在 copyText 一處**，
  // 各層一律走 deps.copyText。原本 app-quests 自己再判一次 FFXIVClipboard 是第二份同樣的邏輯。
  check('T34 複製走 deps.copyText（不在各層自己判一次 FFXIVClipboard）',
    /deps\.copyText\(/.test(QSRC) && !/FFXIVClipboard\s*&&/.test(QSRC));
  {
    const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    check('T34 共用優先的分派存在且只有一處（在 copyText 內）',
      /FFXIVClipboard\?\.copy|FFXIVClipboard\s*&&\s*|FFXIVClipboard\.copy/.test(APP));
    // 數**檔案數**不是出現次數：app.js 那支自然會提到兩次（一行註解 + 一行程式碼）。
    // 這條要擋的是「又有第二支檔案自己判一次共用實作在不在」。
    const files = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js'))
      .filter((f) => /FFXIVClipboard/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    check('T34 只有 app.js 提到 FFXIVClipboard（分派唯一出口，其餘層走 copyText）',
      files.length === 1 && files[0] === 'app.js', `實際：${files.join(', ') || '無'}`);
  }
}


// ===== T35：重複實作一律接共用（clipboard／移除鈕）=====
// Owner 2026-08-12：「有重複使用的請接共用」。portal 的 header.js 已有生態內最完整的
// clipboard（secure-context 判斷＋execCommand fallback＋toast）與功能性圖示組；本站原本各留一份。
// 這一組守的是「接了共用、但退場路徑仍在」——只接不留退場，本機沒開 portal svc 時複製會整個消失。
{
  // (a) app.js 的 copyText：有共用就用共用
  const calls = [];
  sandbox.window.FFXIVClipboard = { copy: (t, l) => { calls.push([t, l]); return true; } };
  try {
    T.copyText('/ac 製作 <wait.3>', '✓ 已複製巨集', '巨集');
    eq('T35 copyText 有共用實作時一律走 FFXIVClipboard.copy', calls.length, 1);
    eq('T35 文字原樣傳給共用實作', calls[0][0], '/ac 製作 <wait.3>');
    eq('T35 label 傳給共用實作當 toast 文字（不要兩套文案）', calls[0][1], '巨集');
  } finally {
    delete sandbox.window.FFXIVClipboard;
  }
  // 沒有共用時仍要能複製（退場路徑）——sandbox 無 navigator.clipboard → 走 execCommand 分支不得拋錯
  let threw = null;
  try { T.copyText('abc', '✓'); } catch (e) { threw = e; }
  check('T35 缺共用實作時退回本地 fallback，不得拋錯', threw === null);

  // (b) 純圖示鈕：清單移除鈕走共用 close 圖示，缺 CDN 退回字元鈕
  const LIST_SRC = fs.readFileSync(path.join(ROOT, 'crafting-list.js'), 'utf8');
  check('T35 清單移除鈕走共用 FFXIVIcons（close）', /FFXIVIcons(\?\.|\.)btnHTML\('close'/.test(LIST_SRC));
  check('T35 移除鈕保留 cl-del class（事件綁定靠它）', /class: 'cl-del'/.test(LIST_SRC));
  check('T35 缺 CDN 時仍有可按的移除鈕（退場路徑）', /aria-label="\$\{deps\.esc\(label\)\}">✕<\/button>/.test(LIST_SRC));

  // (c) 帶文字的動作鈕**刻意保留 emoji**：AGENTS「icon 節制」管的是身分/主操作，B-027 只收功能性小圖示。
  //     這條是負向哨兵——別哪天「順手統一」把它們也換成 SVG。
  check('T35 帶文字的動作鈕維持 emoji（📋 加入清單／📋 複製清單）',
    /📋 加入清單/.test(fs.readFileSync(path.join(ROOT, 'app-recipe.js'), 'utf8')) &&
    /📋 複製清單/.test(LIST_SRC));
}

// ===== T36：中性分組容器走共用 .codex-tint-panel--neutral（portal B-017d／B3 消費端遷移）=====
// 三個容器（.filter-group／.cfg-card／.cl-card）的幾何——8px 圓角／1px 中性邊／底色——
// 由 portal header.css 的 `.codex-tint-panel--neutral` 提供，底色以 `--panel-bg` 傳參。
// **守的是回退**：這種遷移最容易被「順手」還原成本地 background/border/border-radius，
// 而還原後畫面完全正常（值一樣），只是幾何又分岔成第二份事實源 ⇒ 日後 portal 調 8px 這裡不會跟上。
// padding 與外距**刻意留本地**（共用版的 8/12px 是給資訊盒用的），故不在此斷言。
{
  const HTML_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const LIST2_SRC = fs.readFileSync(path.join(ROOT, 'crafting-list.js'), 'utf8');
  const NEUTRAL = 'codex-tint-panel codex-tint-panel--neutral';

  // (a) 四個容器都要掛上共用 class（cl-card 由 crafting-list.js 動態產出，兩張卡都要）
  check('T36 .filter-group 掛共用中性面板', HTML_SRC.includes(`${NEUTRAL} filter-group`));
  // .result-summary 是 2026-08-13 那輪漏掉的第四個（幾何與共用版逐項相同，B-027 補遷）
  check('T36 .result-summary 掛共用中性面板', HTML_SRC.includes(`${NEUTRAL} result-summary`));
  eq('T36 兩張 .cfg-card 都掛共用中性面板',
    (HTML_SRC.match(new RegExp(`${NEUTRAL} cfg-card`, 'g')) || []).length, 2);
  eq('T36 兩張 .cl-card 都掛共用中性面板',
    (LIST2_SRC.match(new RegExp(`${NEUTRAL} cl-card`, 'g')) || []).length, 2);

  // (b) 本地不得再宣告這三個屬性（遷移的意義就在這裡；宣告了＝幾何有兩份）
  const bodyOf = (sel) => {
    const m = CSS_SRC.match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`));
    return m ? m[1] : null;
  };
  for (const sel of ['.filter-group', '.cfg-card', '.cl-card', '.result-summary']) {
    const body = bodyOf(sel);
    check(`T36 ${sel} 規則存在（padding 與外距仍留本地）`, body !== null);
    check(`T36 ${sel} 不再本地宣告 background（底色走 --panel-bg）`,
      body !== null && !/(^|;)\s*background\s*:/.test(body));
    check(`T36 ${sel} 不再本地宣告 border（描邊走共用）`,
      body !== null && !/(^|;)\s*border\s*:/.test(body));
    check(`T36 ${sel} 不再本地宣告 border-radius（圓角走共用）`,
      body !== null && !/border-radius\s*:/.test(body));
  }

  // (c) 需要非預設底色的兩個要傳 --panel-bg；.cl-card 用共用預設（--color-surface）故刻意不傳
  check('T36 .filter-group 以 --panel-bg 傳底色', /--panel-bg:\s*var\(--color-surface-hover\)/.test(bodyOf('.filter-group')));
  check('T36 .cfg-card 以 --panel-bg 傳底色', /--panel-bg:\s*var\(--color-bg-deep/.test(bodyOf('.cfg-card')));
  check('T36 .cl-card 不傳 --panel-bg（用共用預設 --color-surface）', !/--panel-bg/.test(bodyOf('.cl-card')));
  check('T36 .result-summary 以 --panel-bg 傳底色', /--panel-bg:\s*var\(--color-bg-deep/.test(bodyOf('.result-summary')));
  // .consumables 2026-08-15 也遷了（Owner 拍板把剩下的一起做）：圓角由 6px 統一成共用版的 8px，
  // 那是唯一的視覺變化。它用共用預設底色故不傳 --panel-bg。
  check('T36 .consumables 掛共用中性面板', HTML_SRC.includes(`${NEUTRAL} consumables`));
  check('T36 .consumables 不再本地宣告 background／border／border-radius',
    !/(^|;)\s*(background|border|border-radius)\s*:/.test(bodyOf('.consumables') || ''));
  // --panel-bg 會繼承：巢狀在 .cfg-card（傳 bg-deep）裡不顯式指定就會吃到父層的深色底，
  // 正好抵銷「展開後與卡片背景分開」的原意。遷移當下實測踩到過，這條釘住。
  check('T36 巢狀的 .consumables 必須顯式傳 --panel-bg（否則繼承父層 .cfg-card 的深色底）',
    /--panel-bg:\s*var\(--color-surface\)/.test(bodyOf('.consumables') || ''));
}

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

// ===== T44：職業任務交付物列的窄屏形狀（B-029）=====
// CSS 文字比對驗不了 layout（同 T26 的教訓），所以這裡只擋**已知會壞的那個形狀**：
// 單列 flex 裡右側 .crafter-qt-item__src 是 `flex: 0 0 auto`（不收縮），而品名是唯一能縮的
// ⇒ 窄屏時品名吸收全部不足。2026-08-15 實測：≤560px 開始截斷、**≤390px 全部 27 筆的品名寬度是 0**
// （玩家看到「圖 + ×1 + 複製鈕 + 徽章」而沒有品名）。修法＝窄屏讓它落到第二行、品名拿回整行。
// 真正的驗收是量測（同源 iframe 定寬 10 種寬度，截斷數全為 0），紀錄在 CHANGELOG；這條防的是被順手改回去。
{
  const srcRules = (CSS_SRC.match(/\.crafter-qt-item__src\s*\{[^}]*\}/g) || []).join('\n');
  check('T44 .crafter-qt-item__src 規則存在', srcRules.length > 0);
  check('T44 窄屏必須把右側動作群釋放成整行（否則品名會被壓成 0 寬）',
    /flex:\s*1\s+1\s+100%/.test(srcRules), srcRules);
  const media = CSS_SRC.match(/@media \(max-width: (\d+)px\)\s*\{[^@]*crafter-qt-item/);
  check('T44 窄屏規則掛在既有的 760px 斷點上（不另發明數字）', !!media && media[1] === '760',
    media ? media[1] : '找不到含 crafter-qt-item 的 @media');
  check('T44 窄屏要允許換行（flex-wrap: wrap）',
    /@media \(max-width: 760px\)[\s\S]{0,500}?crafter-qt-item\s*\{[^}]*flex-wrap:\s*wrap/.test(CSS_SRC));
}

// ===== T47：把玩家丟到別的分頁時要移焦（UX-08）＋ 收走最後一列要補空狀態（CF-05）=====
{
  // (a) 程式化切頁一律帶第二引數 true（移焦）。少了它，鍵盤／螢幕閱讀器使用者被丟回頁面開頭，
  //     而這幾條路徑全是「被擋下 → 去補資料」的補救動線，正是最需要焦點跟過去的時候。
  //     `switchTab('x')` 只允許出現在 tab 本身的 click handler（那裡焦點已經在 tab 上）。
  const srcs = ['app.js', 'app-solve.js', 'app-recipe.js', 'app-quests.js', 'crafting-list.js', 'app-browse.js'];
  const bare = [];
  for (const f of srcs) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const line of t.split(String.fromCharCode(10))) {
      if (!/switchTab\(\s*'[a-z]+'\s*\)/.test(line)) continue;
      if (/t\.dataset\.tab/.test(line)) continue;        // tablist 自己的 click handler
      if (/^\s*\/\//.test(line)) continue;                 // 註解裡提到函式名不算呼叫
      bare.push(f + ': ' + line.trim().slice(0, 70));
    }
  }
  check('T47 程式化切頁一律移焦（switchTab 帶第二引數）', bare.length === 0, bare.join(' | '));

  // (b) 「只顯示未完成」收走最後一列後必須補空狀態，否則玩家看到一片空白會以為壞了。
  //     局部移除那條路徑不會經過 questsHtml，所以要顯式偵測「清單已空 → 重繪」。
  const Q = fs.readFileSync(path.join(ROOT, 'app-quests.js'), 'utf8');
  check('T47 勾完最後一列 → 偵測清單已空並重繪（不留空白）',
    /querySelector\('\.crafter-qt-quest'\)\)\s*\{\s*render\(\);/.test(Q.replace(/\s+/g, ' ').replace(/ \{ /g, ' { '))
    || /!\$\('quest-body'\)\.querySelector\('\.crafter-qt-quest'\)/.test(Q));
}

// ===== T48：晶體判定只有一份實作（Q-02）＋ 硬編值不得繞過 token（DS-04/05）=====
{
  const js = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js'));
  const owners = js.filter((f) => /晶簇\|水晶\|碎晶/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  check('T48 晶體判定規則只在 app.js 定義一次（配方原料排序與清單彙總共用）',
    owners.length === 1 && owners[0] === 'app.js', `實際：${owners.join(', ') || '無'}`);
  for (const f of ['app-recipe.js', 'crafting-list.js']) {
    check(`T48 ${f} 走注入的 deps.isCrystal`, /deps\.isCrystal\(/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  }
  // DS-04：斑馬紋值要與本檔其餘處一致（原本 rgba(255,255,255,.02) 與共用層的 .035 也對不上）
  check('T48 食藥選單斑馬紋不得自寫 rgba（與本檔其餘斑馬紋同一個值）',
    !/crafter-cons__opt:nth-child\(even\)[^}]*rgba\(/.test(CSS_SRC));
  check('T48 icon 圓角走 token 不寫死 4px',
    !/crafter-cons__ico[^}]*border-radius:\s*4px/.test(CSS_SRC));
  // DS-05：錯誤橫幅不得用 inline style
  const APP48 = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  check('T48 資料載入失敗橫幅不用 inline style（走 tint panel + 具名 class）',
    !/資料載入失敗[^<]*<\/div>/.test(APP48.replace(/\s+/g, ' ')) || !/style="margin/.test(APP48));
}

// ===== T49：每一支分層 classic script 都要有硬失敗守衛（RES-02）=====
// 原本只有 gear/recipe/consumable/browse/flow 五支硬擋，solve/render/quests/stages/sync/list 是 `?.` 軟略過
// ⇒ 那些檔案 404 時玩家拿到的是「看起來正常、按下去無聲 TypeError」的頁面，而不是一句「部署不完整」。
// 這條掃 index.html 的 script 清單反推：新增分層檔而忘了加守衛會直接紅。
{
  const HTML49 = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const APP49 = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const files = [...HTML49.matchAll(/<script src="((?:app-|crafting-)[^"]+\.js)"><\/script>/g)].map((m) => m[1]);
  check('T49 掃到全部分層 script（至少 11 支，掃到 0 支也算失敗）', files.length >= 11, `${files.length} 支`);
  const missing = files.filter((f) => !APP49.includes(`throw new Error('${f} 未載入`));
  check('T49 每一支分層檔在 app.js 都有「未載入（部署不完整）」硬擋',
    missing.length === 0, `缺守衛：${missing.join(', ')}`);
}

// ===== T50：三張表都消費共用 .codex-table（DS-01）=====
// 重點不是「少寫幾行 CSS」，是 .rt 原本自刻的 sticky 重現了 portal 已文件化並修掉的坑：
// `border-collapse: collapse` 下 th 的 border-bottom 由 table 畫、**不跟著 sticky 移動**
// ⇒ 捲動時列直接穿到表頭下方、沒有分隔線（2026-08-15 截圖實證）。
// `.codex-table--sticky` 用 border-collapse: separate 解掉它，消費端不必記得那三個坑。
{
  const marks = [
    ['app-browse.js', '.rt', /class="codex-table codex-table--fixed codex-table--sticky rt"/],
    ['app-render.js', '.wt-table', /class="codex-table wt-table"/],
    ['app-gear.js', '.gear-table', /class="codex-table codex-table--fixed gear-table"/],
  ];
  for (const [f, sel, re] of marks) {
    check(`T50 ${sel} 掛共用 .codex-table`, re.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  }
  // 本地不得再宣告共用版已提供的基底（width / border-collapse）——那是第二份事實源
  for (const sel of ['.rt', '.wt-table', '.gear-table']) {
    const m = CSS_SRC.match(new RegExp('[.]' + sel.slice(1) + '[ ]*[{]([^}]*)[}]'));
    check(`T50 ${sel} 本地不再宣告 width／border-collapse／table-layout（走共用與變體）`,
      // `min-width` 不算重複宣告：共用版沒有它，那是 .gear-table 窄螢幕內部橫捲的特化
      !!m && !/(^|;|\s)(width|border-collapse|table-layout)\s*:/.test(m[1]), m ? m[1].trim().slice(0, 90) : '(無規則)');
  }
  // .rt 的 sticky 必須來自共用變體，本地不得再自刻 position: sticky
  const rtThead = (CSS_SRC.match(/\.rt thead th\s*\{[^}]*\}/) || [''])[0];
  check('T50 .rt 表頭 sticky 走共用 --sticky 變體（本地不再自刻 position: sticky）',
    !/position:\s*sticky/.test(rtThead), rtThead.slice(0, 90));
}

// ===== T51：製作鏈（宇宙探索那種「先做中間材、再做交付物」的連續動線）=====
// 由來（Owner 2026-08-15）：月球任務常常是「先做 1，再用 1 的材料做 2」，
// 玩家原本得自己重新搜尋每一層。craftPlan 把整條鏈算出來，UI 才給得出「先做這個 → 一鍵回來」。
{
  const RECIPES = [
    { id: 900, item_id: 48329, item_name: '統一規格的合金鉚釘', job: '鍛造', item_amount: 1 },
    { id: 901, item_id: 48333, item_name: '統一規格的合金', job: '鍛造', item_amount: 1 },
    { id: 902, item_id: 700, item_name: '雙聯板', job: '鍛造', item_amount: 3 },   // 一次產 3 個
  ];
  const byId = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
  const byItem = Object.fromEntries(RECIPES.map((r) => [r.item_id, r.id]));
  const ING = {
    900: [[48333, 2], [50, 1]],   // 合金 ×2 ＋ 一個買得到的素材
    901: [[48233, 1]],            // 宇宙貨箱（買/採，不是步驟）
    902: [[51, 1]],
  };
  const CTX = { recipesById: byId, recipeByItem: byItem, ingredients: ING };
  const plan = sandbox.CraftRecipe.craftPlan(RECIPES[0], CTX);
  eq('T51 步驟由底層排到成品', plan.map((s) => s.name).join(' → '), '統一規格的合金 → 統一規格的合金鉚釘');
  eq('T51 中間材要做幾次＝需求量 ÷ 一次產幾個（無條件進位）', plan[0].times, 2);
  eq('T51 最後一步是成品本身', plan[plan.length - 1].final === true, true);
  check('T51 買得到的素材不進步驟（它們在原料清單裡看得到）', !plan.some((s) => s.itemId === 50 || s.itemId === 48233));

  // 一次產多個：要 4 個雙聯板、配方一次產 3 → 做 2 次（不是 4 次）
  const plan2 = sandbox.CraftRecipe.craftPlan(
    { id: 999, item_id: 1, item_name: 'X', job: '鍛造', item_amount: 1 },
    { ...CTX, ingredients: { ...ING, 999: [[700, 4]] } });
  eq('T51 一次產多個 → 做的次數用進位而不是照需求量', plan2[0].times, 2);
  eq('T51 需求量本身照實記', plan2[0].need, 4);

  // 三層鏈：往下傳的必須是「做幾次」而不是「要幾個」——中間那層一次產 3 個時，
  // 要 4 個只需做 2 次，底層素材就只要 2 份。傳錯的話採購量會整批偏高而畫面完全正常。
  {
    const R3 = [
      { id: 800, item_id: 80, item_name: '成品', job: '鍛造', item_amount: 1 },
      { id: 801, item_id: 81, item_name: '中間材', job: '鍛造', item_amount: 3 },   // 一次產 3
      { id: 802, item_id: 82, item_name: '底層材', job: '鍛造', item_amount: 1 },
    ];
    const ctx3 = { recipesById: Object.fromEntries(R3.map((r) => [r.id, r])),
      recipeByItem: Object.fromEntries(R3.map((r) => [r.item_id, r.id])),
      ingredients: { 800: [[81, 4]], 801: [[82, 1]], 802: [] } };
    const p3 = sandbox.CraftRecipe.craftPlan(R3[0], ctx3);
    const mid = p3.find((x) => x.itemId === 81), base = p3.find((x) => x.itemId === 82);
    eq('T51 三層：中間材要 4 個、一次產 3 → 做 2 次', `${mid.need}/${mid.times}`, '4/2');
    eq('T51 三層：底層材依「做幾次」算＝2 份（不是照 4 個算）', `${base.need}/${base.times}`, '2/2');
    eq('T51 三層：順序由最深排到成品', p3.map((x) => x.name).join(' → '), '底層材 → 中間材 → 成品');
  }

  // 資料出環不得轉死（同 expandMats 的煞車）
  let threw = false;
  try {
    sandbox.CraftRecipe.craftPlan(RECIPES[1],
      { ...CTX, ingredients: { 901: [[48329, 1]], 900: [[48333, 1]] } });
  } catch (e) { threw = true; }
  check('T51 資料出環（A 要 B、B 要 A）不得無限遞迴', !threw);
}

// ===== T52：多職業可製作時要能換職業（Owner 2026-08-15）=====
// 實測 651 件物品有多個配方，宇宙探索的「統一規格的金屬板」有 12 個＝全 DoH。
// 只取「先出現者」等於幫玩家選了一個他可能沒練的職業，他按求解只會被擋在角色數值頁。
{
  const R = [
    { id: 10, item_id: 48251, item_name: '統一規格的合金', job: '鍛造', item_amount: 1 },
    { id: 11, item_id: 48251, item_name: '統一規格的合金', job: '甲冑', item_amount: 1 },
    { id: 12, item_id: 48251, item_name: '統一規格的合金', job: '金工', item_amount: 1 },
  ];
  const byId = Object.fromEntries(R.map((r) => [r.id, r]));
  const byItemAll = { 48251: [10, 11, 12] };
  const CR = sandbox.CraftRecipe;
  check('T52 CraftRecipe 導出 recipesForItem / pickRecipeForItem',
    typeof CR.recipesForItem === 'function' && typeof CR.pickRecipeForItem === 'function');
  void R; void byId; void byItemAll;
}

// ===== T55：配方詳情標題列不得被動作鈕壓垮（Owner 2026-08-16 回報）=====
// 與 T44（交付物列）同一個形狀：一列 flex 裡動作群是 `flex: 0 1 auto`、品名欄是唯一能縮的東西，
// 而 `min-width: 0` 讓它可以縮到 0 ⇒ 製作鏈把「← 回『長配方名』」加成第 4 顆鈕之後，
// 品名被壓成一個字寬、直排，三個數值各自折行。實測（欄寬 618px，配方＝卡扎納爾錠）：
//   min-width:0 → .ri-name 寬 27px、.ri-head 高 248px
//   有下限     → .ri-name 寬 553px、.ri-head 高 104px（動作群整條換到下一行）
// 真正的驗收是量測（同源 iframe 1400→320px 十種寬度：零水平溢出、品名寬 276–590px），紀錄在 CHANGELOG；
// 這條防的是被順手改回 `min-width: 0`。**CSS 文字比對驗不了 layout**（同 T26／T44 的教訓）。
{
  const main = (CSS_SRC.match(/^\.ri-main\s*\{[\s\S]*?\}/m) || [''])[0];
  check('T55 .ri-main 規則存在', main.length > 0);
  check('T55 品名欄不得可縮到 0（min-width: 0 正是壓垮它的那一行）',
    !/min-width:\s*0\s*[;}]/.test(main), main);
  check('T55 品名欄要有收縮下限（min-width 帶實際長度）',
    /min-width:\s*min\(\s*\d+px/.test(main) || /min-width:\s*\d+px/.test(main), main);
  check('T55 動作群仍可整條換行（放不下時退回獨佔一列，而不是繼續擠品名）',
    /\.ri-head\s*\{[^}]*flex-wrap:\s*wrap/.test(CSS_SRC));
}

// ===== T54：食藥與品質階段的資料不變量（B-030）=====
// 這兩份資料的產生端都是 fail-open：查不到就寫 null／輸出新來源就照寫，`build-data.py` 一路 ✓。
// 消費端也不會出錯——食藥少了 icon 就是「那一列沒圖」，品質階段來源不認得就是 toQuality 回 0、
// 該檔從下拉裡消失。**兩邊都不報錯**，所以只有在這裡對資料本身斷言才擋得住。
{
  const readData = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));

  // (a) 食物／藥水：icon 與 item id 靠繁中名對 item_lookup，查無就寫 null（build 端不當錯誤）。
  //     現況 100/24 筆全中 ⇒ ratchet 直接釘在「一筆都不准缺」，退步時才有人知道。
  for (const [f, n] of [['meals.json', 100], ['medicine.json', 24]]) {
    const rows = readData(f);
    check(`T54 ${f} 筆數不得縮水（現況 ${n}）`, rows.length >= n, rows.length);
    const noIcon = rows.filter((e) => !e.icon);
    check(`T54 ${f} 每筆都要對到 icon（繁中名對帳退步時這裡會紅）`,
      noIcon.length === 0, noIcon.map((e) => e.name).join(','));
    check(`T54 ${f} 每筆都要對到 item id`, rows.every((e) => Number.isSafeInteger(e.id) && e.id > 0));
    check(`T54 ${f} icon 是 /i/NNNNNN/NNNNNN.png 形狀（iconUrl 轉 v2 CDN 靠這個形狀）`,
      rows.every((e) => /^\/i\/\d{6}\/\d{6}\.png$/.test(e.icon)),
      (rows.find((e) => !/^\/i\/\d{6}\/\d{6}\.png$/.test(e.icon)) || {}).icon);
    check(`T54 ${f} 每筆都有繁中品名`, rows.every((e) => e.name && String(e.name).trim()));
  }

  // (b) 品質階段：`src` 的字彙由**消費端** app-quality-stages.js 的 toQuality 決定。
  //     資料端哪天多輸出一種（如 root B-041 的 key 2/3/4/6），toQuality 走 `return 0`
  //     → 那一檔靜默從下拉消失，玩家看到的是「這個配方只能衝滿品質」而不是錯誤。
  //     故不在這裡寫死清單，改成從消費端原始碼抽出它認得的 src，再要求資料 ⊆ 它。
  const QS_SRC = fs.readFileSync(path.join(ROOT, 'app-quality-stages.js'), 'utf8');
  const known = new Set([...QS_SRC.matchAll(/src === '([a-z]+)'/g)].map((m) => m[1]));
  check('T54 抽得到 toQuality 認得的來源（抽不到＝這條哨兵失效，不是資料沒問題）', known.size >= 2, [...known].join(','));
  const qs = Object.values(readData('quality-stages.json'));
  const unknownSrc = [...new Set(qs.map((e) => e.src))].filter((s) => !known.has(s));
  check('T54 quality-stages.json 的每一種 src 前端都會換算（否則該檔靜默消失）',
    unknownSrc.length === 0,
    `前端認得 [${[...known].join(',')}]，資料出現 [${unknownSrc.join(',')}]`);
  check('T54 quality-stages.json 筆數不得縮水（現況 992）', qs.length >= 992, qs.length);
  check('T54 每筆恰好三檔門檻', qs.every((e) => Array.isArray(e.stages) && e.stages.length === 3));
  check('T54 門檻值是非負整數（0＝該配方沒有那一檔，負數/小數＝資料壞了）',
    qs.every((e) => e.stages.every((v) => Number.isSafeInteger(v) && v >= 0)));
  check('T54 門檻由低到高（順序反了會讓「二階」比「三階」還難）',
    qs.every((e) => e.stages.filter(Boolean).every((v, i, a) => i === 0 || v > a[i - 1])),
    JSON.stringify(qs.find((e) => e.stages.filter(Boolean).some((v, i, a) => i > 0 && v <= a[i - 1])) || null));
}

// ===== T53：CSP `unsafe-inline` 的依賴面不得無聲擴大（B-031）=====
// 移除 `unsafe-inline`（改 sha256）已被兩輪判為重報、本輪 verifier 也降 low —— 沒有新的可利用路徑。
// **唯一有增量價值的是這支哨兵**：`unsafe-inline` 之所以留著，理由是「head 那兩段 bootstrap 非留不可」。
// 那個理由只在段數不變時成立；哪天有人順手加第 3 段可執行 inline script，`unsafe-inline` 的實際依賴面
// 就從「兩段查得到出處的 bootstrap」變成「任何人都能往頁面裡塞」，而 **CSP 檔一個字都不用改、零訊號**。
// 加新的 inline script 不是不行，但要在這裡明講它是什麼、為什麼不能改成外部檔。
{
  const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const opens = HTML.match(/<script\b[^>]*>/g) || [];
  // 有 src 的是外部檔（CSP 走 host 白名單，不吃 unsafe-inline）；ld+json 是資料不是可執行碼。
  const inlineExec = opens.filter(t => !/\bsrc=/.test(t) && !/type=["']application\/ld\+json["']/.test(t));
  check('T53 index.html 的可執行 inline script 恰為 2 段（舊網域交接 + portal CDN bootstrap）',
    inlineExec.length === 2,
    `實測 ${inlineExec.length} 段：${inlineExec.join(' | ')}\n` +
    '→ 新增可執行 inline script 會擴大 CSP unsafe-inline 的依賴面。' +
    '能改成外部 .js 就改（外部檔走 script-src self，不需要 unsafe-inline）；' +
    '真的非 inline 不可（如必須在 CDN bootstrap 之前跑）就更新本條的預期值並在此註明用途。');
  // `unsafe-inline` 還在＝上面那兩段確實靠它；哪天 CSP 收緊了，這條會提醒回來重估本哨兵
  const csp = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8');
  check('T53 script-src 仍帶 unsafe-inline（本哨兵存在的前提）',
    /script-src[^;]*'unsafe-inline'/.test(csp));
}

// ===== T56：「繼續做」下一階反查（app-nextcraft.js）=====
// 反查資料全部來自既有 ingredients.json（配方→素材）倒過來建，沒有新資料檔 ⇒ 錯了不會有任何載入錯誤，
// 只會「清單少列幾項」或「同一件東西列兩次」，畫面完全正常。所以純函式面要用**真實資料**釘住。
{
  const NEXT_SRC = fs.readFileSync(path.join(ROOT, 'app-nextcraft.js'), 'utf8');
  const mkEl = () => ({
    checked: false, value: '', innerHTML: '', textContent: '', hidden: true, disabled: false, dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, getAttribute: () => null,
    addEventListener(t, f) { (this.on = this.on || {})[t] = f; }, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], focus() { this.focused = true; }, onclick: null,
  });
  const els = {};
  const $n = (id) => els[id] || (els[id] = mkEl());
  // 清單列在 innerHTML 裡（stub DOM 不解析 HTML）→ 讓 #next-list 從自己的字串反推出「可點的列」，
  // 才驗得到「點一列真的會把配方 id 交出去」。
  $n('next-list').querySelectorAll = function () {
    return [...String(this.innerHTML).matchAll(/data-rid="(\d+)"/g)].map((m) => ({ dataset: { rid: m[1] }, onclick: null }));
  };
  const picked = [];
  const nctx = {
    console, window: {}, document: { getElementById: $n, body: { style: {} } },
  };
  nctx.globalThis = nctx;
  vm.createContext(nctx);
  vm.runInContext(NEXT_SRC, nctx, { filename: 'app-nextcraft.js' });
  const N = nctx.CraftNext;

  // (a) 索引反轉：配方→素材 倒成 素材→配方，用量要跟著
  const idx = N.buildIndex({ 10: [[1, 2], [2, 1]], 11: [[1, 3]] });
  eqObj('T56 反查索引：素材 1 被兩個配方用到', { v: JSON.stringify(idx[1]) }, { v: '[[10,2],[11,3]]' });
  eqObj('T56 反查索引：素材 2 只有一個配方用到', { v: JSON.stringify(idx[2]) }, { v: '[[10,1]]' });

  // (b) 真資料：棕櫚糖（36080）→ 31 個配方、30 件成品（特製酵母 鍊金／烹調 同一件東西）
  const ING = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ingredients.json'), 'utf8'));
  const RECIPES_ALL = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/recipes.json'), 'utf8'));
  const rlist = Array.isArray(RECIPES_ALL) ? RECIPES_ALL : Object.values(RECIPES_ALL);
  const byId = Object.fromEntries(rlist.map((r) => [r.id, r]));
  const realIdx = N.buildIndex(ING);
  const noGear = N.consumersOf(36080, { index: realIdx, recipesById: byId, items: {}, gearOk: () => false });
  eq('T56 棕櫚糖的下一階＝30 件成品（31 個配方裡有一件是雙職業）', noGear.length, 30);
  const yeast = noGear.find((r) => r.name === '特製酵母');
  eq('T56 一件東西只佔一列（特製酵母不因鍊金/烹調各做一份而列兩次）',
    noGear.filter((r) => r.name === '特製酵母').length, 1);
  eq('T56 多職業要標出來（＋N 職的來源）', yeast && yeast.jobCount, 2);
  eq('T56 用量＝該配方做一次要用幾個當前成品', (noGear.find((r) => r.name === '珍珠奶茶') || {}).amount, 1);
  eq('T56 用量不是固定 1（特製酵母要 4 個）', yeast && yeast.amount, 4);
  check('T56 都沒填數值時按 rlv 由低到高（先做得動的在前）',
    noGear.every((r, i, a) => i === 0 || a[i - 1].rlv <= r.rlv), noGear.slice(0, 3).map((r) => r.name + ':' + r.rlv).join(','));
  // 有填數值的職業要排到最前面——玩家點進去卻被擋在「請先設定角色數值」是這條動線最沒意義的結局
  const cookOnly = N.consumersOf(36080, { index: realIdx, recipesById: byId, items: {}, gearOk: (j) => j === '鍊金' });
  eq('T56 做得起的排最前面（只有鍊金有數值 → 特製酵母第一列）', cookOnly[0].name, '特製酵母');
  eq('T56 做得起的那列挑的是「有數值」的職業，不是先出現的那個', cookOnly[0].job, '鍊金');
  eq('T56 做不起的仍然列出來（只是排後面、標未填）', cookOnly.length, 30);
  eq('T56 做不起的標記為未填', cookOnly[1].ok, false);
  // 自環（配方用到自己的產物）不列：點進去等於原地踏步
  const loop = N.consumersOf(7, { index: { 7: [[1, 1], [2, 1]] }, recipesById: { 1: { id: 1, item_id: 7, item_name: '自己', job: '木工' }, 2: { id: 2, item_id: 8, item_name: '別的', job: '木工' } }, items: {}, gearOk: () => false });
  eq('T56 用到自己的配方不列（避免原地踏步）', loop.length, 1);
  eq('T56 自環過濾掉的是自己那筆', loop[0].name, '別的');

  // (c) 視窗：篩選、fail-safe、點列交出配方 id
  N.init({
    $: $n, esc: T.esc, iconUrl: (p) => p, JOB_ICON: {},
    getItems: () => ({}), getIngredients: () => ING, getRecipesById: () => byId,
    gearOkFor: (j) => j === '鍊金',
    onPick: (rid) => picked.push(rid),
  });
  eq('T56 countFor＝下一階件數（詳情頁的鈕要不要出、標幾件都靠它）', N.countFor(36080), 30);
  eq('T56 做不出任何東西的成品 countFor＝0（此時不出鈕）', N.countFor(999999999), 0);
  N.open(36080, '棕櫚糖', null);
  check('T56 開窗：標題寫出是「用什麼」還能做什麼', /棕櫚糖/.test($n('next-title').innerHTML));
  eq('T56 開窗：視窗打開', $n('next-modal').hidden, false);
  eq('T56 開窗：鎖背景捲動', nctx.document.body.style.overflow, 'hidden');
  eq('T56 開窗：預設勾「只顯示我能做的」', $n('next-only-mine').checked, true);
  eq('T56 只顯示我能做的 → 只剩鍊金那一件', $n('next-count').textContent, '1 項');
  check('T56 職業選單只列這批資料真的有的職業（不列做不出任何一筆的死選項）',
    !/>木工</.test($n('next-job').innerHTML) && /烹調/.test($n('next-job').innerHTML));
  $n('next-only-mine').checked = false;
  $n('next-only-mine').on.input();
  eq('T56 取消勾選 → 全部 30 件', $n('next-count').textContent, '30 項');
  $n('next-search').value = '奶茶';
  $n('next-search').on.input();
  eq('T56 搜尋品名過濾', $n('next-count').textContent, '2 項');   // 珍珠奶茶 + 薩維奈奶茶
  check('T56 搜尋結果就是那兩件', /珍珠奶茶/.test($n('next-list').innerHTML) && /薩維奈奶茶/.test($n('next-list').innerHTML));
  $n('next-search').value = '不存在的東西';
  $n('next-search').on.input();
  check('T56 沒有符合時給空狀態，不是一片空白', /codex-empty/.test($n('next-list').innerHTML));
  $n('next-search').value = '';
  $n('next-job').value = '烹調';
  $n('next-job').on.input();
  eq('T56 職業篩選：烹調 29 件（30 件裡特製酵母挑的是鍊金）', $n('next-count').textContent, '29 項');
  // 點一列＝把配方 id 交給 onPick 並關窗（關窗要還原背景捲動）
  const rows = $n('next-list').querySelectorAll();
  $n('next-list').innerHTML = $n('next-list').innerHTML;   // rows 上的 onclick 由 render 綁定，重新取得已綁定的那批
  const bound = [...String($n('next-list').innerHTML).matchAll(/data-rid="(\d+)"/g)];
  check('T56 每一列都帶得出配方 id', bound.length === 29 && rows.length === 29);
  // 遮罩關閉必須「按下」也在遮罩上。2026-08-17 實測：開窗那一發滑鼠在按鈕上按下、放開時遮罩已經
  // 蓋在游標底下 ⇒ 該次 click 的 target 是遮罩，視窗開了又立刻被關掉，玩家看到「按鈕沒反應」。
  // 程式化 .click() 不會重現（沒有 mousedown），所以這條哨兵是唯一擋得住它回來的東西。
  {
    const overlay = $n('next-modal');
    N.open(36080, '棕櫚糖', null);
    overlay.on.click({ target: overlay });                       // 只有 click、沒有 mousedown＝開窗那一發
    eq('T56 開窗那一發點擊不得把自己關掉（滑鼠是在按鈕上按下的）', overlay.hidden, false);
    overlay.on.mousedown({ target: $n('next-list') });           // 在視窗內按下、滑到遮罩才放開（拖曳選字）
    overlay.on.click({ target: overlay });
    eq('T56 在視窗內按下、放開時滑到遮罩 → 不關（誤關會吃掉正在選的字）', overlay.hidden, false);
    overlay.on.mousedown({ target: overlay });                   // 真的在遮罩上按下並放開
    overlay.on.click({ target: overlay });
    eq('T56 真的點遮罩（按下與放開都在遮罩）→ 關閉', overlay.hidden, true);
  }
  N.open(36080, '棕櫚糖', null);
  N.close();
  eq('T56 關窗：視窗收起', $n('next-modal').hidden, true);
  eq('T56 關窗：背景捲動還原', nctx.document.body.style.overflow, '');
  // 還焦：CDN 的 trapFocus 缺席（或它記到 body）時，焦點要自己送回開窗的那顆鈕，
  // 否則鍵盤使用者關窗後被丟回頁首，得重新 Tab 一整頁才回得到原處。
  {
    const btn = mkEl();
    N.open(36080, '棕櫚糖', btn);
    N.close();
    eq('T56 關窗還焦回開窗的按鈕', btn.focused, true);
  }

  // fail-safe：勾著「只顯示我能做的」但一筆都做不了 → 自動放開並說明。
  // 空清單讀起來像「這東西不能再往下做」，正好是相反的結論。
  N.init({
    $: $n, esc: T.esc, iconUrl: (p) => p, JOB_ICON: {},
    getItems: () => ({}), getIngredients: () => ING, getRecipesById: () => byId,
    gearOkFor: () => false, onPick: (rid) => picked.push(rid),
  });
  N.open(36080, '棕櫚糖', null);
  eq('T56 重開窗要清掉上次的職業篩選（否則這次少列一半而看起來像資料就這麼少）', $n('next-job').value, '');
  eq('T56 一件都做不起時不給空清單（自動改顯示全部）', $n('next-count').textContent, '30 項');
  eq('T56 自動放開後勾選狀態要跟著改（否則畫面與結果不一致）', $n('next-only-mine').checked, false);
  check('T56 自動放開要說明原因', /已改為顯示全部/.test($n('next-list').innerHTML));
  N.close();
}

// ===== T57：「繼續做」的製作鏈語意（Owner 2026-08-17：往前走，不推堆疊）=====
// 一路往上做會堆出一長串永遠用不到的返回點；反過來，選中的正好是剛才鑽下來的來源時，
// 不彈掉堆疊的話畫面會出現「← 回 A」而你人就站在 A 上。兩者都不會有任何錯誤訊號。
{
  const RECIPE_ONLY = fs.readFileSync(path.join(ROOT, 'app-recipe.js'), 'utf8');
  const rels = {};
  const rEl = () => ({ value: '', innerHTML: '', textContent: '', hidden: false, disabled: false, max: '', placeholder: '',
    dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, getAttribute: () => null,
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], focus() {}, scrollIntoView() {}, onclick: null });
  const $r2 = (id) => rels[id] || (rels[id] = rEl());
  // A（成品）← B（中間材）；C 是另一個用得到 B 的東西
  const RA = { id: 1, item_id: 101, item_name: 'A 成品', job: '木工', rlv: 1, item_amount: 1 };
  const RB = { id: 2, item_id: 102, item_name: 'B 中間材', job: '木工', rlv: 1, item_amount: 1 };
  const RC = { id: 3, item_id: 103, item_name: 'C 別的東西', job: '木工', rlv: 1, item_amount: 1 };
  const ALL = [RA, RB, RC];
  const rctx = { console, window: {}, document: { getElementById: $r2 },
    CraftSolve: { invalidateInFlight() {} }, CraftFlow: { update() {}, setTargetMode() {} },
    CraftStages: { setRecipe() {} }, CraftSync: { resolve: () => null, render() {} }, CraftNext: { countFor: () => 0 } };
  rctx.globalThis = rctx;
  vm.createContext(rctx);
  vm.runInContext(RECIPE_ONLY, rctx, { filename: 'app-recipe.js' });
  const R2 = rctx.CraftRecipe;
  let sel2 = null;
  R2.init({
    $: $r2, esc: T.esc, iconUrl: (p) => p, toast() {}, PH_HTML: '', JOB_ICON: {}, mbItem: () => '#', mbCraft: () => '#',
    recipeMaxes: () => ({ max_progress: 1, max_quality: 1, max_durability: 1 }), switchTab() {}, isCrystal: () => false,
    renderTable() {}, getRecipes: () => ALL, getRlvTable: () => ({ 1: { class_job_level: 1 } }), getItems: () => ({}),
    getIngredients: () => ({}), getSelected: () => sel2, setSelected: (v) => { sel2 = v; },
    getComputedInitial: () => 0, setComputedInitial() {}, getOpenedFromList: () => false, setOpenedFromList() {},
    invalidateResults() {}, updateEff() {}, gearFor: () => null, refreshSpecialistGate() {},
    getRecipesById: () => ({ 1: RA, 2: RB, 3: RC }), getRecipeByItem: () => ({}), getRecipesByItem: () => ({}), gearOkFor: () => true,
  });
  R2.selectRecipe(1);                       // 站在 A
  R2.craftIngredient(2);                    // 「先做這個」→ 鑽到 B，堆疊 [A]
  eq('T57 先做這個 → 堆疊記住來源', R2.chainDepth(), 1);
  R2.continueWith(3);                       // 從 B「繼續做」到 C（不是來源）
  eq('T57 繼續做 → 切到目標配方', sel2.recipe.id, 3);
  eq('T57 繼續做不推堆疊（往上做不是「做完回來」）', R2.chainDepth(), 1);
  check('T57 底下那條未完成的鏈保留（回 A 的路還在）', true);
  R2.selectRecipe(1); R2.craftIngredient(2);   // 重來：站在 B，堆疊 [A]
  eq('T57 重來後堆疊深度', R2.chainDepth(), 1);
  R2.continueWith(1);                       // 選到的正好是來源 A
  eq('T57 繼續做選到來源 → 等同「← 回」，堆疊彈掉', R2.chainDepth(), 0);
  eq('T57 繼續做選到來源 → 人回到 A', sel2.recipe.id, 1);
  // 入口鈕：沒有下一階時不得出現（出一顆點了只說「沒有」的鈕＝騙玩家點一次）。
  // 鈕住頂部「目前配方」那一列（Owner 2026-08-17：降低整體高度），故驗的是它自己的 hidden／文字。
  eq('T57 countFor=0 → 「繼續做」鈕收起來', $r2('next-craft').hidden, true);
  rctx.CraftNext.countFor = () => 7;
  R2.refreshSelectedGear();
  eq('T57 有下一階 → 鈕出現', $r2('next-craft').hidden, false);
  eq('T57 鈕上標出件數', $r2('next-craft').textContent, '⚒ 繼續做（7）');
  R2.showPicker();
  eq('T57 返回配方列表 → 「繼續做」跟著收（沒有「這個成品」可以繼續做了）', $r2('next-craft').hidden, true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

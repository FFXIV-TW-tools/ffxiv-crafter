// tools/tests/11-gear.test.mjs — 角色數值與專家之證（T23／T24／T30）＋安全哨兵（T6）
// 由 tools/test-formulas.mjs 依檔名序 import 跑；斷言計數器與共用 fixture 都在 ./_harness.mjs。
import { fs, vm, path, ROOT, APP_SRC, GEAR_SRC, FORMULA_SRC, DATA_SRC, RECIPE_SRC, HANDWRITTEN_JS, LAYER_STUBS, T, check, eq, rlv640, recipe100, gear, gearSpec, setInputs } from './_harness.mjs';

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
    vm.runInContext(FORMULA_SRC, ctx, { filename: 'app-formula-t23.js' });
    vm.runInContext(DATA_SRC, ctx, { filename: 'app-data-t23.js' });
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
    vm.runInContext(FORMULA_SRC, ctx, { filename: 'app-formula-t24.js' });
    vm.runInContext(DATA_SRC, ctx, { filename: 'app-data-t24.js' });
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


// ===== T6：壞掉的保存值要走可觀測錯誤路徑 =====
{
  // T6 行為回歸：壞掉／錯型別的 localStorage 不得靜默當成正常空設定。
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
    vm.runInContext(FORMULA_SRC, ctx, { filename: 'app-formula-gear-load.js' });
    vm.runInContext(DATA_SRC, ctx, { filename: 'app-data-gear-load.js' });
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
    vm.runInContext(FORMULA_SRC, ctx, { filename: 'app-formula-t30.js' });
    vm.runInContext(DATA_SRC, ctx, { filename: 'app-data-t30.js' });
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

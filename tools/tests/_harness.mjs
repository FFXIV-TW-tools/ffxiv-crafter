// tools/tests/_harness.mjs — 主題測試檔的共用底座：原始碼字串／DOM stub／vm sandbox／迷你斷言框架／共用 fixture。
// 2026-07-11 R2 批次 0（quality A1 / BACKLOG B-004）建立：把 app.js 的公式純函式在 node 載入斷言，
// golden 值＝spec §4 對抗驗證過的真實遊戲數（rlv640/工藝4048/90級 → base_progress 250）。
// 手法參考 island-workshop test/solver.test.js：vm 載 app.js（給假 DOM，fetch 立即 reject → 頂層 IIFE 走 catch 分支無害），
// 再導出純函式斷言。守：computeSettings（含專家之證 CP+15）/ hqPercent 斷點 / recipeMaxes + 2 條安全哨兵。
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 各主題檔直接用 fs／vm／path 起自己的 vm context，故一併由本檔轉出（單一 import 來源）。
export { fs, vm, path };

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(HERE, '..', '..');   // tools/tests/ → repo 根
export const APP_SRC = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
export const GEAR_SRC = fs.readFileSync(path.join(ROOT, 'app-gear.js'), 'utf8');
// 公式面（recipeMaxes／statShortfall／effectiveStats／computeSettings）與資料載入面住這兩支；
// app.js 只剩同名 proxy ⇒ **每個載 APP_SRC 的 sandbox 都要先載這兩份真原始碼**（不是 stub：純函式要真的算）。
export const FORMULA_SRC = fs.readFileSync(path.join(ROOT, 'app-formula.js'), 'utf8');
export const DATA_SRC = fs.readFileSync(path.join(ROOT, 'app-data.js'), 'utf8');
export const RECIPE_SRC = fs.readFileSync(path.join(ROOT, 'app-recipe.js'), 'utf8');
export const RENDER_SRC = fs.readFileSync(path.join(ROOT, 'app-render.js'), 'utf8'); // 結果渲染層（hqPercent 純函式住此）
// 工具樣式已拆成 `styles/NN-*.css` 序載（B-034，2026-09-06）：**掃描目錄依檔名序串接、不手維護清單**——
// 手打清單漏一支的症狀是「該檔的規則被刪掉仍全綠」（同上面 HANDWRITTEN_JS 的既有教訓）。
// 串接順序 == index.html 的 <link> 順序 == 層疊順序，故所有吃 CSS_SRC 的斷言語意不變。
const CSS_DIR = path.join(ROOT, 'styles');
export const readAllCss = () => fs.readdirSync(CSS_DIR).filter((f) => f.endsWith('.css')).sort()
  .map((f) => fs.readFileSync(path.join(CSS_DIR, f), 'utf8')).join('\n');
export const CSS_SRC = readAllCss();                                                // T17 首載空間預留（CLS）規則哨兵
// 站台手寫 JS＝repo 根的 .js，**掃描產生、不手維護清單**。
// 由來（健檢 2026-08-15 docs-drift／tests 同一根因）：這份清單原本是手打的 10 支，
// 漏掉 app-quests.js（第二大模組）／app-gear.js／app-recipe.js —— 靜默 catch 哨兵宣稱掃「全部手寫 JS」
// 卻只掃 10/13，而且**漏掃的症狀就是全綠**。新增模組時沒有人會記得回來加一行，所以改成掃描。
// （pkg/ 是 wasm-pack 產物、tools/ 與 tests/ 是工具鏈、functions/ 是 CF Pages Functions，都不在此範圍。）
export const HANDWRITTEN_JS = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js')).sort();

// ---------- 分層 stub（app.js init 對每一支分層檔都硬失敗，RES-02）----------
// 真實頁面一定同時載入全部分層；harness 只載其中幾支，所以缺的用 no-op stub 補。
// 收成一份共用常數：新增分層檔時只要改這裡，不必逐個 harness 補（先前 T23/T24 就是各自漏了 CraftSolve）。
// ⚠ 各 harness 要覆寫的（例如 T25 的 invalidateInFlight 計數器）用展開覆蓋，不要改這份。
export const LAYER_STUBS = () => ({
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
export const dom = {};
export function makeEl() {
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
export const getEl = (id) => dom[id] || (dom[id] = makeEl());

export const sandbox = {
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
vm.runInContext(FORMULA_SRC, sandbox, { filename: 'app-formula.js' });
vm.runInContext(DATA_SRC, sandbox, { filename: 'app-data.js' });
vm.runInContext(
  APP_SRC + '\n;globalThis.__t = { computeSettings, recipeMaxes, effectiveStats, statShortfall, esc, mbItem, mbCraft, selectRecipe, copyText, DOH, JOB_ICON, hqPercent: globalThis.CraftRender.hqPercent };',
  sandbox, { filename: 'crafter-app.js' });
export const T = sandbox.__t;

// ---------- 迷你斷言框架 ----------
let pass = 0, fail = 0;
export function check(name, ok, extra) {
  console.log((ok ? '✓ ' : '✗ ') + name + (ok || !extra ? '' : '  ' + extra));
  ok ? pass++ : fail++;
}
export const norm = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1))));
export function eqObj(name, got, want) { check(name, norm(got) === norm(want), `\n    got =${norm(got)}\n    want=${norm(want)}`); }
export function eq(name, got, want) { check(name, got === want, `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
// 計數器住本模組（ESM 單例）：各主題檔 import 的是同一份 check，入口只讀總數。
export const getCounts = () => ({ pass, fail });

// ---------- 共用 fixture（spec §4 對抗驗證過的真實 rlv640）----------
export const rlv640 = {
  id: 640, class_job_level: 90, difficulty: 4400, quality: 9000, durability: 70,
  progress_divider: 130, quality_divider: 115, progress_modifier: 80, quality_modifier: 70,
};
export const recipe100 = { difficulty_factor: 100, quality_factor: 100, durability_factor: 100, is_expert: false };
export const gear = { level: 90, cms: 4048, ctrl: 3980, cp: 600 };
export const gearSpec = { ...gear, specialist: true };   // 同一角色但該職業持有專家之證

// 設 computeSettings 讀的所有 DOM 輸入（求解選項 / 消耗品），求純函式決定性。
// 專家之證**不在此列**：2026-08-09 起它是「角色數值」分頁裡該職業的狀態，由 gear.specialist 帶入
// （gearFor 附上），故測法＝換 gear fixture，不是撥 DOM 開關。
export function setInputs({ mode = 'quality', target = '', manip = true, heart = false, qi = false, backload = false, adv = false } = {}) {
  getEl('food').value = ''; getEl('potion').value = '';       // 無食藥（FOOD/POTION 因 loadData 失敗為空 → getConsumable 回 null）
  getEl('opt-manip').checked = manip; getEl('opt-heart').checked = heart; getEl('opt-qi').checked = qi;
  getEl('opt-backload').checked = backload; getEl('opt-adversarial').checked = adv;
  getEl('solve-mode').value = mode; getEl('opt-target').value = target;
}

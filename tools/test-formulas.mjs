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
vm.runInContext(
  APP_SRC + '\n;globalThis.__t = { computeSettings, hqPercent, recipeMaxes, effectiveStats, esc };',
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

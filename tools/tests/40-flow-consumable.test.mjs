// tools/tests/40-flow-consumable.test.mjs — 流程引導 app-flow.js（T14）與食藥自繪 listbox app-consumable.js（T15）
// 由 tools/test-formulas.mjs 依檔名序 import 跑；斷言計數器與共用 fixture 都在 ./_harness.mjs。
import { fs, vm, path, ROOT, APP_SRC, CSS_SRC, T, check, eq } from './_harness.mjs';

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
  // 載入失敗（null）≠ 品項下架（[]）：前者維持上一份、不得清掉保存值（健檢 2026-09-05 resilience A1 ＝ M3）
  store['ffxiv-crafter-consumables-v1'] = JSON.stringify({ food: '高品級料理', potion: '強化藥' });
  const cs3 = { console, document: { getElementById: $, addEventListener() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
  cs3.globalThis = cs3;
  vm.createContext(cs3);
  vm.runInContext(CS_SRC, cs3, { filename: 'app-consumable.js' });
  const CS3 = cs3.CraftConsumable;
  CS3.init(DEP);
  CS3.setData(null, null);
  eq('T15 兩份都載入失敗（null）→ 保存的選擇原封不動', JSON.stringify([CS3.label('food'), CS3.label('potion')]), JSON.stringify(['高品級料理', '強化藥']));
  CS3.setData(MEALS, null);
  eq('T15 只有食物載到 → 食物建表、藥水維持保存值', JSON.stringify([!!CS3.get('food'), CS3.label('potion')]), JSON.stringify([true, '強化藥']));
}

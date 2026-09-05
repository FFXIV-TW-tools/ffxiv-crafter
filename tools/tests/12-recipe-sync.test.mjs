// tools/tests/12-recipe-sync.test.mjs — 配方詳情狀態機：數值更新不遺失成果／等級同步重算三上限（T25，內含 T37／T45／T52 接線）
// 由 tools/test-formulas.mjs 依檔名序 import 跑；斷言計數器與共用 fixture 都在 ./_harness.mjs。
import { fs, vm, path, ROOT, APP_SRC, GEAR_SRC, FORMULA_SRC, DATA_SRC, RECIPE_SRC, LAYER_STUBS, makeEl, check, eq, eqObj, gear } from './_harness.mjs';

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
    vm.runInContext(FORMULA_SRC, ctx, { filename: 'app-formula-t25.mjs' });
    vm.runInContext(DATA_SRC, ctx, { filename: 'app-data-t25.mjs' });
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

    // ===== T52 同職多張（B-036，Owner 2026-09-05 拍板 A）=====
    // 實測 136 組（成品,職業）有 2〜4 張配方（宇宙探索同一成品分任務階級，難度差近 6 倍），另有 23 組數值與原料
    // 完全相同的重複列。原本職業切換列只印職業名 ⇒ 同職多張時出現多顆同字的鈕，玩家分不出點的是哪張；
    // pickRecipeForItem 同職多筆取先出現者、規則未明寫。
    c.ctx.loadGear();   // 木工有數值
    vm.runInContext(`
      RECIPES = [
        { id:20, item_id:778, item_name:'同職多張', job:'木工', rlv:90, item_amount:1, difficulty_factor:100, quality_factor:100, durability_factor:100 },
        { id:21, item_id:778, item_name:'同職多張', job:'木工', rlv:90, item_amount:1, difficulty_factor:50,  quality_factor:100, durability_factor:100 },
        { id:22, item_id:778, item_name:'同職多張', job:'木工', rlv:90, item_amount:1, difficulty_factor:50,  quality_factor:100, durability_factor:100 },
        { id:23, item_id:778, item_name:'同職多張', job:'鍛造', rlv:90, item_amount:1, difficulty_factor:100, quality_factor:100, durability_factor:100 } ];
      RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
      RECIPES_BY_ITEM = { 778: [20, 21, 22, 23] };
      INGREDIENTS = { 20: [[42, 2]], 21: [[42, 1]], 22: [[42, 1]], 23: [[42, 2]] };`, c.ctx);
    eq('T52 同職多張 → 取難度最低那張（不是先出現的）', CRr.pickRecipeForItem(778).id, 21);
    c.ctx.selectRecipe(20);
    const infoHtml = () => c.ctx.document.getElementById('recipe-info').innerHTML;
    const btnTexts = () => [...infoHtml().matchAll(/<button[^>]*class="[^"]*ri-job-btn[^"]*"[^>]*>([\s\S]*?)<\/button>/g)]
      .map((m) => m[1].replace(/<img[^>]*>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    eq('T52 數值與原料完全相同的重複列只留一顆鈕（4 張 → 3 顆）', btnTexts().length, 3);
    check('T52 同職兩張難度不同 → 鈕面文字互異（帶難度）', btnTexts()[0] !== btnTexts()[1] && /難度 1000/.test(btnTexts()[0]) && /難度 500/.test(btnTexts()[1]), btnTexts().join(' | '));
    check('T52 單張的職業鈕面不帶多餘數字（鍛造只有一張；「未填」是既有的無數值標記）', btnTexts()[2] === '鍛造 未填', btnTexts()[2]);
    check('T52 同職多張的 data-help 列出原料（三個數字都相同時玩家只能靠這個對）', /原料：測試素材×2/.test(infoHtml()) && /原料：測試素材×1/.test(infoHtml()));
    // 三個數字都相同、只差原料 → 編號
    vm.runInContext(`RECIPES[0].difficulty_factor = 50; RECIPES_BY_ITEM = { 778: [20, 21, 23] };`, c.ctx);
    c.ctx.selectRecipe(20);
    check('T52 難度／品質／耐久都相同、只差原料 → 鈕面編號 #1 #2', /#1/.test(btnTexts()[0]) && /#2/.test(btnTexts()[1]), btnTexts().join(' | '));
    // 當前這張若是被去掉的那份重複（深連結指到它）→ 仍有一顆鈕是選中態
    vm.runInContext(`RECIPES[0].difficulty_factor = 100; RECIPES_BY_ITEM = { 778: [20, 21, 22, 23] };`, c.ctx);
    c.ctx.selectRecipe(22);
    check('T52 選中的是重複列時，去重後仍標得出目前這張（aria-current 落在 id 22）', /data-rid="22" aria-current="true"/.test(infoHtml()) && btnTexts().length === 3, infoHtml().match(/data-rid="\d+"[^>]*/g)?.join(' '));
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

  // ===== T62：改食物／藥水後，「最低能力要求」的紅字與求解鈕狀態要跟著刷新 =====
  // 由來（健檢 2026-09-05 correctness-core A1 ＝ M2）：statShortfall 的基準含食藥，但 onConsumableChange
  // 原本不呼叫 refreshGearNote ⇒ 吃了藥跨過門檻後畫面仍寫「還差 N」、求解鈕仍 aria-disabled。
  // 反方向也守：拿掉食物後掉回門檻下，紅字要回來。
  {
    const req = { ...baseRecipe, required_craftsmanship: 4100, required_control: 0 };   // gear cms 4048 ⇒ 差 52
    const t62 = mkT25Ctx({ recipe: req, rlvTable: { 90: baseRlv }, level: 90 });
    const $62 = (id) => t62.ctx.document.getElementById(id);
    t62.ctx.loadGear();
    t62.ctx.selectRecipe(1);
    eq('T62 未吃藥、差 52 → 求解鈕 aria-disabled', $62('solve-btn').getAttribute('aria-disabled'), 'true');
    check('T62 未吃藥 → 需求列標紅（is-short）', /is-short/.test($62('recipe-req').innerHTML));
    // 食物 +3%（上限 90）：4048 → 4138 ≥ 4100
    t62.ctx.CraftConsumable.get = (kind) => (kind === 'food' ? { cm: 3, cm_max: 90, ct: null, ct_max: null, cp: null, cp_max: null } : null);
    t62.ctx.onConsumableChange();
    eq('T62 選了食物跨過門檻 → 求解鈕轉可用（不必換配方才刷新）', $62('solve-btn').getAttribute('aria-disabled'), 'false');
    check('T62 選了食物跨過門檻 → 需求列紅字消失', !/is-short/.test($62('recipe-req').innerHTML));
    t62.ctx.CraftConsumable.get = () => null;
    t62.ctx.onConsumableChange();
    eq('T62 拿掉食物掉回門檻下 → 紅字與 aria-disabled 回來', $62('solve-btn').getAttribute('aria-disabled'), 'true');
  }

  // ===== T43 擴充：opt-adversarial 在 expert 配方被強制取消後，存檔與離開 expert 都要還他 =====
  // 由來（健檢 2026-09-05 correctness-core A2 ＝ M7）：T43 只修了 SPEC_GATED_IDS 兩個 id，第三個會被程式
  // 強制取消的 opt-adversarial 沒進偏好記錄 ⇒ 選 expert 後改任一其他選項存檔，localStorage 被寫成 false，
  // 且回到一般配方時勾也不會回來。修法把偏好記錄一般化（optWanted），不逐 id 列舉。
  {
    const opts = JSON.stringify({ 'opt-adversarial': true });
    const ex = mkT25Ctx({ recipe: { ...baseRecipe, is_expert: true }, rlvTable: { 90: baseRlv }, level: 90,
      extraStore: { 'ffxiv-crafter-solve-opts-v1': opts } });
    ex.ctx.loadGear();
    ex.ctx.selectRecipe(1);
    const adv = ex.ctx.document.getElementById('opt-adversarial');
    eq('T43 expert 配方 → 防球被強制取消且 disabled', JSON.stringify([adv.checked, adv.disabled]), JSON.stringify([false, true]));
    ex.ctx.saveSolveOpts();
    eq('T43 expert 下存檔 → localStorage 仍記得玩家原本勾了防球', JSON.parse(ex.store['ffxiv-crafter-solve-opts-v1'])['opt-adversarial'], true);
    vm.runInContext('RECIPES[0].is_expert = false;', ex.ctx);
    ex.ctx.selectRecipe(1);
    eq('T43 回到一般配方 → 防球勾回來（不用重整）', JSON.stringify([adv.checked, adv.disabled]), JSON.stringify([true, false]));
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

// tools/tests/51-nextcraft.test.mjs — 「繼續做」下一階反查 app-nextcraft.js：反查索引／視窗／製作鏈語意（T56／T57）
// 由 tools/test-formulas.mjs 依檔名序 import 跑；斷言計數器與共用 fixture 都在 ./_harness.mjs。
import { fs, vm, path, ROOT, T, check, eq, eqObj } from './_harness.mjs';

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
  const sameJob = N.consumersOf(7, { index: { 7: [[1, 1], [2, 1]] }, recipesById: {
    1: { id: 1, item_id: 8, item_name: '同一件', job: '木工' }, 2: { id: 2, item_id: 8, item_name: '同一件', job: '木工' } },
    items: {}, gearOk: () => false });
  eq('T56 同一件成品、同職兩張配方 → jobCount 是 1 不是 2（健檢 R5 correctness-data A3）', sameJob[0].jobCount, 1);

  // (c) 視窗：篩選、fail-safe、點列交出配方 id
  N.init({
    $: $n, esc: T.esc, iconUrl: (p) => p, JOB_ICON: {},
    getItems: () => ({}), getIngredients: () => ING, getRecipesById: () => byId,
    gearOkFor: (j) => j === '鍊金', statGate: () => ({ need: { cms: 0, ctrl: 0 }, cms: 0, ctrl: 0, ok: true }),
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
    gearOkFor: () => false, statGate: () => ({ need: { cms: 0, ctrl: 0 }, cms: 0, ctrl: 0, ok: true }), onPick: (rid) => picked.push(rid),
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
    getRecipesById: () => ({ 1: RA, 2: RB, 3: RC }), getRecipeByItem: () => ({}), getRecipesByItem: () => ({}), gearOkFor: () => true, statGate: () => ({ need: { cms: 0, ctrl: 0 }, cms: 0, ctrl: 0, ok: true }),
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

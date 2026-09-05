// tools/tests/20-list.test.mjs — 製造清單與素材彙總：aggregateMats／add-has-count／三分組／採購 CSV（T7〜T12、T58）
// 由 tools/test-formulas.mjs 依檔名序 import 跑；斷言計數器與共用 fixture 都在 ./_harness.mjs。
import { fs, vm, path, ROOT, T, check, eq } from './_harness.mjs';

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
//   ② 傳下去的是「做幾次」不是「要幾個」（同 app-recipe「先做這個」的 times 鐵則）：一次產 3 個時要 4 個只需做 2 次，
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

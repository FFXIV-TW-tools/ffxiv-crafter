// tools/tests/50-quests.test.mjs — 職業任務分頁 app-quests.js：素材展開／商人徽章／HQ 判定（T31〜T33）
// 由 tools/test-formulas.mjs 依檔名序 import 跑；斷言計數器與共用 fixture 都在 ./_harness.mjs。
import { fs, vm, path, ROOT, LAYER_STUBS, check, eq } from './_harness.mjs';

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
    rows.filter((e) => e.npcs && e.npcs.length).length >= 247);   // 門檻＝宣告值（健檢 R5 M19）
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

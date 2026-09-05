// app-data.js — 靜態資料載入與索引建立（本站沒有資料後端，11 支 JSON 全是 build 時產的）。
// classic script：發佈 globalThis.CraftData，app.js init 注入依賴（toast／recipeMaxes）。
// 職責只到「把資料與索引算出來回傳」；把它們接到各分層（setData／setVendors）的順序有時序契約，
// 留在 app.js 的 loadData（狀態綁定也住那邊）。
(function () {
  let deps = null;

  async function load() {
    // 逾時：網路 stall 時不讓「📦 載入配方資料中…」無限空轉（無逾時＝玩家看不出是慢還是壞掉，只能自己重整）
    // 舊瀏覽器沒有 AbortSignal.timeout：退回無逾時，別整站死在 fetch 之前（連 fetchOpt 的降級都吃不到；健檢 R5 M8）
    const fetchJson = async (url) => { const r = await fetch(url, { signal: globalThis.AbortSignal?.timeout ? AbortSignal.timeout(30000) : undefined }); if (!r.ok) throw new Error(`${url} HTTP ${r.status}`); return r.json(); }; // HTTP 錯誤明確降級（非把 404 頁當 JSON 硬 parse）
    // 選配資料（食物/藥水）非必要 → 失敗只降級該功能、不拖垮整站；回傳 [] 讓 buildConsumables 安全略過
    const fetchOpt = async (url) => { try { return await fetchJson(url); } catch (e) { console.warn('[crafter] 選配資料載入失敗，略過:', url, e); return []; } };
    // 食藥兩份失敗要回 null 不是 []：app-consumable.setData 把「不在清單裡的保存值」當品項下架清掉，
    // 給它 [] 等於一次網路抖動就把玩家的食藥偏好清空（健檢 R5 M3）。null ＝「這次沒拿到，維持上一份」。
    const fetchOptOrNull = async (url) => { try { return await fetchJson(url); } catch (e) { console.warn('[crafter] 選配資料載入失敗，維持上一份:', url, e); return null; } };
    // 七檔同一輪併發：meals/medicine 原本排第二輪 await，白等一個 RTT 只換 2.5KB（fetchOpt 自己吞錯，不會拖垮必要資料）
    // 品質階段同為選配：載不到只是少了「一階/二階/三階」快捷，目標品質仍可手打 → 不拖垮整站
    const fetchOptObj = async (url) => { try { return await fetchJson(url); } catch (e) { console.warn('[crafter] 選配資料載入失敗，略過:', url, e); return {}; } };
    // 等級同步**不是普通選配資料**：其他選配載不到只是少一個快捷（品質階段）或少一份加成（食藥），
    // 這一份載不到會讓宇宙探索配方沿用資料裡的 rlv 690 ＝ Lv100 版本的難度/品質/耐久
    // —— Lv70 玩家看到的是六倍難度，求解直接回「做不到」，而畫面上一切正常（零回饋訊號，B-016 的原病）。
    // 故降級要**看得見**：仍不拖垮整站（其餘 99% 配方不受影響），但必須告訴玩家數字可能不對。
    const fetchLevelSync = async () => {
      try { return await fetchJson('data/level-sync.json'); }
      catch (e) {
        console.warn('[crafter] 等級同步資料載入失敗:', e);
        deps.toast('等級同步資料載入失敗 — 宇宙探索配方可能顯示 Lv100 的難度與品質，重整可重試', 'warn');
        return {};
      }
    };
    const [recipes, rlv, actions, items, ingredients, meals, medicine, stages, levelSync, quests, vendors] = await Promise.all([
      fetchJson('data/recipes.json'),
      fetchJson('data/recipe_levels.json'),
      fetchJson('data/craft-actions.json'),
      fetchJson('data/items.json'),
      fetchJson('data/ingredients.json'),
      fetchOptOrNull('data/meals.json'),
      fetchOptOrNull('data/medicine.json'),
      fetchOptObj('data/quality-stages.json'),
      fetchLevelSync(),
      fetchOpt('data/job-quests.json'),
      fetchOptObj('data/vendors.json'),
    ]);
    // 職業任務層展開素材樹要用的兩份索引（建一次；避免每次重繪掃 11803 筆）
    const byId = {}, byItem = {}, recipesByItem = {};   // 後者＝item_id → 全部配方 id（多職業）
    for (const r of recipes) {
      byId[r.id] = r;
      if (r.item_id != null && byItem[r.item_id] == null) byItem[r.item_id] = r.id;  // 同物品多配方取先出現者（與配方表一致）
      // **同一件東西常常好幾個職業都能做**（實測 651 件；宇宙探索的「統一規格的金屬板」3 職 12 張——同職也會多張）。
      // 只留「先出現者」等於幫玩家選了一個他可能沒練的職業 → 另存完整清單供職業切換與「先做這個」挑選。
      if (r.item_id != null) (recipesByItem[r.item_id] = recipesByItem[r.item_id] || []).push(r.id);
    }
    const rindex = recipes.map(r => ({
      id: r.id, name: r.item_name || '', job: r.job || '', rlv: r.rlv,
      // 簡中名只進搜尋、不顯示（顯示一律繁中）：很多人記的是陸服名或直接從簡中攻略貼過來
      nameSc: (items[String(r.item_id)] && items[String(r.item_id)].name_sc) || '',
      level: (rlv[String(r.rlv)] && rlv[String(r.rlv)].class_job_level) || 0,
      icon: (items[String(r.item_id)] && items[String(r.item_id)].icon) || null,
      category: (items[String(r.item_id)] && items[String(r.item_id)].category) || '', // 道具種類（繁中）→ 配方表獨立一欄
      expert: !!r.is_expert,   // 高難度（expert）＝遊戲內隨機製作狀態的配方（536 筆）；配方表標徽章＋可篩選
      patch: (items[String(r.item_id)] && items[String(r.item_id)].patch) || '',   // 成品的實裝版本（item_lookup.items.patch，13874 筆全有值）→ 版本欄＋版本篩選
      // 難度／品質上限：**一律走 recipeMaxes**（顯示與求解共用同一算式的鐵則，CQ-01）——
      // 這裡多一份 `rlv.difficulty * factor / 100` 就是第二份公式，改版時只會有一邊被改到。
      // 缺 rlv 列（資料半套）→ 給 null，渲染端顯「—」而不是假的 0。
      ...(function () {
        const row = rlv[String(r.rlv)];
        if (!row) return { diff: null, qual: null };
        const m = deps.recipeMaxes(r, row);
        return { diff: m.max_progress, qual: m.max_quality };
      })(),
    }));
    return { recipes, rlv, actions, items, ingredients, meals, medicine, stages, levelSync, quests, vendors,
      byId, byItem, recipesByItem, rindex };
  }

  const REQUIRED = ['toast', 'recipeMaxes'];
  globalThis.CraftData = {
    // 注入契約變可測不變量：缺鍵即早炸（→ app.js init 顯錯誤橫幅），非等到 RINDEX 才靜默算錯上限。
    init(d) {
      const miss = REQUIRED.filter(k => d == null || d[k] == null);
      if (miss.length) throw new Error('CraftData.init 缺依賴: ' + miss.join(', '));
      deps = d;
    },
    load,
  };
})();

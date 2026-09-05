// app-formula.js — FFXIV 製作公式面（已對抗驗證，spec §4）。
// classic script：發佈 globalThis.CraftFormula，app.js init 注入依賴（求解選項的 DOM 與初始品質 getter）。
// 前四支是純函式（applyConsumables 讀 globalThis.CraftConsumable，未載該層＝無食藥，公式仍可決定性驗證）；
// computeSettings 需要求解選項那幾個 DOM 控件與 HQ 原料算出的初始品質 → 走既有模組 pattern 注入。
(function () {
  let deps = null;

  // 配方三上限（進展/品質/耐久）：顯示（refreshSelectedGear）與求解（computeSettings）共用同一算式，防兩處漂移（CQ-01）
  function recipeMaxes(recipe, rlv) {
    return {
      max_progress: Math.floor(rlv.difficulty * recipe.difficulty_factor / 100),
      max_quality: Math.floor(rlv.quality * recipe.quality_factor / 100),
      max_durability: Math.floor(rlv.durability * recipe.durability_factor / 100),
    };
  }
  // 配方的最低能力要求（`Recipe.RequiredCraftsmanship` / `RequiredControl`，13874 個裡 3396 個有）：
  // 遊戲內數值不到就**根本不給做**，站上原本完全沒讀這兩欄 ⇒ 使用者拿得到一份進遊戲用不了的巨集。
  // 比較基準＝`effectiveStats`（含食物／藥水／專家之證）——遊戲的判定同樣吃 buff，拿裸裝比會誤擋。
  // 單一出口：顯示（app-recipe 的需求標示與求解鈕狀態）與擋閘（app-solve.doSolve）共用這一份。
  function statShortfall(recipe, gear) {
    const need = { cms: +(recipe && recipe.required_craftsmanship) || 0, ctrl: +(recipe && recipe.required_control) || 0 };
    if (!gear || (!need.cms && !need.ctrl)) return { need, cms: 0, ctrl: 0, ok: true };
    const eff = effectiveStats(gear);
    const cms = Math.max(0, need.cms - eff.cms);
    const ctrl = Math.max(0, need.ctrl - eff.ctrl);
    return { need, cms, ctrl, ok: cms === 0 && ctrl === 0 };
  }

  // ---------- 食物 / 藥水（選擇 UI + 本地保存在 app-consumable.js：globalThis.CraftConsumable）----------
  // 這裡只留「選中品項 → 數值加成」的公式面；選單渲染/鍵盤/保存屬該層。
  // 選擇性呼叫（?.）：測試 sandbox 未載該層時＝無食藥，公式仍可決定性驗證。
  function applyConsumables(baseCms, baseCtrl, baseCp) {
    let cms = baseCms, ctrl = baseCtrl, cp = baseCp;
    const cs = globalThis.CraftConsumable;
    for (const e of [cs?.get?.('food') || null, cs?.get?.('potion') || null]) {
      if (!e) continue;
      if (e.cm) cms += Math.min(e.cm_max || Infinity, Math.floor(baseCms * e.cm / 100));
      if (e.ct) ctrl += Math.min(e.ct_max || Infinity, Math.floor(baseCtrl * e.ct / 100));
      if (e.cp) cp += Math.min(e.cp_max || Infinity, Math.floor(baseCp * e.cp / 100));
    }
    return { cms, ctrl, cp };
  }
  function effectiveStats(gear) {
    const spec = !!gear.specialist;               // 該職業是否持有專家之證（角色數值分頁設定，gearFor 帶進來）
    const sp = spec ? 20 : 0;                    // 專家之證：作業 +20・加工 +20
    return applyConsumables(gear.cms + sp, gear.ctrl + sp, gear.cp + (spec ? 15 : 0)); // 專家之證：CP +15（Soul of the Crafter 專家狀態加成）
  }

  // ---------- 公式（FFXIV，已驗證；spec §4）----------
  function computeSettings(recipe, rlv, gear) {
    const $ = deps.$;
    const level = gear.level || 100;
    const eff = effectiveStats(gear);            // 含食物/藥/專家之證
    let bp = eff.cms * 10 / rlv.progress_divider + 2;
    let bq = eff.ctrl * 10 / rlv.quality_divider + 35;
    if (level <= rlv.class_job_level) {          // 等級懲罰閘 ≤（已驗證）
      bp = bp * rlv.progress_modifier / 100;
      bq = bq * rlv.quality_modifier / 100;
    }
    bp = Math.trunc(bp); bq = Math.trunc(bq);    // as u16 截斷
    const { max_progress, max_quality, max_durability } = recipeMaxes(recipe, rlv);
    return {
      max_cp: eff.cp, max_durability, max_progress, max_quality,
      base_progress: bp, base_quality: bq, job_level: level,
      use_manipulation: $('opt-manip').checked,
      use_heart_and_soul: $('opt-heart').checked && !!gear.specialist,
      use_quick_innovation: $('opt-qi').checked && !!gear.specialist,
      use_trained_eye: !recipe.is_expert && level >= rlv.class_job_level + 10, // 自動（出等級即可）
      adversarial: $('opt-adversarial').checked && !recipe.is_expert, // 高難度配方引擎不支援，強制關

      backload_progress: $('opt-backload').checked,
      stellar_steady_hand_charges: 0,
      target_quality: $('solve-mode').value === 'nq' ? 0
        : (($('opt-target').value && +$('opt-target').value > 0) ? Math.min(+$('opt-target').value, max_quality) : max_quality),
      initial_quality: Math.min(Math.max(0, deps.getComputedInitial() || 0), max_quality),
    };
  }

  const REQUIRED = ['$', 'getComputedInitial'];
  globalThis.CraftFormula = {
    // 注入契約變可測不變量：缺鍵即早炸（→ app.js init 顯錯誤橫幅），非等到求解才靜默錯數字。
    init(d) {
      const miss = REQUIRED.filter(k => d == null || d[k] == null);
      if (miss.length) throw new Error('CraftFormula.init 缺依賴: ' + miss.join(', '));
      deps = d;
    },
    recipeMaxes,
    statShortfall,
    applyConsumables,
    effectiveStats,
    computeSettings,
  };
})();

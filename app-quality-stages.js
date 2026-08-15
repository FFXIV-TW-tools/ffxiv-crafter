// app-quality-stages.js — 品質階段層：把「這個配方有哪幾檔品質門檻」翻成目標品質數字。
// classic script（同 crafting-list.js / app-solve.js 手法）：發佈 globalThis.CraftStages，app.js init 注入依賴。
//
// 為什麼要這層：求解器只吃一個絕對的 target_quality，但玩家心裡想的是「二檔就夠了」。
// 收藏品交易、宇宙探索任務都只看有沒有跨過門檻，衝滿品質是白花 CP 與步數——
// 常常還會讓原本有解的配方變成 NoSolution。
//
// 資料＝data/quality-stages.json（權威=game_ref.sqlite 的 recipe_quality_stages，
// 由 Recipe.CollectableMetadata + CollectableMetadataKey 解出）。**兩種來源單位不同**：
//   collectable → 收藏價值，目標品質 = 值 × 10（對標 BestCraft RaphaelSolver.vue:105-107）
//   cosmic      → 滿品質的百分比，目標品質 = ceil(滿品質 × 值 / 100)
// 換算放在這裡而不是資料產生端：滿品質＝recipeMaxes(recipe, rlv) 在 app.js 已有唯一實作，
// 在 Python 端再算一次就是第二份會漂移的公式（同 CQ-01 的教訓）。
(function () {
  let deps = null;      // app.js 注入：{ $, invalidateResults }
  let STAGES = {};      // recipe id → { src, stages: [s1, s2, s3] }
  let current = null;   // { maxQ, src, targets: [q1, q2, q3] }（無分階時為 null）

  const SRC_LABEL = { collectable: '收藏品交易', cosmic: '宇宙探索任務' };
  const STAGE_LABEL = ['一階', '二階', '三階'];
  const FULL = '';      // 目標品質欄留空＝滿品質（沿用既有語意，別另發明一個哨兵值）
  const CUSTOM = 'custom';

  const $ = (id) => document.getElementById(id);

  /** 某一檔的門檻值 → 絕對目標品質。0＝該配方沒有這一檔。 */
  function toQuality(src, v, maxQ) {
    if (!v) return 0;
    // 收藏價值是整數刻度（品質 = 收藏價值 × 10），跨過門檻即算數
    if (src === 'collectable') return Math.min(v * 10, maxQ);
    // 百分比要**無條件進位**：floor 會落在門檻下方一點點，求解出來的手法剛好差一格達不到
    if (src === 'cosmic') return Math.min(Math.ceil(maxQ * v / 100), maxQ);
    return 0;   // 未知來源不猜換算（資料端只輸出已確證的兩種，這裡是防線不是分支）
  }

  /** 選配方時重建選項。無分階資料 → 整組收起來，不留一個只有「滿品質」的假下拉。 */
  function setRecipe(recipe, maxQ) {
    const entry = recipe && STAGES[String(recipe.id)];
    const wrap = $('target-stage-field');
    const sel = $('opt-target-stage');
    const hint = $('target-stage-hint');
    if (!wrap || !sel || !hint) return;      // 測試 sandbox 無此 DOM

    if (!entry) {
      current = null;
      wrap.hidden = true;
      hint.textContent = '';
      return;
    }
    const targets = entry.stages.map((v) => toQuality(entry.src, v, maxQ));
    current = { maxQ, src: entry.src, targets };

    sel.innerHTML = '';
    sel.append(new Option('滿品質（' + maxQ + '）', FULL));
    targets.forEach((q, i) => {
      if (!q) return;                         // 該檔不存在（值為 0）→ 不列，別給玩家一個點了沒反應的選項
      sel.append(new Option(STAGE_LABEL[i] + '（' + q + '）', String(q)));
    });
    sel.append(new Option('自訂', CUSTOM, false, false));
    sel.options[sel.options.length - 1].disabled = true;   // 只作為「數字不等於任何預設」的顯示狀態

    // 門檻原值要看得見：玩家對不上遊戲畫面時，才分得出是資料錯還是換算錯。
    // 索引用 stages 的原始位置（不是 filter 後的），否則缺一階時二階會被標成「一階」。
    const pct = entry.src === 'cosmic';
    const parts = entry.stages
      .map((v, i) => (v ? STAGE_LABEL[i] + ' ' + v + (pct ? '%' : '') : null))
      .filter(Boolean);
    hint.textContent = (SRC_LABEL[entry.src] || entry.src) + ' · ' + parts.join('／')
      + (pct ? '' : '（收藏價值）');
    wrap.hidden = false;
    syncFromInput();
  }

  /** 目標品質欄被改（玩家手打 / 深連結帶值）→ 下拉跟著顯示對應階段或「自訂」。 */
  function syncFromInput() {
    const sel = $('opt-target');
    const stage = $('opt-target-stage');
    if (!sel || !stage || !current) return;
    const v = sel.value.trim();
    const match = v === '' ? FULL
      : (current.targets.some((q) => q && String(q) === v) ? v : CUSTOM);
    // 自訂是 disabled option，直接指派 value 在部分瀏覽器不生效 → 用 index 指定
    const idx = [...stage.options].findIndex((o) => o.value === match);
    if (idx >= 0) stage.selectedIndex = idx;
  }

  /** 目前選的是哪一檔：0/1/2、'full'（滿品質）、或 null（自訂／無分階）。
   *  給「生效 rlv 改變」時保留選擇用。**保留絕對品質數字是錯的**——宇宙任務的門檻是滿品質的
   *  百分比，rlv 一變同一檔就是不同數字，保留舊值等於照一個不存在的門檻求解（且下拉會翻成「自訂」，
   *  畫面上看不出哪裡不對）。索引用 targets 的原始位置，與 STAGE_LABEL 對齊。 */
  function stageSelection() {
    const stage = $('opt-target-stage');
    if (!stage || !current) return null;
    const v = stage.value;
    if (v === CUSTOM) return null;
    if (v === FULL) return 'full';
    const i = current.targets.findIndex((q) => q && String(q) === v);
    return i >= 0 ? i : null;
  }

  /** 把 stageSelection() 的結果套回（setRecipe 依新 maxQ 重建之後）：依檔次重推新的絕對品質。
   *  回 false ＝套不回（自訂／該檔在新 rlv 下不存在），由呼叫端沿用既有的絕對值收斂法，不硬湊。
   *  刻意不呼叫 invalidateResults：呼叫端（refreshGearNote）那條路本來就已經在作廢舊結果了。 */
  function applyStageSelection(sel) {
    const stage = $('opt-target-stage'), target = $('opt-target');
    if (sel == null || !stage || !target || !current) return false;
    const want = sel === 'full' ? FULL : String(current.targets[sel] || '');
    if (sel !== 'full' && !want) return false;
    const idx = [...stage.options].findIndex((o) => o.value === want);
    if (idx < 0) return false;
    stage.selectedIndex = idx;
    stage.value = want;
    target.value = want;
    return true;
  }

  function onStageChange() {
    const stage = $('opt-target-stage');
    const target = $('opt-target');
    if (!stage || !target || stage.value === CUSTOM) return;
    target.value = stage.value;               // FULL 是空字串＝滿品質，語意與手動清空一致
    deps?.invalidateResults?.();
  }

  globalThis.CraftStages = {
    init(d) {
      deps = d;
      const stage = $('opt-target-stage');
      if (stage) stage.addEventListener('change', onStageChange);
    },
    setData(stages) { STAGES = stages || {}; },
    setRecipe, syncFromInput, stageSelection, applyStageSelection,
    // 測試面：純函式，不碰 DOM
    _toQuality: toQuality,
  };
})();

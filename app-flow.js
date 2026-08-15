// app-flow.js — 流程引導層：常駐步驟軸（①選配方 →②設定條件 →③求解取巨集）＋「下一步」指示。
// classic script（同 app-render/app-solve/app-browse 手法）：發佈 globalThis.CraftFlow，app.js init 注入依賴。
// 由來＝設計系統 §🧭 功能頁引導標準：「需要先做幾件事才會出東西」的功能頁，任何時刻都要看得出現在該做什麼。
// flowState 為純函式（唯一狀態真相），render 只負責寫 DOM → 流程規則可在 node 端 golden 測（test-formulas T14）。
(function () {
  let deps = null; // { esc, getSelected, isPicking, gearOkFor, hasResult, isSolving }
  // 本層自帶 $（不走注入）：setTargetMode / updateConsumableSummary 會在 CraftFlow.init 之前
  // 就被 selectRecipe（深連結路徑）呼叫，靠注入會靜默失效
  const $ = (id) => document.getElementById(id);

  const TITLES = ['選配方', '設定條件', '求解取巨集'];
  const STATE_TEXT = { done: '已完成', current: '進行中', todo: '待辦', blocked: '無法進行' };

  // 純函式：由當前情境算出三步狀態與「下一步」文案。
  // 三態最小集＝完成／進行中／待辦（blocked＝進行中但條件未滿足，需先補上游）。
  // 上游變更使下游失效：hasResult 由呼叫端取 live 值（invalidateResults 會把它變 false）→ ③ 自動退回待辦。
  function flowState(ctx) {
    const c = ctx || {};
    const job = c.job || '該職業';
    const s1 = {
      n: 1, title: TITLES[0], state: c.hasRecipe ? 'done' : 'current',
      note: c.hasRecipe ? (c.recipeName || '已選定') : '從下方列表挑一個要做的成品',
    };
    const s2 = { n: 2, title: TITLES[1], state: 'todo', note: '選好配方後在左欄設定' };
    const s3 = { n: 3, title: TITLES[2], state: 'todo', note: '產出遊戲巨集與逐步走查' };
    let next;
    if (!c.hasRecipe) {
      next = '① 從下方列表挑一個配方 — 可用職業、等級或名稱搜尋縮小範圍。';
    } else if (!c.gearOk) {
      s2.state = 'blocked';
      s2.note = `缺「${job}」的角色數值`;
      next = `② 先到「角色數值」分頁填「${job}」的作業精度／加工精度／CP — 沒有數值無法求解。`;
    } else if (c.solving) {
      s2.state = 'done'; s2.note = '已套用角色數值與加成';
      s3.state = 'current'; s3.note = '求解中…';
      next = '③ 求解中 — 高難度配方可能數十秒，也可按「取消」中止。';
    } else if (c.hasResult) {
      s2.state = 'done'; s2.note = '已套用角色數值與加成';
      s3.state = 'done'; s3.note = '巨集已產生';
      next = '完成 — 複製右側巨集貼進遊戲巨集欄。改動任一設定後需重新求解。';
    } else {
      s2.state = 'current'; s2.note = '確認 HQ 素材、食物藥水與求解選項';
      next = '② 確認左欄「素材與加成」與「求解設定」，再按「求解最佳手法」。';
    }
    return { steps: [s1, s2, s3], next };
  }

  // 由狀態產出兩塊 HTML（步驟軸 / 下一步）。**index.html 內的靜態初始標記由本函式產生**
  // （冷啟動態＝flowHtml({})）→ 首屏就有內容、JS 接手時是同字串覆寫＝零版面位移（CLS）。
  // 兩者一致由 test-formulas T17 機械守（改文案後測試會紅，照測試訊息把新字串貼回 index.html）。
  function flowHtml(ctx, esc) {
    const st = flowState(ctx);
    return {
      st,
      steps: st.steps.map(s => stepHtml(s, esc)).join(''),
      next: `<span class="crafter-flow__next-label">下一步</span><span>${esc(st.next)}</span>`,
    };
  }

  function stepHtml(s, esc) {
    const cur = s.state === 'current' || s.state === 'blocked';
    return `<li class="crafter-flow__step" data-state="${s.state}"${cur ? ' aria-current="step"' : ''}>` +
      `<span class="crafter-flow__n" aria-hidden="true">${s.state === 'done' ? '✓' : s.n}</span>` +
      `<span class="crafter-flow__body">` +
        `<span class="crafter-flow__t">${esc(s.title)}<span class="crafter-sr">（${STATE_TEXT[s.state]}）</span></span>` +
        `<span class="crafter-flow__note codex-small">${esc(s.note)}</span>` +
      `</span></li>`;
  }

  // 依 live 狀態重繪步驟軸。呼叫點＝任何會改變流程位置的事件（選配方／返回列表／改角色數值／
  // 設定失效／求解開始結束／結果渲染完成）——各層一律走 globalThis.CraftFlow?.update?.() 選擇性呼叫，
  // 使測試 sandbox 缺本層時不炸。
  // 目標品質欄的可用性與原因（求解模式切換與換配方共用，防兩處漂移）
  function setTargetMode() {
    const nq = $('solve-mode').value === 'nq';
    $('opt-target').disabled = nq;
    // 階段下拉也要一起停：它的作用就是往目標品質欄寫一個數字，欄位停用時等於「按了沒反應」——
    // 那比停用更難懂（玩家會以為選了三階卻求解不理他）。T14 守。
    const stage = $('opt-target-stage');
    if (stage) stage.disabled = nq;
    $('target-why').hidden = !nq;
  }
  // 消耗品摺疊起來時也看得到現值（Owner：不要塞一個欄位在那邊等人發現）
  function updateConsumableSummary() {
    // 顯示名一律問選擇層（唯一真相＝CraftConsumable 的 state，不是 DOM）；缺該層（測試 sandbox）視為未選
    const label = (kind) => globalThis.CraftConsumable?.label?.(kind) || '';
    const parts = [];
    const food = label('food'), potion = label('potion');
    if (food) parts.push('食物 ' + food + ($('food-hq').checked ? '（HQ）' : ''));
    if (potion) parts.push('藥水 ' + potion + ($('potion-hq').checked ? '（HQ）' : ''));
    $('consumable-sum').textContent = parts.length ? parts.join('・') : '未使用';
  }

  function update() {
    if (!deps) return;
    const { esc, getSelected, isPicking, gearOkFor, hasResult, isSolving } = deps;
    const sel = getSelected();
    // 回到配方列表時 selected 刻意保留（要標原選中列）→ 流程位置看 picker 是否展開，不看 selected 有無
    const hasRecipe = !!sel && !isPicking();
    const solving = isSolving();
    const gearOk = hasRecipe && gearOkFor(sel.recipe.job);
    const { st, steps, next } = flowHtml({
      hasRecipe,
      recipeName: hasRecipe && sel.recipe.item_name,
      job: hasRecipe && sel.recipe.job,
      gearOk,
      hasResult: hasResult(),
      solving,
    }, esc);
    $('flow-steps').innerHTML = steps;
    $('flow-next').innerHTML = next;
    // ① 完成 → 整張選配方卡收合成一行摘要（驗收線 4）：卸下 codex-tablet 外觀改掛 crafter-picked slim bar
    const pick = $('pick-panel');
    if (pick) {
      pick.classList.toggle('codex-tablet', !hasRecipe);
      pick.classList.toggle('codex-tablet--cyan', !hasRecipe);
      pick.classList.toggle('panel', !hasRecipe);
      pick.classList.toggle('crafter-picked', hasRecipe);
    }
    // 主 CTA 旁的一行狀態：就緒／停用原因（驗收線 3 — 控制不隱藏，寫清楚為什麼不能按）
    const hint = $('solve-hint');
    if (hint) {
      const warn = hasRecipe && !gearOk;
      hint.textContent = !hasRecipe ? ''
        : warn ? `尚未設定「${sel.recipe.job}」的角色數值，無法求解`
        : solving ? ''
        : hasResult() ? '改動任一設定後可再按一次重新求解'
        : '準備就緒 — 按下開始計算最佳手法';
      hint.classList.toggle('crafter-actionbar__hint--warn', !!warn);
    }
    // 空狀態內那顆 CTA 與主 CTA 同步暗掉（同一動作、同一條件；PH_HTML 重設後節點會換，故每次 update 都重設）
    const phBtn = $('ph-solve');
    if (phBtn) phBtn.setAttribute('aria-disabled', hasRecipe && !gearOk ? 'true' : 'false');
    // 尚無結果時結果欄不與設定欄等高（否則右半邊是一整片空面板）——**有結果**才拉齊兩欄。
    // 求解中也維持 is-idle：此時結果仍是隱藏的，拉齊只會拉出一片空黑。
    const work = $('work');
    if (work) work.classList.toggle('is-idle', st.steps[2].state !== 'done');
    return st;
  }

  const REQUIRED = ['esc', 'getSelected', 'isPicking', 'gearOkFor', 'hasResult', 'isSolving'];
  globalThis.CraftFlow = {
    init(d) {
      const miss = REQUIRED.filter(k => d == null || d[k] == null);
      if (miss.length) throw new Error('CraftFlow.init 缺依賴: ' + miss.join(', '));
      deps = d;
    },
    update,
    setTargetMode, updateConsumableSummary,   // 設定區的「現值／停用原因」顯示（不需 init 即可用）
    flowState, // 純函式，golden 測試面（test-formulas T14 載本檔取用）
    flowHtml,  // 同上（T17：對照 index.html 的靜態初始標記，防 CLS 預留標記漂移）
  };
})();

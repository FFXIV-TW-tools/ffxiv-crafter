// app-recipe.js — 配方選擇、詳情重繪與原料初始品質。
// classic script：發佈 globalThis.CraftRecipe，app.js init 注入依賴；資料與畫面狀態由 getter/setter 取回 app.js。
(function () {
  let deps = null;

  function selectRecipe(id, fromList, keepChain) {
    const recipe = deps.getRecipes().find(r => r.id === id);
    if (!recipe) return false;
    const rlv = deps.getRlvTable()[String(recipe.rlv)];
    if (!rlv) { deps.toast('此配方缺 recipe level 資料', 'error'); return false; }   // 回傳成功與否 → 呼叫端（goSolve）失敗時不強制切頁
    // 換配方 → 作廢飛行中的求解（世代守衛已擋住舊結果渲染，這裡是收 UI 狀態＋釋放 CPU）。
    // 放在兩個 return false 之後：選配方失敗時不該波及正在跑的求解。
    globalThis.CraftSolve?.invalidateInFlight?.();
    deps.setSelected({ recipe, rlv, baseRlv: rlv });   // rlv 之後可能被等級同步換掉；baseRlv 永遠是配方原始那列
    if (!keepChain) chain = [];   // 從配方表／清單／深連結另選一個配方＝放棄原本那條鏈
    deps.setOpenedFromList(!!fromList);   // 從製造清單「前往求解」進入 → 結果區顯示「← 回製造清單」；瀏覽/深連結進入為 false
    // 收合配方表；返回控件＝右上「← 返回配方列表」鈕（唯一可點）。此處只放誠實的「當前位置」狀態，不做「配方瀏覽›」假 nav 麵包屑（死 span 誤導可點）。
    deps.$('picker').hidden = true;
    deps.$('change-recipe').hidden = false;
    deps.$('selected-bar').hidden = false;
    deps.$('selected-bar').innerHTML = `目前配方：<b class="sb-cur">${deps.esc(recipe.item_name)}</b> <span class="codex-small">${deps.esc(recipe.job)} · Lv ${rlv.class_job_level} · rlv ${recipe.rlv}</span>`;
    deps.$('work').hidden = false;
    deps.$('results').hidden = true;
    deps.$('results-placeholder').hidden = false;
    deps.$('results-placeholder').innerHTML = deps.PH_HTML;
    refreshSelectedGear();
    globalThis.CraftFlow?.update?.();   // 流程軸推進到 ②（含 pick-panel 收合成摘要條）
    deps.$('work').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }

  function showPicker() {
    chain = [];   // 返回配方列表＝放棄這條製作鏈（返回鈕的語意才不會指向一個已經離開的情境）
    // 返回配方列表＝離開這次求解 → 作廢飛行中的那一份。少了這行：UI 狀態（solve-btn 藏著、
    // cancel-btn 亮著）會殘留到新配方頁面，舊求解還在燒 CPU，而 app-solve 的註解早就宣告涵蓋這條路
    // ——契約寫在註解裡而程式碼另一套（T25 守，與 selectRecipe 那條並列）。
    globalThis.CraftSolve?.invalidateInFlight?.('invalidated');
    deps.setOpenedFromList(false);   // 返回瀏覽即結束「從清單進入」情境 → 下次選配方不殘留「← 回製造清單」
    // selected 刻意保留（返回列表仍要標示原選中列 is-sel + 還焦）；流程位置改看 picker 是否展開
    deps.$('picker').hidden = false;
    deps.$('change-recipe').hidden = true;
    deps.$('next-craft').hidden = true;   // 同 change-recipe：離開配方就沒有「這個成品」可以繼續做
    deps.$('selected-bar').hidden = true;
    deps.$('work').hidden = true;
    globalThis.CraftFlow?.update?.();
    deps.renderTable();  // 篩選/搜尋值保留在 input 上、不清（返回不重置瀏覽狀態）
    deps.$('pick-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const back = deps.$('recipe-table').querySelector('.rt-row.is-sel') || deps.$('recipe-search'); // 還焦：優先原選中列、否則搜尋框（a11y 返回焦點不遺失）
    if (back && back.focus) back.focus({ preventScroll: true });
  }

  // ---------- 製作鏈（純函式，golden 測試面）----------
  // 為什麼要這層：宇宙探索那種「階段性」的東西是**一條製作鏈**——先做中間材、再拿它做交付物。
  // 例：統一規格的合金鉚釘(48329) ← 統一規格的合金(48333) ×2 ← 宇宙貨箱。
  // 玩家原本得自己搜尋每一層、求解、複製巨集、再回頭搜下一層。這裡把整條鏈算出來，
  // UI 才給得出「先做這個 → 回來做這個」的連續動線。
  //
  // 回傳由**底層到成品**排序的步驟：[{ itemId, name, recipeId, times, need, depth }]
  //   need  ＝這一層總共要幾個（已乘上層的製作次數）
  //   times ＝要做幾次（need ÷ 該配方一次產幾個，無條件進位）
  // 只收「做得出來的」——沒有配方的素材是買/採的，不進步驟（它們在原料清單裡已經看得到）。
  function craftPlan(recipe, ctx, maxDepth = 8) {
    const byId = ctx.recipesById || {}, byItem = ctx.recipeByItem || {}, ing = ctx.ingredients || {};
    const steps = new Map();   // itemId → step（同一個中間材在多處用到時把 need 加總，不重複列）
    const walk = (rid, runs, depth, path) => {
      if (depth > maxDepth || path.has(rid)) return;   // 資料出環時停下：寧可少展開一層也不要無限遞迴
      const next = new Set(path); next.add(rid);
      for (const [iid, amt] of (ing[String(rid)] || [])) {
        const childRid = byItem[Number(iid)];
        const child = childRid != null ? byId[childRid] : null;
        if (!child) continue;                          // 買/採得到的底層素材不是「步驟」
        const need = Number(amt) * runs;
        const per = Math.max(1, Number(child.item_amount) || 1);
        const cur = steps.get(Number(iid));
        const total = (cur ? cur.need : 0) + need;
        steps.set(Number(iid), { itemId: Number(iid), name: child.item_name || ('#' + iid),
          recipeId: child.id, need: total, times: Math.ceil(total / per), depth: depth + 1 });
        walk(child.id, Math.ceil(total / per), depth + 1, next);
      }
    };
    walk(recipe.id, 1, 0, new Set());
    // 深的先做（底層 → 上層），同深度按需求量多的在前，量同則 id 穩定排序
    const ordered = [...steps.values()].sort((a, b) => b.depth - a.depth || b.need - a.need || a.itemId - b.itemId);
    const per = Math.max(1, Number(recipe.item_amount) || 1);
    ordered.push({ itemId: recipe.item_id, name: recipe.item_name, recipeId: recipe.id,
      need: per, times: 1, depth: 0, final: true });
    return ordered;
  }

  // 同一件東西常常好幾個職業都能做（實測 651 件；宇宙探索的「統一規格的金屬板」12 個＝全 DoH）。
  // 挑選優先序：玩家**有填數值**的職業 → 否則第一個。畫面上一律給切換鈕，不幫他決定死。
  function recipesForItem(itemId) {
    return (deps.getRecipesByItem()[Number(itemId)] || [])
      .map((id) => deps.getRecipesById()[id]).filter(Boolean);
  }
  function pickRecipeForItem(itemId) {
    const list = recipesForItem(itemId);
    return list.find((r) => deps.gearOkFor(r.job)) || list[0] || null;
  }

  // 製作鏈的返回堆疊（多層）：從成品鑽進中間材時把「原本在哪」推進去，做完一鍵回去。
  // 用堆疊而不是 openedFromList 那種 boolean —— 鏈可能不只兩層（A ← B ← C）。
  // **不在切分頁時清空**（玩家常常要跳去「角色數值」補資料再回來），只有「返回配方列表」
  // 或從配方表另選一個配方才算放棄這條鏈。
  let chain = [];
  function craftIngredient(rid) {
    const cur = deps.getSelected();
    if (cur && cur.recipe) chain.push({ id: cur.recipe.id, itemId: cur.recipe.item_id, name: cur.recipe.item_name });
    if (!selectRecipe(rid, false, true)) chain.pop();   // 選失敗就還原堆疊，不留下假的返回點
  }
  // 「繼續做」＝往上一階前進（用這個成品去做別的東西），與「先做這個」方向相反。
  // **不推堆疊**（Owner 2026-08-17 拍板）：那不是「先做這個再回來」，一路往上做會堆出一長串
  // 永遠用不到的返回點。特例＝選中的正好是堆疊最上層（你剛才鑽下來的來源）⇒ 等同按「← 回」，
  // 把它彈掉；不然畫面會出現「← 回 A」而你人就站在 A 上。
  function continueWith(rid) {
    const top = chain[chain.length - 1];
    const r = deps.getRecipesById()[rid];
    if (top && r && (top.id === rid || (r.item_id != null && top.itemId === r.item_id))) return backInChain();
    selectRecipe(rid, false, true);   // 其餘的鏈保留：底下那條「做完中間材回去做成品」還沒完成
  }
  function backInChain() {
    const prev = chain.pop();
    if (prev) selectRecipe(prev.id, false, true);
  }
  function chainDepth() { return chain.length; }

  // 「繼續做」入口（住頂部「目前配方」那一列，不佔配方詳情的高度）。
  // 沒有下一階時**整顆收起來**：出一顆點了只會說「沒有」的鈕等於騙玩家點一次。
  function renderNextBtn(recipe) {
    const nb = deps.$('next-craft');
    if (!nb) return;
    const n = (recipe && globalThis.CraftNext?.countFor?.(recipe.item_id)) || 0;
    nb.hidden = !n;
    if (!n) return;
    nb.textContent = `⚒ 繼續做（${n}）`;
    nb.setAttribute('data-help', `用「${recipe.item_name}」還能做 ${n} 種東西 — 挑一個接著做`);
    nb.onclick = () => globalThis.CraftNext?.open?.(recipe.item_id, recipe.item_name, nb);
  }

  // 最低能力要求（3396 個配方有）：遊戲內數值不到就不給做 ⇒ 要在選配方當下就看得到，
  // 不足時標紅並寫出還差多少（比較基準含食物／藥水／專家之證，同遊戲判定）。
  function reqStatHtml(recipe) {
    const gate = deps.statGate(recipe);
    if (!(gate.need.cms || gate.need.ctrl)) return '';
    return `<span class="ri-stat ri-stat--req${gate.ok ? '' : ' is-short'}"` +
      ` data-help="這個配方在遊戲內有最低能力要求：作業精度 ${gate.need.cms} ／ 加工精度 ${gate.need.ctrl}。` +
      `不到就不能製作（食物與藥水的加成算數）。${gate.ok ? '你目前符合。' : `你還差 作業 ${gate.cms} ／ 加工 ${gate.ctrl}。`}">` +
      `需求 作業<b>${gate.need.cms}</b> 加工<b>${gate.need.ctrl}</b>${gate.ok ? '' : ' ⚠'}</span>`;
  }

  function refreshGearNote() {
    const selected = deps.getSelected();
    if (!selected) return;
    const { recipe } = selected;
    const g = deps.gearFor(recipe.job);
    // 角色等級改變時，等級同步配方的生效 rlv 也可能改變；只有這時才需要完整重繪。
    const sync = globalThis.CraftSync?.resolve?.(recipe, deps.getRlvTable(), g && Number(g.level));
    const nextRlv = (sync && sync.row) || selected.baseRlv;
    const oldRlv = selected.rlv;
    const rlvChanged = oldRlv && nextRlv ? oldRlv.id !== nextRlv.id : oldRlv !== nextRlv;
    if (rlvChanged) {
      // 完整重繪會重建素材列／目標欄；先記住玩家成果，重繪後再套回（目標超過新上限則收斂）。
      const targetBefore = deps.$('opt-target').value;
      // 選的是「某一檔」時要依**檔次**重推新 rlv 下的門檻，不是保留舊的絕對數字
      // （宇宙任務門檻＝滿品質的百分比，rlv 一變數字就不同 → T38 守）
      const stageBefore = globalThis.CraftStages?.stageSelection?.() ?? null;
      const hqBefore = {};
      deps.$('ingredients').querySelectorAll('.ing-hq-in').forEach((inp) => { hqBefore[inp.dataset.iid] = inp.value; });
      refreshSelectedGear();
      const { max_quality: maxQ } = deps.recipeMaxes(recipe, selected.rlv);
      const target = deps.$('opt-target');
      // 檔次套得回去就用檔次（新門檻由新滿品質重推）；自訂數字才退回「保留絕對值並收斂到新上限」
      if (!globalThis.CraftStages?.applyStageSelection?.(stageBefore)) {
        if (targetBefore === '') target.value = '';
        else {
          const n = Number(targetBefore);
          target.value = Number.isFinite(n) ? String(Math.min(Math.max(0, n), maxQ)) : targetBefore;
        }
        globalThis.CraftStages?.syncFromInput?.();
      }
      deps.$('ingredients').querySelectorAll('.ing-hq-in').forEach((inp) => {
        const old = hqBefore[inp.dataset.iid];
        if (old == null) return;
        const n = Number(old), amount = Number(inp.dataset.amt);
        inp.value = Number.isFinite(n) ? String(Math.min(Math.max(0, n), Number.isFinite(amount) ? amount : n)) : '0';
      });
      updateInitial(recipe, maxQ);
      return;
    }
    // 生效 rlv 沒變也要重繪等級同步說明：說明文字裡有「依角色等級 Lv 91」「手動指定 Lv 92」這種
    // 會變、但不改變 rlv 級距的東西。原本唯一呼叫 CraftSync.render 的地方在 refreshSelectedGear 裡，
    // 走不到這條路 ⇒ 面板會停在舊等級（T37 守）。
    globalThis.CraftSync?.render?.(recipe, sync, g && Number(g.level), deps.recipeMaxes(recipe, nextRlv));
    // 專家之證已移到「角色數值」分頁（每職一份、上限 3）→ 這行是求解頁唯一看得到它的地方，必須寫出來
    const spec = g && g.specialist ? ' · <b>專家之證 ✔</b>' : '';
    const note = g
      ? `✅ 套用「${deps.esc(g._src)}」數值：作業 ${g.cms} · 加工 ${g.ctrl} · CP ${g.cp} · Lv ${Number(g.level) || 100}${g.level ? '' : '（假設，未填等級）'}${spec}`
      : `⚠ 尚未設定「${deps.esc(recipe.job)}」數值 — <a href="#" id="goto-stats">去填角色數值 →</a>`;
    const noteEl = deps.$('gear-note');
    if (noteEl) {
      noteEl.className = `ri-gear codex-tint-panel codex-tint-panel--bar ${g ? 'codex-tint-panel--success' : 'codex-tint-panel--warn'}`;
      noteEl.innerHTML = note;
    }
    const gl = deps.$('goto-stats'); if (gl) gl.onclick = (e) => { e.preventDefault(); deps.switchTab('stats', true); };
    // 專家之證是該職業的角色狀態 → 換配方或改角色數值都可能翻轉「專心致志／快速改革」可不可用
    deps.refreshSpecialistGate();
    deps.updateEff();
    // 缺角色數值時不用 disabled，保留可聚焦的補救入口；只更新 gear 實際影響的 aria 狀態。
    // 最低能力要求不足**同樣**只暗掉不 disabled（按下去由 doSolve 說明差多少並導去角色數值）。
    const gate = deps.statGate(recipe);
    deps.$('solve-btn').setAttribute('aria-disabled', (g && gate.ok) ? 'false' : 'true');
    deps.$('recipe-req').innerHTML = reqStatHtml(recipe);   // 紅字與鈕同一次更新（健檢 R5 M2：吃了藥仍寫「還差 N」）
  }

  function refreshSelectedGear() {
    const selected = deps.getSelected();
    const { recipe } = selected;
    const g = deps.gearFor(recipe.job);
    // 等級同步（宇宙探索配方）：生效的 recipe level 可能不是配方存的那列 → 先解析，之後**顯示與求解都用它**
    // （selected.rlv 是 computeSettings 的唯一入口，換在這裡就不會有第二條路徑漏掉同步）
    const sync = globalThis.CraftSync?.resolve?.(recipe, deps.getRlvTable(), g && Number(g.level));
    const rlv = selected.rlv = (sync && sync.row) || selected.baseRlv;
    const { max_progress: maxP, max_quality: maxQ, max_durability: maxD } = deps.recipeMaxes(recipe, rlv);
    globalThis.CraftSync?.render?.(recipe, sync, g && Number(g.level),
      { max_progress: maxP, max_quality: maxQ, max_durability: maxD });
    const icon = (deps.getItems()[String(recipe.item_id)] || {}).icon;
    const jico = deps.JOB_ICON[recipe.job] ? `<img class="ri-jico" src="${deps.iconUrl(deps.JOB_ICON[recipe.job])}" alt="">` : '';
    // 動作列：統一 ghost 按鈕群（設計系統，取代自寫 link-button）。marketboard 連結只在有 item_id 時出（防壞連結）。
    const mbLink = recipe.item_id
      ? `<a class="codex-btn codex-btn--ghost" href="${deps.mbCraft(recipe.item_id)}" target="ffxiv-marketboard" data-help="到市場板看材料多層樹｜各材料即時價｜成本與利潤試算。共用同一分頁。">💰 查價</a>`
      : '';
    // 多職業：給切換鈕。**不是裝飾**——宇宙探索那批中間材動輒 3〜12 個職業可做，
    // 站台若替玩家選了一個他沒練的職業，他按求解只會被擋在「請先設定角色數值」。
    const alts = recipesForItem(recipe.item_id);
    const jobSwitch = alts.length > 1
      ? `<div class="ri-jobs" role="group" aria-label="換一個職業製作">` +
        `<span class="codex-small ri-jobs__label">也能做：</span>` +
        alts.map((r) => {
          const on = r.id === recipe.id, ok = deps.gearOkFor(r.job);
          const jic = deps.JOB_ICON[r.job] ? `<img class="ri-jico" src="${deps.iconUrl(deps.JOB_ICON[r.job])}" alt="">` : '';
          // 已是 role="group" 的分段選擇 → 選中態走共用 `.codex-tab--boxed` 的 aria-pressed
          // （2026-08-17 由 --primary/--ghost 遷入，同 app-browse.js）
          return `<button type="button" class="codex-tab codex-tab--boxed ri-job-btn" aria-pressed="${on}"` +
            ` data-rid="${r.id}"${on ? ' aria-current="true"' : ''}` +
            ` data-help="${on ? '目前用這個職業的配方' : '改用「' + deps.esc(r.job) + '」的配方求解'}${ok ? '' : '｜這個職業還沒填角色數值'}">` +
            `${jic}${deps.esc(r.job)}${ok ? '' : ' <span class="codex-xs ri-job-btn__no">未填</span>'}</button>`;
        }).join('') + `</div>`
      : '';
    // 最低能力要求（3396 個配方有）：遊戲內數值不到就不給做 ⇒ 要在選配方當下就看得到，
    // 不足時標紅並寫出還差多少（比較基準含食物／藥水／專家之證，同遊戲判定）。
    const reqStat = `<span id="recipe-req">${reqStatHtml(recipe)}</span>`;   // 容器獨立：食藥／數值變動時由 refreshGearNote 就地更新，不整段重繪（重繪會清 HQ 素材）
    const backChain = chain.length
      ? `<button id="back-in-chain" class="codex-btn codex-btn--ghost" type="button" data-help="回到這條製作鏈的上一層（中間材做完了就回去做成品）">← 回「${deps.esc(chain[chain.length - 1].name)}」</button>`
      : '';
    const backToList = deps.getOpenedFromList()
      ? `<button id="back-to-list" class="codex-btn codex-btn--ghost" type="button" data-help="回到製造清單分頁">← 回製造清單</button>`
      : '';
    deps.$('recipe-info').innerHTML = `
    <div class="ri-head">
      ${icon ? `<img class="ri-icon" src="${deps.iconUrl(icon)}" alt="">` : ''}
      <div class="ri-main">
        <div class="ri-name">${deps.esc(recipe.item_name)}${recipe.is_expert ? ' <span class="codex-small">高難度</span>' : ''}</div>
        <div class="ri-stats"><span class="ri-job">${jico}${deps.esc(recipe.job)}</span><span class="ri-stat">難度<b>${maxP}</b></span><span class="ri-stat">品質<b>${maxQ}</b></span><span class="ri-stat">耐久<b>${maxD}</b></span>${reqStat}</div>
      </div>
      <div class="ri-actions">
        <button id="add-to-list" class="codex-btn codex-btn--ghost" type="button" data-help="加進「製造清單」分頁，彙總所有成品的素材總需求">📋 加入清單</button>
        ${backChain}
        ${mbLink}
        ${backToList}
      </div>
    </div>
    ${jobSwitch}
    <div id="gear-note" class="ri-gear codex-tint-panel codex-tint-panel--bar"></div>`;
    const ab = deps.$('add-to-list'); if (ab) ab.onclick = () => { if (typeof globalThis.CraftList?.add === 'function') globalThis.CraftList.add(recipe.id); };
    // 回清單：switchTab('list') 已集中清 openedFromList + 收返回鈕（見 switchTab），此處只需切頁+移焦
    const bl = deps.$('back-to-list'); if (bl) bl.onclick = () => deps.switchTab('list', true);
    const bc = deps.$('back-in-chain'); if (bc) bc.onclick = backInChain;
    renderNextBtn(recipe);
    // 換職業**保留製作鏈**（換的是「用哪個職業做同一件東西」，不是放棄這條鏈）
    deps.$('recipe-info').querySelectorAll('.ri-job-btn').forEach((b) => {
      b.onclick = () => { if (+b.dataset.rid !== recipe.id) selectRecipe(+b.dataset.rid, deps.getOpenedFromList(), true); };
    });
    deps.$('opt-target').value = ''; deps.$('opt-target').max = maxQ; deps.$('opt-target').placeholder = '滿(' + maxQ + ')';
    globalThis.CraftStages?.setRecipe?.(recipe, maxQ);   // 該配方有幾檔品質門檻（收藏品／宇宙任務）→ 重建階段選單
    globalThis.CraftFlow.setTargetMode();         // NQ 模式目標品質欄停用 + 寫出原因（引導層）
    renderIngredients(recipe, maxQ);
    refreshGearNote();
    // 缺角色數值時**不用 disabled**（真 disabled 不可聚焦 → 螢幕閱讀器讀不到原因、鍵盤也走不到）：
    // 改 aria-disabled 暗掉但可按，按下由 doSolve 導去「角色數值」分頁（驗收線 3：控制不隱藏＋寫出原因＋給補救入口）
    deps.$('opt-adversarial').disabled = recipe.is_expert; // 高難度配方引擎不支援防球
    deps.$('adv-why').hidden = !recipe.is_expert;
    if (recipe.is_expert) deps.$('opt-adversarial').checked = false;
    else deps.restoreOpt?.('opt-adversarial');   // 離開 expert 要把玩家原本的勾還他，否則同 session 內偏好就丟了（健檢 R5 M7）
  }

  // ---------- 配方原料 + HQ → 自動初始品質 ----------
  function renderIngredients(recipe, maxQ) {
    const ings = deps.getIngredients()[String(recipe.id)] || [];
    const items = deps.getItems();
    const mf = recipe.material_quality_factor || 0;
    const hqable = (iid) => mf > 0 && !!(items[String(iid)] && items[String(iid)].can_be_hq);
    const isCrystal = (iid) => deps.isCrystal(iid, (items[String(iid)] || {}).name);   // 規則單一出口在 app.js（Q-02）
    // 遊戲原順序（ingredients.json 序），但晶體移到最後（對齊遊戲製作筆記呈現）
    const ordered = [...ings.filter(([iid]) => !isCrystal(iid)), ...ings.filter(([iid]) => isCrystal(iid))];
    const anyHq = ings.some(([iid]) => hqable(iid));
    const rows = ordered.map(([iid, amount]) => {
      const it = items[String(iid)] || {};
      const name = it.name || ('#' + iid);
      const ico = it.icon ? `<img class="ing-ico" src="${deps.iconUrl(it.icon)}" alt="" loading="lazy">` : '';
      // 素材名掛 marketboard 查價/來源深連結（DRY mbItem）；晶體/水晶/晶簇亦可上市場板交易，故一律連（isCrystal 僅用於排序殿後）
      const nameHtml = `<a class="ing-name ing-name--link" href="${deps.mbItem(iid)}" target="ffxiv-marketboard" data-help="到市場板查「${deps.esc(name)}」的價格與來源。共用同一分頁。">${deps.esc(name)}</a>`;
      // 可製作的素材 → 給「先做這個」入口（推入返回堆疊，做完一鍵回來）。
      // 這是「階段性任務」的核心動線：原本玩家要自己重新搜尋中間材。
      // 多職業可做時挑玩家**有填數值**的那個（挑他沒練的職業＝按下去只會被擋在角色數值頁）
      const child = pickRecipeForItem(Number(iid));
      const times = child ? Math.ceil(amount / Math.max(1, Number(child.item_amount) || 1)) : 0;
      const goBtn = child
        ? `<button type="button" class="codex-btn codex-btn--ghost ing-go" data-rid="${child.id}"` +
          ` data-help="先做這個中間材（要做 ${times} 次）｜做完可以一鍵回到「${deps.esc(recipe.item_name)}」">⚒ 先做這個${times > 1 ? ' ×' + times : ''}</button>`
        : '';
      const ctl = hqable(iid)
        ? `<span class="ing-hqctl"><span class="ing-hqctl__tag codex-xs">HQ</span><input class="ing-hq-in codex-input" data-iid="${iid}" data-amt="${amount}" type="number" min="0" max="${amount}" value="0" inputmode="numeric" aria-label="「${deps.esc(name)}」使用的 HQ 數量">/ ${amount}</span>`
        : '<span class="ing-na codex-small" data-help="此素材沒有 HQ 版本，無法用來提高起始品質" aria-label="不可 HQ">—</span>';
      return `<div class="ing${hqable(iid) ? ' ing--hq' : ''}">${ico}${nameHtml}<span class="ing-amt">×${amount}</span>${ctl}${goBtn}</div>`;
    }).join('');
    deps.$('ingredients').innerHTML = `
    <div class="ing-head"><span class="ing-group-title">配方原料</span>${anyHq ? '<button class="codex-btn codex-btn--ghost ing-allhq">全部 HQ</button>' : ''}</div>
    <div class="ing-list">${rows || '<span class="codex-small">（無原料資料）</span>'}</div>
    <div class="ing-initial" id="ing-initial"></div>`;
    deps.$('ingredients').querySelectorAll('.ing-go').forEach((b) => {
      b.onclick = () => craftIngredient(Number(b.dataset.rid));
    });
    deps.$('ingredients').querySelectorAll('.ing-hq-in').forEach(inp => inp.addEventListener('input', () => { updateInitial(recipe, maxQ); deps.invalidateResults(); }));
    const all = deps.$('ingredients').querySelector('.ing-allhq');
    if (all) all.onclick = () => { deps.$('ingredients').querySelectorAll('.ing-hq-in').forEach(i => i.value = i.dataset.amt); updateInitial(recipe, maxQ); deps.invalidateResults(); };
    updateInitial(recipe, maxQ);
  }

  function updateInitial(recipe, maxQ) {
    const mf = recipe.material_quality_factor || 0;
    const items = deps.getItems();
    let totalIlvl = 0, providedIlvl = 0;
    deps.$('ingredients').querySelectorAll('.ing-hq-in').forEach(inp => {
      const amt = +inp.dataset.amt, hq = Math.min(Math.max(0, +inp.value || 0), amt);
      const ilvl = (items[String(inp.dataset.iid)] || {}).level || 0;
      totalIlvl += ilvl * amt; providedIlvl += ilvl * hq;
    });
    const computedInitial = (mf > 0 && totalIlvl > 0) ? Math.floor(maxQ * mf * providedIlvl / totalIlvl / 100) : 0;
    deps.setComputedInitial(computedInitial);
    const initMax = mf > 0 ? Math.floor(maxQ * mf / 100) : 0;
    const el = deps.$('ing-initial');
    // 進度條分母＝**可帶入上限 initMax**，不是配方滿品質 maxQ：素材能影響的範圍只到 initMax，
    // 用 maxQ 當分母會讓「全部素材都換 HQ」也只填到一半，讀起來像還沒做滿（外審 2026-07-27 指出的誤導）。
    // maxQ 的參考值改放在下方註記，兩個尺度分開講、不混用。
    const pct = (initMax > 0) ? Math.min(100, Math.floor(computedInitial / initMax * 100)) : 0;
    const atCap = initMax > 0 && computedInitial >= initMax;
    if (el) el.innerHTML = mf > 0
      ? `<div class="ing-initial__head"><span>初始品質 <span class="codex-small">（HQ 素材帶入）</span></span><b>${computedInitial} / ${initMax}</b></div>` +
        `<div class="codex-progress"><div class="codex-progress__bar" style="width:${pct}%"></div></div>` +
        `<div class="ing-initial__foot codex-small">${atCap
          ? `已用滿此配方的素材可帶入上限，相當於滿品質 ${maxQ} 的 <b>${Math.floor(initMax / maxQ * 100)}%</b>`
          : `上限 <b>${initMax}</b>（＝所有可 HQ 素材都換 HQ），相當於滿品質 ${maxQ} 的 ${Math.floor(initMax / maxQ * 100)}%`}</div>`
      : '<span class="codex-small">此配方無法用 HQ 素材提升初始品質</span>';
  }

  const REQUIRED = ['$', 'esc', 'iconUrl', 'toast', 'PH_HTML', 'JOB_ICON', 'mbItem', 'mbCraft', 'recipeMaxes', 'switchTab',
    'renderTable', 'getRecipes', 'getRlvTable', 'getItems', 'getIngredients', 'getSelected', 'setSelected',
    'getComputedInitial', 'setComputedInitial', 'getOpenedFromList', 'setOpenedFromList', 'invalidateResults',
    'updateEff', 'gearFor', 'refreshSpecialistGate', 'isCrystal',
    'getRecipesById', 'getRecipeByItem', 'getRecipesByItem', 'gearOkFor', 'statGate'];
  globalThis.CraftRecipe = {
    craftPlan, craftIngredient, backInChain, chainDepth, continueWith, recipesForItem, pickRecipeForItem,
    init(d) {
      const miss = REQUIRED.filter(k => d == null || d[k] == null);
      if (miss.length) throw new Error('CraftRecipe.init 缺依賴: ' + miss.join(', '));
      deps = d;
    },
    selectRecipe,
    showPicker,
    refreshGearNote,
    refreshSelectedGear,
    renderIngredients,
    updateInitial,
  };
})();

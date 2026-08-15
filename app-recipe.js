// app-recipe.js — 配方選擇、詳情重繪與原料初始品質。
// classic script：發佈 globalThis.CraftRecipe，app.js init 注入依賴；資料與畫面狀態由 getter/setter 取回 app.js。
(function () {
  let deps = null;

  function selectRecipe(id, fromList) {
    const recipe = deps.getRecipes().find(r => r.id === id);
    if (!recipe) return false;
    const rlv = deps.getRlvTable()[String(recipe.rlv)];
    if (!rlv) { deps.toast('此配方缺 recipe level 資料', 'error'); return false; }   // 回傳成功與否 → 呼叫端（goSolve）失敗時不強制切頁
    // 換配方 → 作廢飛行中的求解（世代守衛已擋住舊結果渲染，這裡是收 UI 狀態＋釋放 CPU）。
    // 放在兩個 return false 之後：選配方失敗時不該波及正在跑的求解。
    globalThis.CraftSolve?.invalidateInFlight?.();
    deps.setSelected({ recipe, rlv, baseRlv: rlv });   // rlv 之後可能被等級同步換掉；baseRlv 永遠是配方原始那列
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
    deps.setOpenedFromList(false);   // 返回瀏覽即結束「從清單進入」情境 → 下次選配方不殘留「← 回製造清單」
    // selected 刻意保留（返回列表仍要標示原選中列 is-sel + 還焦）；流程位置改看 picker 是否展開
    deps.$('picker').hidden = false;
    deps.$('change-recipe').hidden = true;
    deps.$('selected-bar').hidden = true;
    deps.$('work').hidden = true;
    globalThis.CraftFlow?.update?.();
    deps.renderTable();  // 篩選/搜尋值保留在 input 上、不清（返回不重置瀏覽狀態）
    deps.$('pick-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const back = deps.$('recipe-table').querySelector('.rt-row.is-sel') || deps.$('recipe-search'); // 還焦：優先原選中列、否則搜尋框（a11y 返回焦點不遺失）
    if (back && back.focus) back.focus({ preventScroll: true });
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
    deps.$('solve-btn').setAttribute('aria-disabled', g ? 'false' : 'true');
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
      ? `<a class="codex-btn codex-btn--ghost" href="${deps.mbCraft(recipe.item_id)}" target="ffxiv-marketboard" data-help="到市場板看材料多層樹｜各材料即時價｜成本與利潤試算。共用同一分頁。">💰 材料樹與利潤</a>`
      : '';
    const backToList = deps.getOpenedFromList()
      ? `<button id="back-to-list" class="codex-btn codex-btn--ghost" type="button" data-help="回到製造清單分頁">← 回製造清單</button>`
      : '';
    deps.$('recipe-info').innerHTML = `
    <div class="ri-head">
      ${icon ? `<img class="ri-icon" src="${deps.iconUrl(icon)}" alt="">` : ''}
      <div class="ri-main">
        <div class="ri-name">${deps.esc(recipe.item_name)}${recipe.is_expert ? ' <span class="codex-small">高難度</span>' : ''}</div>
        <div class="ri-stats"><span class="ri-job">${jico}${deps.esc(recipe.job)}</span><span class="ri-stat">難度<b>${maxP}</b></span><span class="ri-stat">品質<b>${maxQ}</b></span><span class="ri-stat">耐久<b>${maxD}</b></span></div>
      </div>
      <div class="ri-actions">
        <button id="add-to-list" class="codex-btn codex-btn--ghost" type="button" data-help="加進「製造清單」分頁，彙總所有成品的素材總需求">📋 加入製造清單</button>
        ${mbLink}
        ${backToList}
      </div>
    </div>
    <div id="gear-note" class="ri-gear codex-tint-panel codex-tint-panel--bar"></div>`;
    const ab = deps.$('add-to-list'); if (ab) ab.onclick = () => { if (typeof globalThis.CraftList?.add === 'function') globalThis.CraftList.add(recipe.id); };
    // 回清單：switchTab('list') 已集中清 openedFromList + 收返回鈕（見 switchTab），此處只需切頁+移焦
    const bl = deps.$('back-to-list'); if (bl) bl.onclick = () => deps.switchTab('list', true);
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
  }

  // ---------- 配方原料 + HQ → 自動初始品質 ----------
  function renderIngredients(recipe, maxQ) {
    const ings = deps.getIngredients()[String(recipe.id)] || [];
    const items = deps.getItems();
    const mf = recipe.material_quality_factor || 0;
    const hqable = (iid) => mf > 0 && !!(items[String(iid)] && items[String(iid)].can_be_hq);
    const isCrystal = (iid) => { const nm = (items[String(iid)] || {}).name || ''; return iid < 20 || /晶簇|水晶|碎晶/.test(nm); };
    // 遊戲原順序（ingredients.json 序），但晶體移到最後（對齊遊戲製作筆記呈現）
    const ordered = [...ings.filter(([iid]) => !isCrystal(iid)), ...ings.filter(([iid]) => isCrystal(iid))];
    const anyHq = ings.some(([iid]) => hqable(iid));
    const rows = ordered.map(([iid, amount]) => {
      const it = items[String(iid)] || {};
      const name = it.name || ('#' + iid);
      const ico = it.icon ? `<img class="ing-ico" src="${deps.iconUrl(it.icon)}" alt="" loading="lazy">` : '';
      // 素材名掛 marketboard 查價/來源深連結（DRY mbItem）；晶體/水晶/晶簇亦可上市場板交易，故一律連（isCrystal 僅用於排序殿後）
      const nameHtml = `<a class="ing-name ing-name--link" href="${deps.mbItem(iid)}" target="ffxiv-marketboard" data-help="到市場板查「${deps.esc(name)}」的價格與來源。共用同一分頁。">${deps.esc(name)}</a>`;
      const ctl = hqable(iid)
        ? `<span class="ing-hqctl"><span class="ing-hqctl__tag codex-xs">HQ</span><input class="ing-hq-in codex-input" data-iid="${iid}" data-amt="${amount}" type="number" min="0" max="${amount}" value="0" inputmode="numeric" aria-label="「${deps.esc(name)}」使用的 HQ 數量">/ ${amount}</span>`
        : '<span class="ing-na codex-small" data-help="此素材沒有 HQ 版本，無法用來提高起始品質" aria-label="不可 HQ">—</span>';
      return `<div class="ing${hqable(iid) ? ' ing--hq' : ''}">${ico}${nameHtml}<span class="ing-amt">×${amount}</span>${ctl}</div>`;
    }).join('');
    deps.$('ingredients').innerHTML = `
    <div class="ing-head"><span class="ing-group-title">配方原料</span>${anyHq ? '<button class="codex-btn codex-btn--ghost ing-allhq">全部 HQ</button>' : ''}</div>
    <div class="ing-list">${rows || '<span class="codex-small">（無原料資料）</span>'}</div>
    <div class="ing-initial" id="ing-initial"></div>`;
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
    'updateEff', 'gearFor', 'refreshSpecialistGate'];
  globalThis.CraftRecipe = {
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

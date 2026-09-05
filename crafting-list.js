// crafting-list.js — 製造清單分頁：配方＋數量收集、素材總需求彙總、localStorage 持久化。
// classic script（無 module 語法）：發佈 globalThis.CraftList，app.js init 時注入依賴——
// 同 tools/test-formulas.mjs 的 vm 載入手法可直接測 aggregateMats/buildShoplistCsv 純函式。
(function () {
  const KEY = 'ffxiv-crafter-craftlist-v1';
  const QTY_MIN = 1, QTY_MAX = 999;
  const SHOPLIST_MAX_TYPES = 100, SHOPLIST_MAX_QTY = 9999, SHOPLIST_MAX_CSV = 1800;
  const SHOPLIST_TOO_LARGE = 'shoplist-over-limit';
  let deps = null;      // app.js 注入：{ $, esc, iconUrl, RECIPES, ITEMS, INGREDIENTS, selectRecipe, switchTab, toast, pickRecipeForItem, vendorHtml }
  let byId = new Map(); // recipe id → recipe
  let list = [];        // [{ id, qty }]（qty＝製作次數）
  let saveWarned = false; // 保存失敗只提醒一次（每次加減都跳 toast 會變成噪音）

  // 移除鈕＝功能性小圖示 → 走 portal 共用元件（`FFXIVIcons.btnHTML('close', …)` → `.codex-icon-btn` ＋內嵌 SVG）。
  // 自刻 ✕ 字元的問題與 emoji 同型：字型相依、視覺重量跟旁邊的 SVG 圖示不一致。
  // 缺 CDN 時退回原本的字元鈕（功能不消失）。class 保持 `cl-del`——事件綁定靠它。
  function delBtn(name) {
    const label = `從清單移除「${name}」`;
    if (globalThis.FFXIVIcons?.btnHTML) return globalThis.FFXIVIcons.btnHTML('close', label, { class: 'cl-del' });
    return `<button class="cl-del codex-btn codex-btn--ghost codex-btn--icon" type="button"` +
      ` aria-label="${deps.esc(label)}">✕</button>`;
  }

  const clampQty = (q) => Math.max(QTY_MIN, Math.min(QTY_MAX, Math.floor(+q) || QTY_MIN));
  const notify = () => { if (deps && deps.onChange) deps.onChange(); };  // 清單任一變更 → 通知求解分頁配方表更新「已加入」標示

  // 純函式（golden 測試面）：entries=[{id,qty}] × ingredientsMap（INGREDIENTS 形狀）→ [[iid, total], …] iid 升冪。
  // 未知 recipe id 略過；qty 先 clamp（0/NaN→1、>999→999）。
  function aggregateMats(entries, ingredientsMap) {
    const totals = new Map();
    for (const e of entries || []) {
      const q = clampQty(e && e.qty);
      for (const [iid, amt] of (ingredientsMap[String(e && e.id)] || [])) {
        totals.set(iid, (totals.get(iid) || 0) + amt * q);
      }
    }
    return [...totals.entries()].sort((a, b) => a[0] - b[0]);
  }

  // 純函式（golden 測試面）：entries=[{id,qty}] × recipe id Map → 市場板成品 CSV。
  // qty 是製作次數，乘上配方 item_amount 後才是送往 marketboard 的成品件數；無 item_id 的配方略過。
  function buildShoplistCsv(entries, recipesById) {
    const totals = new Map();
    let invalidCount = 0;
    for (const entry of entries || []) {
      const recipe = recipesById && typeof recipesById.get === 'function' ? recipesById.get(+entry?.id) : null;
      const itemId = Number(recipe && recipe.item_id);
      const qty = Number(entry && entry.qty);
      const amount = Number(recipe && (recipe.item_amount || 1));
      const finishedQty = qty * amount;
      if (!Number.isSafeInteger(itemId) || itemId <= 0 || !Number.isSafeInteger(finishedQty) || finishedQty <= 0) {
        invalidCount++;
        continue;
      }
      totals.set(itemId, (totals.get(itemId) || 0) + finishedQty);
    }
    const count = totals.size;
    if (!count) return { csv: null, error: null, count, invalidCount };
    if (count > SHOPLIST_MAX_TYPES) return { csv: null, error: SHOPLIST_TOO_LARGE, count, invalidCount };
    if ([...totals.values()].some((qty) => qty > SHOPLIST_MAX_QTY)) {
      return { csv: null, error: SHOPLIST_TOO_LARGE, count, invalidCount };
    }
    const csv = [...totals.entries()].sort((a, b) => a[0] - b[0]).map(([itemId, qty]) => `${itemId}:${qty}`).join(',');  // itemId 升冪：輸出穩定、對齊 aggregateMats（對抗審 grok）
    if (csv.length > SHOPLIST_MAX_CSV) return { csv: null, error: SHOPLIST_TOO_LARGE, count, invalidCount };
    return { csv, error: null, count, invalidCount };
  }

  function load() {
    try {
      list = (JSON.parse(localStorage.getItem(KEY)) || [])
        .filter((e) => e && byId.has(+e.id))       // 資料改版後消失的配方直接剔除
        .map((e) => ({ id: +e.id, qty: clampQty(e.qty) }));
    } catch (e) { console.warn('[crafter] 製造清單讀取失敗，重置:', e); list = []; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(list)); }
    catch (e) {
      console.warn('[crafter] 製造清單儲存失敗（可能是無痕模式）:', e);
      // 只 console.warn 等於沒說：玩家會一路加十幾個配方、關掉分頁才發現整份清單不見了。
      // 一次性 toast（同 app-gear / app-consumable / app-quests 的既有慣例，別每次操作都轟炸）。
      if (!saveWarned) { saveWarned = true; deps?.toast?.('無法保存製造清單（可能是無痕/私密模式），重整後會遺失', 'warn'); }
    }
  }

  function add(recipeId) {
    if (!deps || !byId.has(+recipeId)) return;
    const nm = byId.get(+recipeId).item_name || ('#' + recipeId);   // toast 帶配方名 → 使用者知道「加了哪個」（原通用文案無反饋感）
    const found = list.find((e) => e.id === +recipeId);
    if (found && found.qty >= QTY_MAX) {   // 已達單筆上限：不謊報 +1、不觸發無效 render/notify（誠實鐵則；對抗審 codex/grok）
      deps.toast(`「${nm}」已達單筆製作上限（${QTY_MAX} 次）`, 'warn');
      return;
    }
    if (found) found.qty = clampQty(found.qty + 1);
    else list.push({ id: +recipeId, qty: 1 });
    save(); render(); notify();
    deps.toast(found ? `✓「${nm}」已在清單 · 數量 +1（共 ${found.qty} 次）` : `✓ 已加入「${nm}」到製造清單`, 'ok');
  }

  // 一次加 n 次製作（素材卡的「⚒ 加進清單」用）。不是 add() 呼叫 n 次——那會噴 n 個 toast。
  // 撞到單筆上限時**只加到上限並誠實說**（同 add() 的既有取捨：不謊報加了 n 次）。
  function addRuns(recipeId, runs) {
    if (!deps || !byId.has(+recipeId)) return;
    const n = clampQty(runs);
    const nm = byId.get(+recipeId).item_name || ('#' + recipeId);
    const found = list.find((e) => e.id === +recipeId);
    const before = found ? found.qty : 0;
    if (found) found.qty = clampQty(found.qty + n);
    else list.push({ id: +recipeId, qty: n });
    const after = before + n > QTY_MAX ? QTY_MAX : before + n;
    save(); render(); notify();
    const short = after - before < n;
    deps.toast(short
      ? `「${nm}」已達單筆製作上限（${QTY_MAX} 次），只加到 ${after} 次`
      : `✓ 已把「${nm}」加進清單 · 製作 ${after} 次`, short ? 'warn' : 'ok');
  }

  // 取消一次（配方表每列 ＋ 旁邊那顆 −）。Owner 2026-08-19：加錯了不該逼人切到製造清單才收得回來。
  // 語意與 add() 對稱＝**一次 −1**（不是整筆清掉）：加了 3 次的人按一下只想退一次；歸零才整筆移除。
  function removeOne(recipeId) {
    if (!deps) return;
    const e = list.find((x) => x.id === +recipeId);
    if (!e) return;                     // 不在清單：無聲早退（＋/− 是同一列的孿生鈕，沒東西可退時 − 本來就收起來）
    const nm = (byId.get(+recipeId) || {}).item_name || ('#' + recipeId);
    e.qty -= 1;
    if (e.qty <= 0) list = list.filter((x) => x.id !== +recipeId);
    save(); render(); notify();
    deps.toast(e.qty > 0 ? `「${nm}」數量 −1（剩 ${e.qty} 次）` : `已從製造清單移除「${nm}」`, 'ok');
  }

  const isCrystal = (iid, name) => deps.isCrystal(iid, name);   // 規則單一出口在 app.js（Q-02）

  function renderTabCount() {
    const tab = document.querySelector('#main-tabs .codex-tab[data-tab="list"]');
    if (tab) tab.textContent = `📋 製造清單${list.length ? `（${list.length}）` : ''}`;
  }

  function render() {
    renderTabCount();
    const { $, esc, iconUrl, ITEMS } = deps;
    const box = $('craft-list');
    if (!list.length) {   // 空狀態＝設計系統 .codex-empty（給下一步 CTA，非只寫「無資料」）
      box.innerHTML = `<div class="codex-empty">
        <div class="codex-empty__icon" aria-hidden="true">📋</div>
        <div>清單是空的 — 到「<b>配方求解</b>」瀏覽表按每列的「<b>＋</b>」，或選配方後按「<b>📋 加入清單</b>」收集配方。</div>
        <button class="cl-empty-cta codex-btn codex-btn--ghost" type="button">前往配方瀏覽 →</button>
      </div>`;
      const cta = box.querySelector('.cl-empty-cta');
      if (cta) cta.onclick = () => { deps.showPicker(); deps.switchTab('solve', true); }; // 先 showPicker 確保落在瀏覽表（非殘留的配方詳情）+ 移焦
      return;
    }
    const totalRuns = list.reduce((s, e) => s + e.qty, 0);   // 總製作次數（≠配方種數；語意分清）
    const rows = list.map((e) => {
      const r = byId.get(e.id);
      const it = ITEMS[String(r.item_id)] || {};
      const ico = it.icon ? `<img class="cl-ico" src="${iconUrl(it.icon)}" alt="" loading="lazy">` : '<span class="cl-ico" aria-hidden="true"></span>';
      // 成品產量放進左邊資訊列（不進動作群）→ 動作群 [前往求解][行情][次數][✕] 各列等寬、右側按鈕垂直對齊
      const yields = (r.item_amount || 1) > 1 ? ` · 成品 ×${e.qty * r.item_amount}` : '';
      // 配方成品 → marketboard #/craft（BOM 樹/利潤）；只在有 item_id 時出（防壞連結）
      const mb = r.item_id ? `<a class="cl-mb codex-btn codex-btn--ghost" href="${deps.mbCraft(r.item_id)}" target="ffxiv-marketboard" data-help="到市場板看材料樹｜各材料價｜利潤試算。共用同一分頁。">💰 行情</a>` : '';
      return `<div class="cl-row" data-id="${r.id}">
        ${ico}
        <div class="cl-info"><span class="cl-name">${esc(r.item_name)}</span><span class="cl-sub codex-small">${esc(r.job)} · rlv ${r.rlv}${yields}</span></div>
        <div class="cl-actions">
          <button class="cl-go codex-btn codex-btn--ghost" type="button" data-help="選定此配方並切到求解分頁">前往求解 →</button>
          ${mb}
          <span class="cl-qty codex-small">次數 <input class="cl-qty-in codex-input" type="number" min="${QTY_MIN}" max="${QTY_MAX}" inputmode="numeric" value="${e.qty}" aria-label="「${esc(r.item_name)}」製作次數"></span>
          ${delBtn(r.item_name)}
        </div>
      </div>`;
    }).join('');
    // 素材依「玩家接下來要做的事」分三組（原本一坨網格，Owner 2026-08-19：太陽春）：
    //   ⚒ 可自製 → 它自己也有配方，給「加進清單」入口（要做幾次已經算好）
    //   🛒 採集／購買 → 商人有賣的直接掛徽章（沿用職業任務分頁那支 vendorHtml，不另寫一份）
    //   💠 晶體 → 恆殿後，對齊遊戲 BOM 呈現
    // 分組只影響呈現：純文字複製與市場板交棒仍涵蓋全部素材。
    const mats = aggregateMats(list, deps.INGREDIENTS).map(([iid, total]) => {
      const it = ITEMS[String(iid)] || {};
      const name = it.name || ('#' + iid);
      const crystal = isCrystal(iid, name);
      // 晶體既做不出來也沒有商人 → 不查配方（免在晶體列冒出「加進清單」的假入口）
      const child = crystal ? null : deps.pickRecipeForItem(iid);
      // **往下傳的是「做幾次」不是「要幾個」**：一次產 3 個時要 4 個只需做 2 次（同 app-recipe「先做這個」的 times 鐵則）
      const times = child ? Math.ceil(total / Math.max(1, Number(child.item_amount) || 1)) : 0;
      return { iid, total, name, icon: it.icon || null, crystal, child, times };
    });
    const GROUPS = [
      { title: '⚒ 可自製中間材', pick: (m) => !m.crystal && !!m.child,
        hint: '這些素材本身也有配方 — 按「加進清單」會把它排進上面的配方清單，次數已按產量算好' },
      { title: '🛒 採集／購買', pick: (m) => !m.crystal && !m.child,
        hint: '做不出來的東西 — NPC 商人有賣的會標出價格，其餘靠採集或市場板' },
      { title: '💠 晶體', pick: (m) => m.crystal, hint: '以太之光兌換或上市場板買' },
    ];
    const matRow = (m) => {
      const ico = m.icon ? `<img class="cl-mat-ico" src="${iconUrl(m.icon)}" alt="" loading="lazy">` : '<span class="cl-mat-ico" aria-hidden="true"></span>';
      // 素材名 → marketboard #/item（查價/來源）；晶體/水晶/晶簇亦可上市場板交易，故一律連（m.crystal 僅用於分組殿後）
      const nameHtml = `<a class="cl-mat-name cl-mat-name--link" href="${deps.mbItem(m.iid)}" target="ffxiv-marketboard" data-help="到市場板查「${esc(m.name)}」的價格與來源。共用同一分頁。">${esc(m.name)}</a>`;
      // 商人徽章沿用職業任務分頁的 vendorHtml（不另寫一份）；needHq 不傳＝未知——
      // 製造清單這一層沒有 HQ 要求的概念（要不要 HQ 素材是在配方詳情逐項指定）
      const vendor = m.crystal ? '' : deps.vendorHtml(m.iid);
      // 「加進清單」＝列級重複性動作（設計系統 §按鈕選型 列級豁免）→ ghost，不參賽 primary
      const go = m.child
        ? `<button type="button" class="codex-btn codex-btn--ghost cl-mat-go" data-rid="${m.child.id}" data-times="${m.times}"` +
          ` data-help="把「${esc(m.name)}」的配方加進上面的製造清單（${esc(m.child.job)}，要做 ${m.times} 次）">⚒ 加進清單${m.times > 1 ? ' ×' + m.times : ''}</button>`
        : '';
      return `<div class="cl-mat">${ico}${nameHtml}<span class="cl-mat-amt">×${m.total}</span>${vendor}${go}</div>`;
    };
    const ordered = GROUPS.flatMap((g) => mats.filter(g.pick));   // 純文字複製與計數沿用同一個分組順序
    const matRows = GROUPS.map((g) => {
      const rows = mats.filter(g.pick);
      if (!rows.length) return '';   // 空組整段不出（不留一個寫著「0 種」的空標題）
      return `<div class="cl-matgroup">
        <div class="cl-matgroup__head"><h4 class="codex-h4">${g.title} <span class="cl-matgroup__n codex-small">${rows.length} 種</span></h4>` +
        `<span class="cl-matgroup__hint codex-small">${g.hint}</span></div>
        <div class="cl-mats crafter-well">${rows.map(matRow).join('')}</div>
      </div>`;
    }).join('');
    const matTotal = ordered.reduce((n, m) => n + m.total, 0);
    const matText = ordered.map((m) => `${m.name} ×${m.total}`).join('\n');   // 純文字採買清單（每行「名稱 ×數量」，貼遊戲/記事本）
    const copyBtn = ordered.length
      ? `<button class="cl-copy-mats codex-btn codex-btn--ghost" type="button" data-help="複製素材總需求為純文字。每行「名稱 ×數量」，可貼進遊戲或記事本。">📋 複製清單</button>`
      : '';
    const shoplist = buildShoplistCsv(list, byId);
    const shopBtn = shoplist.count
      ? `<button class="cl-shoplist codex-btn codex-btn--ghost" type="button" data-help="把成品數量交棒到市場板採購清單">🛒 在市場板開採購清單</button>`
      : '';
    // 上下兩張獨立卡片：配方清單卡 / 素材總需求卡（Owner：兩者不要混在一起、上下分開）
    box.innerHTML = `
      <section class="codex-tint-panel codex-tint-panel--neutral cl-card">
        <div class="cl-card-head">
          <h3 class="codex-h3">配方清單</h3>
          <span class="cl-count codex-small">${list.length} 種 · 製作 ${totalRuns} 次</span>
        </div>
        <div class="cl-rows crafter-well">${rows}</div>
      </section>
      <section class="codex-tint-panel codex-tint-panel--neutral cl-card">
        <div class="cl-card-head">
          <h3 class="codex-h3">素材總需求</h3>
          <span class="cl-count codex-small">${ordered.length} 種 · 合計 ${matTotal} 個</span>
          <div class="cl-card-actions">${copyBtn}${shopBtn}</div>
        </div>
        ${matRows || '<span class="codex-small">（無素材資料）</span>'}
      </section>`;
    const cm = box.querySelector('.cl-copy-mats');
    if (cm) cm.onclick = () => deps.copyText(matText, '✓ 已複製素材清單', '素材清單');
    box.querySelectorAll('.cl-mat-go').forEach((b) => { b.onclick = () => addRuns(+b.dataset.rid, +b.dataset.times); });
    const sb = box.querySelector('.cl-shoplist');
    if (sb) sb.onclick = () => {
      const result = buildShoplistCsv(list, byId);
      if (result.error === SHOPLIST_TOO_LARGE) {   // C2：超限（種類/單項/長度）與「無可交棒」分型，不再一律謊報「過大」
        deps.toast('成品種類或數量過多，無法一次交棒（上限 100 種 / 單項 9999 件）', 'warn');
        return;
      }
      if (!result.csv) {   // 空清單 / 全數缺 item_id → 無可交棒成品
        deps.toast('清單沒有可交棒到市場板的成品', 'warn');
        return;
      }
      if (result.invalidCount > 0) {   // C1：有成品缺市場資料被略過 → 誠實提示，不當整份成功
        deps.toast(`有 ${result.invalidCount} 項無市場資料、已略過`, 'warn');
      }
      const url = `${deps.MARKETBOARD_BASE}#/shoplist?add=${result.csv}&v=1&n=${Date.now()}`;
      const win = window.open(url, 'ffxiv-marketboard');   // C4：彈窗攔截守衛（回 null → 提示，不靜默失敗）
      if (!win) deps.toast('瀏覽器攔截了視窗，請允許彈出視窗後再試', 'warn');
    };
    box.querySelectorAll('.cl-row').forEach((row) => {
      const id = +row.dataset.id;
      row.querySelector('.cl-go').onclick = () => deps.goSolve(id);   // 前往求解（選定配方 + 切求解分頁 + 帶 fromList 旗標）
      row.querySelector('.cl-del').onclick = () => { list = list.filter((e) => e.id !== id); save(); render(); notify(); };
      row.querySelector('.cl-qty-in').addEventListener('change', (ev) => {   // change（非 input）：邊打字不重繪、失焦才彙總
        const e = list.find((x) => x.id === id);
        if (e) { e.qty = clampQty(ev.target.value); ev.target.value = e.qty; save(); render(); notify(); }
      });
    });
  }

  globalThis.CraftList = {
    init(d) { deps = d; byId = new Map(d.RECIPES.map((r) => [r.id, r])); load(); render(); },
    add,
    has: (id) => list.some((e) => e.id === +id),                              // 配方表「已加入」標示查詢
    count: (id) => { const e = list.find((x) => x.id === +id); return e ? e.qty : 0; },  // 0＝未加入
    addRuns,
    removeOne,
    aggregateMats,
    buildShoplistCsv,
  };
})();

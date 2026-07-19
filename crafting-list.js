// crafting-list.js — 製造清單分頁：配方＋數量收集、素材總需求彙總、localStorage 持久化。
// classic script（無 module 語法）：發佈 globalThis.CraftList，app.js init 時注入依賴——
// 同 tools/test-formulas.mjs 的 vm 載入手法可直接測 aggregateMats/buildShoplistCsv 純函式。
(function () {
  const KEY = 'ffxiv-crafter-craftlist-v1';
  const QTY_MIN = 1, QTY_MAX = 999;
  const SHOPLIST_MAX_TYPES = 100, SHOPLIST_MAX_QTY = 9999, SHOPLIST_MAX_CSV = 1800;
  const SHOPLIST_TOO_LARGE = 'shoplist-over-limit';
  let deps = null;      // app.js 注入：{ $, esc, iconUrl, RECIPES, ITEMS, INGREDIENTS, selectRecipe, switchTab, toast }
  let byId = new Map(); // recipe id → recipe
  let list = [];        // [{ id, qty }]（qty＝製作次數）

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
    catch (e) { console.warn('[crafter] 製造清單儲存失敗（可能是無痕模式）:', e); }
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

  const isCrystal = (iid, name) => iid < 20 || /晶簇|水晶|碎晶/.test(name || '');

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
        <div>清單是空的 — 到「<b>配方求解</b>」瀏覽表按每列的「<b>＋</b>」，或選配方後按「<b>📋 加入製造清單</b>」收集配方。</div>
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
      const mb = r.item_id ? `<a class="cl-mb codex-btn codex-btn--ghost" href="${deps.mbCraft(r.item_id)}" target="ffxiv-marketboard" title="到市場板看材料樹 / 各材料價 / 利潤（共用同一分頁）">💰 行情</a>` : '';
      return `<div class="cl-row" data-id="${r.id}">
        ${ico}
        <div class="cl-info"><span class="cl-name">${esc(r.item_name)}</span><span class="cl-sub codex-small">${esc(r.job)} · rlv ${r.rlv}${yields}</span></div>
        <div class="cl-actions">
          <button class="cl-go codex-btn codex-btn--ghost" type="button" title="選定此配方並切到求解分頁">前往求解 →</button>
          ${mb}
          <span class="cl-qty codex-small">次數 <input class="cl-qty-in codex-input" type="number" min="${QTY_MIN}" max="${QTY_MAX}" inputmode="numeric" value="${e.qty}" aria-label="「${esc(r.item_name)}」製作次數"></span>
          <button class="cl-del codex-btn codex-btn--ghost codex-btn--icon" type="button" aria-label="從清單移除「${esc(r.item_name)}」">✕</button>
        </div>
      </div>`;
    }).join('');
    const mats = aggregateMats(list, deps.INGREDIENTS).map(([iid, total]) => {
      const it = ITEMS[String(iid)] || {};
      const name = it.name || ('#' + iid);
      return { iid, total, name, icon: it.icon || null, crystal: isCrystal(iid, name) };
    });
    const ordered = [...mats.filter((m) => !m.crystal), ...mats.filter((m) => m.crystal)]; // 晶體殿後，對齊遊戲 BOM 呈現
    const matRows = ordered.map((m) => {
      const ico = m.icon ? `<img class="cl-mat-ico" src="${iconUrl(m.icon)}" alt="" loading="lazy">` : '<span class="cl-mat-ico" aria-hidden="true"></span>';
      // 素材名 → marketboard #/item（查價/來源）；晶體/水晶/晶簇亦可上市場板交易，故一律連（m.crystal 僅用於排序殿後）
      const nameHtml = `<a class="cl-mat-name cl-mat-name--link" href="${deps.mbItem(m.iid)}" target="ffxiv-marketboard" title="到市場板查「${esc(m.name)}」價格與來源（共用同一分頁）">${esc(m.name)}</a>`;
      return `<div class="cl-mat">${ico}${nameHtml}<span class="cl-mat-amt">×${m.total}</span></div>`;
    }).join('');
    const matText = ordered.map((m) => `${m.name} ×${m.total}`).join('\n');   // 純文字採買清單（每行「名稱 ×數量」，貼遊戲/記事本）
    const copyBtn = ordered.length
      ? `<button class="cl-copy-mats codex-btn codex-btn--ghost" type="button" title="複製素材總需求為純文字（每行「名稱 ×數量」，可貼進遊戲或記事本）">📋 複製清單</button>`
      : '';
    const shoplist = buildShoplistCsv(list, byId);
    const shopBtn = shoplist.count
      ? `<button class="cl-shoplist codex-btn codex-btn--ghost" type="button" title="把成品數量交棒到市場板採購清單">🛒 在市場板開採購清單</button>`
      : '';
    // 上下兩張獨立卡片：配方清單卡 / 素材總需求卡（Owner：兩者不要混在一起、上下分開）
    box.innerHTML = `
      <section class="cl-card">
        <div class="cl-card-head">
          <h3 class="codex-h3">配方清單</h3>
          <span class="cl-count codex-small">${list.length} 種 · 製作 ${totalRuns} 次</span>
        </div>
        <div class="cl-rows">${rows}</div>
      </section>
      <section class="cl-card">
        <div class="cl-card-head">
          <h3 class="codex-h3">素材總需求</h3>
          <div class="cl-card-actions">${copyBtn}${shopBtn}</div>
        </div>
        <div class="cl-mats">${matRows || '<span class="codex-small">（無素材資料）</span>'}</div>
      </section>`;
    const cm = box.querySelector('.cl-copy-mats');
    if (cm) cm.onclick = () => deps.copyText(matText, '✓ 已複製素材清單');
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
    aggregateMats,
    buildShoplistCsv,
  };
})();

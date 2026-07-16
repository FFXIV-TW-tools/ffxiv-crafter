// crafting-list.js — 製造清單分頁：配方＋數量收集、素材總需求彙總、localStorage 持久化。
// classic script（無 module 語法）：發佈 globalThis.CraftList，app.js init 時注入依賴——
// 同 tools/test-formulas.mjs 的 vm 載入手法可直接測 aggregateMats 純函式。
(function () {
  const KEY = 'ffxiv-crafter-craftlist-v1';
  const QTY_MIN = 1, QTY_MAX = 999;
  let deps = null;      // app.js 注入：{ $, esc, iconUrl, RECIPES, ITEMS, INGREDIENTS, selectRecipe, switchTab, toast }
  let byId = new Map(); // recipe id → recipe
  let list = [];        // [{ id, qty }]（qty＝製作次數）

  const clampQty = (q) => Math.max(QTY_MIN, Math.min(QTY_MAX, Math.floor(+q) || QTY_MIN));

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
    const found = list.find((e) => e.id === +recipeId);
    if (found) found.qty = clampQty(found.qty + 1);
    else list.push({ id: +recipeId, qty: 1 });
    save(); render();
    deps.toast(found ? '✓ 已在清單，數量 +1' : '✓ 已加入製造清單', 'ok');
  }

  const isCrystal = (iid, name) => iid < 20 || /晶簇|水晶|碎晶/.test(name || '');

  function renderTabCount() {
    const tab = document.querySelector('.tab[data-tab="list"]');
    if (tab) tab.textContent = `📋 製造清單${list.length ? `（${list.length}）` : ''}`;
  }

  function render() {
    renderTabCount();
    const { $, esc, iconUrl, ITEMS } = deps;
    const box = $('craft-list');
    if (!list.length) {
      box.innerHTML = '<p class="cl-empty codex-body">清單是空的 — 到「配方求解」選好配方後，按配方詳情的「📋 加入製造清單」。</p>';
      return;
    }
    const rows = list.map((e) => {
      const r = byId.get(e.id);
      const it = ITEMS[String(r.item_id)] || {};
      const ico = it.icon ? `<img class="cl-ico" src="${iconUrl(it.icon)}" alt="" loading="lazy">` : '<span class="cl-ico" aria-hidden="true"></span>';
      const yields = (r.item_amount || 1) > 1 ? `<span class="codex-small">成品 ×${e.qty * r.item_amount}</span>` : '';
      return `<div class="cl-row" data-id="${r.id}">${ico}
        <button class="cl-name-btn" type="button" title="回配方求解">${esc(r.item_name)} <span class="codex-small">${esc(r.job)} · rlv ${r.rlv}</span></button>
        <span class="cl-qty codex-small">次數 <input class="cl-qty-in codex-input" type="number" min="${QTY_MIN}" max="${QTY_MAX}" inputmode="numeric" value="${e.qty}" aria-label="製作次數"></span>${yields}
        <button class="cl-del codex-btn codex-btn--ghost codex-btn--icon" type="button" aria-label="移除">✕</button>
      </div>`;
    }).join('');
    const mats = aggregateMats(list, deps.INGREDIENTS).map(([iid, total]) => {
      const it = ITEMS[String(iid)] || {};
      return { iid, total, name: it.name || ('#' + iid), icon: it.icon || null };
    });
    const ordered = [...mats.filter((m) => !isCrystal(m.iid, m.name)), ...mats.filter((m) => isCrystal(m.iid, m.name))]; // 晶體殿後，對齊遊戲 BOM 呈現
    const matRows = ordered.map((m) => `<div class="cl-mat">${m.icon ? `<img class="cl-mat-ico" src="${iconUrl(m.icon)}" alt="" loading="lazy">` : '<span class="cl-mat-ico" aria-hidden="true"></span>'}<span class="cl-mat-name">${esc(m.name)}</span><span class="cl-mat-amt">×${m.total}</span></div>`).join('');
    box.innerHTML = `<div class="cl-rows">${rows}</div>
      <h3 class="codex-h3 cl-mats-title">素材總需求</h3>
      <div class="cl-mats">${matRows || '<span class="codex-small">（無素材資料）</span>'}</div>`;
    box.querySelectorAll('.cl-row').forEach((row) => {
      const id = +row.dataset.id;
      row.querySelector('.cl-name-btn').onclick = () => { deps.selectRecipe(id); deps.switchTab('solve'); };
      row.querySelector('.cl-del').onclick = () => { list = list.filter((e) => e.id !== id); save(); render(); };
      row.querySelector('.cl-qty-in').addEventListener('change', (ev) => {   // change（非 input）：邊打字不重繪、失焦才彙總
        const e = list.find((x) => x.id === id);
        if (e) { e.qty = clampQty(ev.target.value); ev.target.value = e.qty; save(); render(); }
      });
    });
  }

  globalThis.CraftList = {
    init(d) { deps = d; byId = new Map(d.RECIPES.map((r) => [r.id, r])); load(); render(); },
    add,
    aggregateMats,
  };
})();

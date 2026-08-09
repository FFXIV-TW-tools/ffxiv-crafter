// app-consumable.js — 食物 / 藥水 選擇層（classic script，發佈 globalThis.CraftConsumable）。
// 為什麼不是原生 <select>：需求要在選項列裡顯示 icon + 物品品級 + 功效（+CP 21%（≤76）），
// <option> 只能放純文字 → 自建 listbox（ARIA combobox 按鈕 + role=listbox）。
// 同時負責這一區的本地保存（食物/藥水/HQ/展開狀態），重開瀏覽器不遺失。
// 專家之證不在這裡：它是「角色狀態」而非消耗品，且每職一份（上限 3）→ 住 app-gear.js 的 gearsets。
(function () {
  const KEY = 'ffxiv-crafter-consumables-v1';
  const KINDS = { food: { hqId: 'food-hq', btnId: 'food-btn', menuId: 'food-menu', label: '食物' },
                  potion: { hqId: 'potion-hq', btnId: 'potion-btn', menuId: 'potion-menu', label: '藥水' } };
  let deps = null;
  const MAP = { food: {}, potion: {} };          // 繁中名 → { nq, hq }
  const state = { food: '', potion: '', foodHq: true, potionHq: true, open: true };
  let openKind = null;                            // 目前展開的選單（同時只一個）
  let saveWarned = false;

  // ---------- 保存 ----------
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && typeof raw === 'object') {
        for (const k of ['food', 'potion']) if (typeof raw[k] === 'string') state[k] = raw[k];
        for (const k of ['foodHq', 'potionHq', 'open']) if (typeof raw[k] === 'boolean') state[k] = raw[k];
      }
    } catch (e) { console.warn('[crafter] 食藥設定讀取失敗，用預設值:', e); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) {
      console.warn('[crafter] 食藥設定儲存失敗（可能是無痕模式）:', e);
      if (!saveWarned) { saveWarned = true; deps.toast('無法保存食物/藥水設定（可能是無痕/私密模式），重整後會遺失', 'warn'); }
    }
  }

  // ---------- 資料 ----------
  // 無作業/加工/CP 加成的品項對求解無意義 → 不進選單（沿用原 buildConsumables 行為）
  function build(arr) {
    const m = {};
    for (const e of arr || []) {
      if (!e.cm && !e.ct && !e.cp) continue;
      (m[e.name] = m[e.name] || {})[e.is_hq ? 'hq' : 'nq'] = e;
    }
    return m;
  }
  const entryOf = (kind, name, hq) => {
    const p = MAP[kind][name];
    if (!p) return null;
    return (hq && p.hq) ? p.hq : (p.nq || p.hq);
  };
  const isHq = (kind) => !!(deps && deps.$(KINDS[kind].hqId).checked);
  const ilvOf = (kind, name) => { const p = MAP[kind][name] || {}; return ((p.hq || p.nq) || {}).level || 0; };
  // 功效文字：只列有值的項，百分比後附上限（遊戲的加成有硬上限，兩者一起看才選得出高品級的意義）
  function effText(e) {
    const parts = [];
    const one = (label, pct, cap) => { if (pct) parts.push(`${label} +${pct}%` + (cap ? `（≤${cap}）` : '')); };
    one('作業', e.cm, e.cm_max); one('加工', e.ct, e.ct_max); one('CP', e.cp, e.cp_max);
    return parts.join('・');
  }

  // ---------- 繪製 ----------
  // 選單順序＝品級高在前（玩家幾乎總是選當前版本的高品級），同品級按名穩定排序
  const names = (kind) => Object.keys(MAP[kind]).sort((a, b) => (ilvOf(kind, b) - ilvOf(kind, a)) || (a < b ? -1 : 1));
  function optionsHtml(kind) {
    const { esc, iconUrl } = deps;
    const hq = isHq(kind);
    const cur = state[kind];
    const rows = names(kind).map(n => {
      const e = entryOf(kind, n, hq) || {};
      const ico = e.icon ? `<img class="crafter-cons__ico" src="${iconUrl(e.icon)}" alt="" loading="lazy">` : '<span class="crafter-cons__ico"></span>';
      return `<li class="crafter-cons__opt${n === cur ? ' is-sel' : ''}" role="option" tabindex="-1" data-name="${esc(n)}" aria-selected="${n === cur ? 'true' : 'false'}">` +
        ico +
        `<span class="crafter-cons__body"><span class="crafter-cons__name">${esc(n)}</span>` +
        `<span class="crafter-cons__eff codex-small">${esc(effText(e))}</span></span>` +
        `<span class="crafter-cons__ilv codex-xs">品級 ${e.level || 0}</span></li>`;
    }).join('');
    return `<li class="crafter-cons__opt${cur ? '' : ' is-sel'}" role="option" tabindex="-1" data-name="" aria-selected="${cur ? 'false' : 'true'}">` +
      '<span class="crafter-cons__ico"></span><span class="crafter-cons__body"><span class="crafter-cons__name">無</span></span></li>' + rows;
  }
  function renderButton(kind) {
    const { $, esc, iconUrl } = deps;
    const btn = $(KINDS[kind].btnId);
    const name = state[kind];
    const e = name ? entryOf(kind, name, isHq(kind)) : null;
    btn.innerHTML = e
      ? `${e.icon ? `<img class="crafter-cons__ico" src="${iconUrl(e.icon)}" alt="">` : ''}` +
        `<span class="crafter-cons__btn-name">${esc(name)}</span>` +
        `<span class="crafter-cons__btn-eff codex-xs">${esc(effText(e))}</span>`
      : '<span class="crafter-cons__btn-name crafter-cons__btn-name--none">無</span>';
    btn.setAttribute('aria-label', KINDS[kind].label + '：' + (name || '無'));
  }
  function renderMenu(kind) {
    const menu = deps.$(KINDS[kind].menuId);
    menu.innerHTML = optionsHtml(kind);
  }

  // ---------- 開關 / 鍵盤 ----------
  function closeMenu(refocus) {
    if (!openKind) return;
    const k = openKind; openKind = null;
    deps.$(KINDS[k].menuId).hidden = true;
    deps.$(KINDS[k].btnId).setAttribute('aria-expanded', 'false');
    if (refocus) deps.$(KINDS[k].btnId).focus();
  }
  function openMenu(kind) {
    if (openKind && openKind !== kind) closeMenu(false);
    renderMenu(kind);
    const menu = deps.$(KINDS[kind].menuId);
    menu.hidden = false;
    deps.$(KINDS[kind].btnId).setAttribute('aria-expanded', 'true');
    openKind = kind;
    const sel = menu.querySelector('.crafter-cons__opt.is-sel') || menu.querySelector('.crafter-cons__opt');
    if (sel) { sel.scrollIntoView({ block: 'nearest' }); sel.focus(); }
  }
  function pick(kind, name) {
    state[kind] = name;
    save();
    renderButton(kind);
    closeMenu(true);
    deps.onChange();
  }
  function onMenuKey(kind, e) {
    const menu = deps.$(KINDS[kind].menuId);
    const opts = [...menu.querySelectorAll('.crafter-cons__opt')];
    const i = opts.indexOf(e.target.closest('.crafter-cons__opt'));
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (i >= 0) pick(kind, opts[i].dataset.name); return; }
    let j = null;
    if (e.key === 'ArrowDown') j = Math.min(opts.length - 1, i + 1);
    else if (e.key === 'ArrowUp') j = Math.max(0, i - 1);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = opts.length - 1;
    else if (e.key === 'Tab') { closeMenu(false); return; }
    if (j == null) return;
    e.preventDefault();
    opts[j].focus(); opts[j].scrollIntoView({ block: 'nearest' });
  }

  // ---------- init ----------
  function init(d) {
    for (const k of ['$', 'esc', 'iconUrl', 'toast', 'onChange']) {
      if (typeof (d || {})[k] !== 'function') throw new Error('CraftConsumable.init 缺依賴：' + k);
    }
    deps = d;
    load();
    const { $ } = deps;
    $('food-hq').checked = state.foodHq;
    $('potion-hq').checked = state.potionHq;
    const block = $('consumable-block');
    if (block) {
      block.open = state.open;
      block.addEventListener('toggle', () => { state.open = block.open; save(); });
    }
    for (const kind of Object.keys(KINDS)) {
      const btn = $(KINDS[kind].btnId), menu = $(KINDS[kind].menuId);
      btn.addEventListener('click', () => { if (openKind === kind) closeMenu(true); else openMenu(kind); });
      // 只接 ↑↓ 開啟：Enter/Space 交給瀏覽器原生的按鈕啟動（會走上面的 click → 開關切換）。
      // 這裡若也處理 Enter/Space，會與隨後的原生 click 疊成「開了又關」（2026-07-28 實測到的 bug）。
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openMenu(kind); }
      });
      menu.addEventListener('click', (e) => {
        const opt = e.target.closest('.crafter-cons__opt');
        if (opt) pick(kind, opt.dataset.name);
      });
      menu.addEventListener('keydown', (e) => onMenuKey(kind, e));
      $(KINDS[kind].hqId).addEventListener('change', () => {
        state[kind === 'food' ? 'foodHq' : 'potionHq'] = isHq(kind);
        save();
        renderButton(kind);
        if (openKind === kind) renderMenu(kind);   // 開著時同步選項顯示的 HQ 數值
      });
    }
    document.addEventListener('click', (e) => {           // 點外部收合（點在自己的按鈕/選單上不收）
      if (!openKind) return;
      if (e.target.closest('#' + KINDS[openKind].menuId) || e.target.closest('#' + KINDS[openKind].btnId)) return;
      closeMenu(false);
    });
  }
  // 資料就緒後呼叫：建對照表 + 清掉已不存在的保存值（資料改版後不留幽靈選擇）
  function setData(meals, medicine) {
    MAP.food = build(meals); MAP.potion = build(medicine);
    for (const kind of Object.keys(KINDS)) {
      if (state[kind] && !MAP[kind][state[kind]]) state[kind] = '';
      renderButton(kind);
    }
  }

  globalThis.CraftConsumable = {
    init, setData, build, effText, names,
    get: (kind) => (state[kind] ? entryOf(kind, state[kind], isHq(kind)) : null),
    label: (kind) => state[kind] || '',
  };
})();

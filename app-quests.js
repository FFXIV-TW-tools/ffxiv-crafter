// app-quests.js — 職業任務分頁（classic script，發佈 globalThis.CraftQuests）。
// 「這個職業練上去要交哪些東西、還缺什麼」：11 職（8 製作＋3 採集）的職業任務清單、
// 完成勾選（本機保存）、以及**未完成任務**的素材彙總。
// 資料＝data/job-quests.json（tools/build-data.py 從台服解包 Quest.Script{Instruction}=RITEM 解出）。
//
// ⚠ **交付數量（item.qty）可能是 null**：解包沒有權威欄位（CountableNum 全是 255 哨兵值），
//    數量來自社群試算表、且只在物品名完全相同時才採用（見 tools/build-data.py）。
//    對不上的一律以 1 份估算並**在畫面上標明「數量未知」**，彙總區也要寫出有幾件是估的
//    —— 靜默按 1 算會讓採購量整批偏掉，而畫面完全正常＝零回饋訊號。
(function () {
  const KEY = 'ffxiv-crafter-quests-v1';
  const MAX_DEPTH = 12;          // 配方樹遞迴上限（真實深度 ≤5；這是資料出環時的煞車，不是業務規則）
  let deps = null;
  let DATA = [];                 // [{ job, role, iconId, quests: [{id, lv, name, items:[{id,name,icon,recipe,qty}] }] }]
  // 交付物（尤其採集職的魚）不一定在 items.json 裡（那份只收配方相關物品）→ 用本資料自帶的名稱/圖補上，
  // 否則素材彙總會出現「#4874」這種只有 id 的列。
  const NAME_BY_ID = new Map();
  // item id → { shop:1, loc?, npc?, price? }：`shop` 來自解包 is_gil_shop（權威、全覆蓋），
  // loc/npc/price 來自社群試算表（部分覆蓋）→ 說明文字要標明哪一半是社群資料。
  let VENDORS = {};
  const state = { job: '', done: [], hideDone: false };
  let doneSet = new Set();
  let saveWarned = false;

  // ---------- 保存 ----------
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && typeof raw === 'object') {
        if (typeof raw.job === 'string') state.job = raw.job;
        if (typeof raw.hideDone === 'boolean') state.hideDone = raw.hideDone;
        // 只收數字 id：保存值被竄改成別的型別時退回空清單，不硬套（同求解選項的作法）
        if (Array.isArray(raw.done)) state.done = raw.done.filter((n) => Number.isSafeInteger(n));
      }
    } catch (e) { console.warn('[crafter] 職業任務設定讀取失敗，用預設值:', e); }
    doneSet = new Set(state.done);
  }
  function save() {
    state.done = [...doneSet];
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) {
      console.warn('[crafter] 職業任務設定儲存失敗（可能是無痕模式）:', e);
      if (!saveWarned) { saveWarned = true; deps.toast('無法保存職業任務進度（可能是無痕/私密模式），重整後會遺失', 'warn'); }
    }
  }

  // ---------- 純函式：素材展開（golden 測試面）----------
  // items＝該職未完成任務的所有交付物 [{id, recipe, qty}]；qty 為 null（數量未知）時以 1 份估算。
  // 回 { base, inter }：base＝**要去買/採的底層素材**（沒有配方的東西），inter＝過程中要先做出來的中間材。
  // 配方一次產 n 個 → 需要 m 個要做 ceil(m/n) 次，素材依「做幾次」乘 —— 不是依「要幾個」。
  function expandMats(items, ctx) {
    const base = new Map(), inter = new Map();
    const recipeById = ctx.recipesById || {};
    const recipeOfItem = ctx.recipeByItem || {};
    const ing = ctx.ingredients || {};
    const add = (m, id, n) => m.set(id, (m.get(id) || 0) + n);
    const walk = (itemId, need, depth, path) => {
      const rid = recipeOfItem[itemId];
      const recipe = rid != null ? recipeById[rid] : null;
      // 沒有配方 → 底層（買或採）。出環或過深也收成底層：寧可少展開一層，也不要無限遞迴或漏記需求。
      if (!recipe || depth >= MAX_DEPTH || path.has(itemId)) { add(base, itemId, need); return; }
      const per = Math.max(1, Number(recipe.item_amount) || 1);
      const runs = Math.ceil(need / per);
      if (depth > 0) add(inter, itemId, need);   // depth 0 是任務交付物本身，已在任務列顯示，不重複列進中間材
      const next = new Set(path); next.add(itemId);
      for (const [iid, amt] of (ing[String(recipe.id)] || [])) walk(Number(iid), Number(amt) * runs, depth + 1, next);
    };
    for (const it of items || []) walk(Number(it.id), Math.max(1, Number(it && it.qty) || 1), 0, new Set());
    const sorted = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);  // 需求多的在前，同量按 id 穩定排序
    return { base: sorted(base), inter: sorted(inter) };
  }

  // 目前職業的任務（依「只顯示未完成」過濾）與進度
  function view(jobEntry, done, hideDone) {
    const quests = (jobEntry && jobEntry.quests) || [];
    const doneCount = quests.filter((q) => done.has(q.id)).length;
    return {
      quests: hideDone ? quests.filter((q) => !done.has(q.id)) : quests,
      total: quests.length,
      doneCount,
      remaining: quests.filter((q) => !done.has(q.id)),
    };
  }

  // ---------- 繪製 ----------
  const current = () => DATA.find((j) => j.job === state.job) || DATA[0] || null;
  // icon_id → data 層的 v1 路徑（iconUrl 再轉 xivapi v2）：62108 → /i/062000/062108.png
  const pad6 = (n) => String(n).padStart(6, '0');
  const jobIcon = (iconId) => (iconId ? `/i/${pad6(Math.floor(iconId / 1000) * 1000)}/${pad6(iconId)}.png` : '');

  function renderChips() {
    const { $, esc, iconUrl } = deps;
    const cur = current();
    $('quest-jobs').innerHTML = DATA.map((j) => {
      const on = cur && j.job === cur.job;
      const ico = j.iconId ? `<img src="${iconUrl(jobIcon(j.iconId))}" alt="" loading="lazy">` : '';
      const left = j.quests.filter((q) => !doneSet.has(q.id)).length;
      return `<button type="button" class="codex-btn ${on ? 'codex-btn--primary' : 'codex-btn--ghost'} job-btn" data-job="${esc(j.job)}">` +
        `${ico}${esc(j.job)} <span class="codex-xs">${left ? left + ' 待辦' : '✓ 完成'}</span></button>`;
    }).join('');
    $('quest-jobs').querySelectorAll('.job-btn').forEach((b) => {
      b.onclick = () => { state.job = b.dataset.job; save(); render(); };
    });
  }

  function itemHtml(it) {
    const { esc, iconUrl, mbItem } = deps;
    const ico = it.icon ? `<img class="ing-ico" src="${iconUrl(it.icon)}" alt="" loading="lazy">` : '';
    // 來源：能做的直接給「求解手法」入口；不能做的（採集品／商店）連 marketboard 查價與來源
    const src = it.recipe != null
      ? `<button type="button" class="codex-btn codex-btn--ghost crafter-qt-go" data-recipe="${it.recipe}" data-help="用這個成品的配方去求解製作手法">⚒ 求解手法</button>`
      : `<a class="codex-btn codex-btn--ghost" href="${mbItem(it.id)}" target="ffxiv-marketboard" data-help="到市場板查價格與來源（採集點／商店）。共用同一分頁。">💰 查價／來源</a>`;
    const qty = it.qty
      ? `<b class="crafter-qt-item__qty">×${it.qty}</b>`
      : '<span class="crafter-qt-item__qty crafter-qt-item__qty--unknown codex-xs" data-help="遊戲資料裡沒有可信的數量欄位，社群資料也對不上這件物品的名稱｜彙總時以 1 份估算">數量未知</span>';
    const tag = it.recipe != null
      ? '<span class="codex-xs crafter-qt-tag">可製作</span>'
      : '<span class="codex-xs crafter-qt-tag crafter-qt-tag--gather">非製作</span>';
    // 要交 HQ 是「會不會白做一爐」等級的資訊 → 徽章寫出來，未知也照實標（不默默當成不用）
    const hq = it.hq === true
      ? '<span class="codex-xs crafter-qt-tag crafter-qt-tag--hq" data-help="這個任務要交 HQ（高品質）版本｜商人賣的 NQ 不能交，要自己做或採到 HQ">✦ 需 HQ</span>'
      : (it.hq == null
        ? '<span class="codex-xs crafter-qt-tag crafter-qt-tag--unknown" data-help="本站的資料來源沒有涵蓋這一筆，不確定是否要求 HQ｜交之前先看一下遊戲內的任務說明">HQ？</span>'
        : '');
    return `<div class="crafter-qt-item">${ico}<span class="crafter-qt-item__name">${esc(it.name)}</span>${qty}` +
      `<span class="crafter-qt-item__src">${hq}${tag}${vendorHtml(it.id, it.hq)}${src}</span></div>`;
  }

  function questsHtml(v) {
    const { esc } = deps;
    if (!v.quests.length) {
      return `<div class="codex-empty">${v.total && v.doneCount === v.total
        ? '🎉 這個職業的任務都標記完成了'
        : (state.hideDone ? '（未完成的都藏起來了 — 取消「只顯示未完成」看全部）' : '（沒有任務資料）')}</div>`;
    }
    return v.quests.map((q) => {
      const done = doneSet.has(q.id);
      return `<div class="crafter-qt-quest${done ? ' is-done' : ''}">` +
        `<label class="crafter-qt-quest__head"><input type="checkbox" class="crafter-qt-done" data-quest="${q.id}"${done ? ' checked' : ''} aria-label="標記「${esc(q.name)}」完成">` +
        `<span class="crafter-qt-lv">Lv ${q.lv}</span><span class="crafter-qt-name">${esc(q.name)}</span></label>` +
        `<div class="crafter-qt-items">${q.items.map(itemHtml).join('')}</div></div>`;
    }).join('');
  }

  function matsHtml(v) {
    const { esc, iconUrl, mbItem, getItems } = deps;
    const items = v.remaining.flatMap((q) => q.items);
    if (!items.length) return '<div class="codex-empty">（沒有未完成的任務 — 這裡會列出還要準備的素材）</div>';
    const { base, inter } = expandMats(items, {
      recipesById: deps.getRecipesById(), recipeByItem: deps.getRecipeByItem(), ingredients: deps.getIngredients(),
    });
    const ITEMS = getItems();
    const unknown = items.filter((it) => !it.qty).length;
    const row = ([iid, n]) => {
      const it = ITEMS[String(iid)] || NAME_BY_ID.get(iid) || {};
      const ico = it.icon ? `<img class="ing-ico" src="${iconUrl(it.icon)}" alt="" loading="lazy">` : '';
      return `<a class="crafter-qt-mat" href="${mbItem(iid)}" target="ffxiv-marketboard" data-help="到市場板查價格與來源。共用同一分頁。">` +
        `${ico}<span class="crafter-qt-mat__name">${esc(it.name || ('#' + iid))}</span>${vendorHtml(iid)}<b class="crafter-qt-mat__n">×${n}</b></a>`;
    };
    const note = unknown
      ? `<div class="crafter-qt-mats__note codex-small">⚠ 其中 <b>${unknown}</b> 件交付物的數量未知，已以「1 份」估算 — 實際可能更多，請自行加量。</div>`
      : '';
    return note + `<div class="crafter-qt-mats__group"><h4 class="codex-h4">要買／要採（底層素材）<span class="codex-small">${base.length} 種</span></h4>` +
      `<div class="crafter-qt-mats__grid">${base.map(row).join('') || '<span class="codex-small">（無）</span>'}</div></div>` +
      (inter.length
        ? `<div class="crafter-qt-mats__group"><h4 class="codex-h4">過程中要先做出來的<span class="codex-small">${inter.length} 種</span></h4>` +
          `<div class="crafter-qt-mats__grid">${inter.map(row).join('')}</div></div>`
        : '');
  }

  // 勾一個任務不重繪整份清單：`.crafter-qt-list` 有自己的捲軸，重寫 innerHTML 會把捲動位置彈回最上面
  // ——勾到第 15 個任務時等於每勾一次就要再捲一次下來。故只更新「會變的那三塊」。
  function refreshSummary() {
    const cur = current();
    if (!cur) return;
    const v = view(cur, doneSet, state.hideDone);
    renderChips();
    deps.$('quest-progress').innerHTML = `<b>${deps.esc(cur.job)}</b>　已完成 <b>${v.doneCount}</b> / ${v.total}`;
    deps.$('quest-mats').innerHTML = matsHtml(v);
  }

  function render() {
    const { $ } = deps;
    const body = $('quest-body');
    if (!body) return;                 // 分頁骨架不在（測試 sandbox / 部署不完整）→ 靜靜不畫，不炸掉整個 init
    const cur = current();
    if (!cur) { body.innerHTML = '<div class="codex-empty">（職業任務資料未載入）</div>'; return; }
    state.job = cur.job;
    $('quest-body').innerHTML = questsHtml(view(cur, doneSet, state.hideDone));
    refreshSummary();
    $('quest-body').querySelectorAll('.crafter-qt-done').forEach((c) => {
      c.onchange = () => {
        const id = Number(c.dataset.quest);
        if (c.checked) doneSet.add(id); else doneSet.delete(id);
        save();
        const card = c.closest('.crafter-qt-quest');
        if (card) {
          card.classList.toggle('is-done', c.checked);
          if (state.hideDone && c.checked) card.remove();   // 「只顯示未完成」模式：勾完就收走那一列
        }
        refreshSummary();
      };
    });
    $('quest-body').querySelectorAll('.crafter-qt-go').forEach((b) => {
      b.onclick = () => { if (deps.selectRecipe(Number(b.dataset.recipe))) deps.switchTab('solve', true); };
    });
  }

  // ---------- init / setData ----------
  const REQUIRED = ['$', 'esc', 'iconUrl', 'toast', 'mbItem', 'selectRecipe', 'switchTab',
    'getItems', 'getIngredients', 'getRecipesById', 'getRecipeByItem'];
  function init(d) {
    const miss = REQUIRED.filter((k) => d == null || d[k] == null);
    if (miss.length) throw new Error('CraftQuests.init 缺依賴: ' + miss.join(', '));
    deps = d;
    load();
    const hide = deps.$('quest-hide-done');
    if (hide) {
      hide.checked = state.hideDone;
      hide.addEventListener('change', () => { state.hideDone = hide.checked; save(); render(); });
    }
  }
  function setVendors(map) { VENDORS = (map && typeof map === 'object') ? map : {}; render(); }

  // 「這件東西買得到嗎、在哪買」：資料來自解包（gil_shop_npc → 價格＋販售 NPC 的名字/稱號/座標）。
  // ⚠ needHq：**商人賣的是 NQ**。任務要求 HQ 時說「商人有賣」等於叫人買一堆交不掉的東西
  //   （買了才發現不能交，而畫面上完全看不出來）→ 改成「只賣 NQ」並寫清楚要自己做。
  //   needHq 為 null＝本站不知道要不要 HQ，也要照實講，不能默默當成不用。
  function vendorHtml(itemId, needHq) {
    const v = VENDORS[String(itemId)];
    if (!v) return '';
    const price = v.price ? `${v.price} G` : '';
    // 一件東西常有十幾個通用商人 → 只寫前幾個帶座標的，其餘用「另有 N 處」帶過（不塞一長串）
    const where = (v.npcs || []).map((n) =>
      `${n.zone}${(n.x != null && n.y != null) ? ` (${n.x}, ${n.y})` : ''} ${n.npc}${n.title ? `〔${n.title}〕` : ''}`);
    if (v.more) where.push(`另有 ${v.more} 處`);
    const base = ['NPC 商人有賣', price, ...where].filter(Boolean).join('｜')
      + (where.length ? '' : '｜本站沒有這件的販售地點資料');
    if (needHq === true) {
      return `<span class="codex-xs crafter-qt-tag crafter-qt-tag--nq" data-help="${deps.esc(
        '這件任務要交 HQ，而商人賣的是 NQ — 買來的不能直接交，要自己做出 HQ（或採到 HQ）｜' + base)}">🏪 只賣 NQ</span>`;
    }
    const help = needHq == null
      ? base + '｜本站不確定這件是否要求 HQ；若任務要 HQ，買來的 NQ 不能交'
      : base;
    return `<span class="codex-xs crafter-qt-tag crafter-qt-tag--shop" data-help="${deps.esc(help)}">🏪 ${deps.esc(price || '商人有賣')}</span>`;
  }

  function setData(rows) {
    DATA = Array.isArray(rows) ? rows : [];
    NAME_BY_ID.clear();
    for (const j of DATA) for (const q of j.quests) for (const it of q.items) NAME_BY_ID.set(it.id, it);
    if (!DATA.some((j) => j.job === state.job)) state.job = (DATA[0] && DATA[0].job) || '';
    render();
  }

  globalThis.CraftQuests = { init, setData, setVendors, vendorHtml, expandMats, view };
})();

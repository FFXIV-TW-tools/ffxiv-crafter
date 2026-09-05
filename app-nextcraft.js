// app-nextcraft.js — 「用這個成品還能做什麼」：下一階配方的反查與選取視窗（classic script，發佈 globalThis.CraftNext）。
// 為什麼要這層：既有的「先做這個」只走得下去（成品 → 中間材）。玩家做完一批棕櫚糖後，
// 想知道「這東西還能拿去做什麼」時，站上唯一的路是自己回配方表逐個搜——而反查資料早就在
// ingredients.json 裡（配方 → 素材），倒過來建索引即可，不需要任何新資料檔。
// 為什麼是彈出視窗不是就地展開（Owner 2026-08-17 拍板）：實測 975 件成品有下一階配方，
// 消費者數中位 13、最多 234（綠金錠）⇒ 塞進配方詳情會把求解區推到天邊。
(function () {
  let deps = null;              // { $, esc, iconUrl, JOB_ICON, getItems, getIngredients, getRecipesById, gearOkFor, onPick }
  let index = null;             // itemId → [[recipeId, amount]]（用到該素材的配方）；資料載完後建一次
  let cur = null;               // 目前開著的視窗狀態 { itemId, rows }
  let releaseTrap = null;       // FFXIVA11y.trapFocus 的 release（**函式本身**，見設計系統 modal a11y 契約）
  let downOnOverlay = false;    // 遮罩關閉：這一發點擊是不是「按下」也在遮罩上（見 bind 內註解）
  let opener = null;            // 開窗的按鈕：CDN 缺席時由我方還焦

  // ---------- 反查索引（純函式，測試面）----------
  // ingredients: { recipeId: [[itemId, amount], ...] } → { itemId: [[recipeId, amount], ...] }
  function buildIndex(ingredients) {
    const rev = {};
    for (const [rid, list] of Object.entries(ingredients || {})) {
      for (const pair of list || []) {
        const iid = Number(pair[0]);
        if (!Number.isFinite(iid)) continue;
        (rev[iid] = rev[iid] || []).push([Number(rid), Number(pair[1]) || 1]);
      }
    }
    return rev;
  }

  /**
   * 「用 itemId 還能做什麼」——回傳去重、排序好的下一階清單（純函式，golden 測試面）。
   * ctx = { index, recipesById, items, gearOk }
   *
   * **一個成品只佔一列**：同一件東西常常好幾個職業都做得出來（特製酵母＝鍊金／烹調），
   * 一物多列會讓 31 筆看起來像 40 幾筆。挑法與詳情頁同一條規則（玩家有填數值的職業優先），
   * 選進去之後詳情頁本來就有職業切換鈕 ⇒ 這裡不必也不該把選擇攤開。
   * 排序：做得起的在前 → rlv 低的在前（先做得動的）→ 品名穩定排序。
   */
  function consumersOf(itemId, ctx) {
    const byId = ctx.recipesById || {}, items = ctx.items || {};
    const gearOk = ctx.gearOk || (() => false);
    const groups = new Map();   // 成品 item_id → [{ recipe, amount }]
    for (const [rid, amount] of (ctx.index || {})[Number(itemId)] || []) {
      const r = byId[rid];
      if (!r || r.item_id == null) continue;
      if (Number(r.item_id) === Number(itemId)) continue;   // 自己用到自己（資料出環）不列，點進去等於原地踏步
      const k = Number(r.item_id);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ recipe: r, amount });
    }
    const rows = [];
    for (const [iid, list] of groups) {
      const hit = list.find((e) => gearOk(e.recipe.job)) || list[0];
      rows.push({
        itemId: iid,
        name: hit.recipe.item_name || ('#' + iid),
        icon: (items[String(iid)] || {}).icon || null,
        recipeId: hit.recipe.id,
        job: hit.recipe.job,
        jobCount: new Set(list.map((e) => e.recipe.job)).size,   // 同職多張配方只算一職（健檢 R5 correctness-data A3）
        amount: hit.amount,                 // 這個配方做一次要用幾個當前成品
        rlv: Number(hit.recipe.rlv) || 0,
        ok: !!gearOk(hit.recipe.job),
      });
    }
    return rows.sort((a, b) => (b.ok - a.ok) || (a.rlv - b.rlv) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  function idx() { return index || (index = buildIndex(deps.getIngredients())); }
  function rowsFor(itemId) {
    return consumersOf(itemId, { index: idx(), recipesById: deps.getRecipesById(), items: deps.getItems(), gearOk: deps.gearOkFor });
  }
  function countFor(itemId) { return itemId == null ? 0 : rowsFor(itemId).length; }

  // ---------- 視窗 ----------
  function render() {
    const { $, esc, iconUrl } = deps;
    const q = ($('next-search').value || '').trim().toLowerCase();
    const job = $('next-job').value || '';
    const onlyMine = $('next-only-mine');
    let rows = cur.rows.filter((r) => (!q || r.name.toLowerCase().includes(q)) && (!job || r.job === job));
    // fail-safe：勾著「只顯示我能做的」卻一筆都不剩（玩家還沒填任何相關職業的數值）→ 自動放開並說明。
    // 不這樣做的話他看到的是空清單，而空清單讀起來像「這東西不能再往下做」——正好是相反的結論。
    let relaxed = '';
    if (onlyMine.checked) {
      const mine = rows.filter((r) => r.ok);
      if (mine.length) rows = mine;
      else if (rows.length) { onlyMine.checked = false; relaxed = '<div class="crafter-next-note codex-small">你填了數值的職業做不出這些 — 已改為顯示全部</div>'; }
    }
    $('next-count').textContent = `${rows.length} 項`;
    $('next-list').innerHTML = relaxed + (rows.length ? rows.map((r) => {
      const ico = r.icon ? `<img class="crafter-next-ico" src="${iconUrl(r.icon)}" alt="" loading="lazy">` : '<span class="crafter-next-ico"></span>';
      const jico = deps.JOB_ICON[r.job] ? `<img class="crafter-next-jico" src="${iconUrl(deps.JOB_ICON[r.job])}" alt="">` : '';
      const more = r.jobCount > 1 ? `<span class="codex-xs crafter-next-more">＋${r.jobCount - 1} 職</span>` : '';
      const no = r.ok ? '' : '<span class="codex-xs crafter-next-no">未填</span>';
      return `<button type="button" class="crafter-next-row" data-rid="${r.recipeId}"` +
        ` data-help="改做「${esc(r.name)}」（${esc(r.job)}）｜這個配方做一次要用 ${r.amount} 個${esc(cur.name)}">` +
        `${ico}<span class="crafter-next-name">${esc(r.name)}</span>` +
        `<span class="crafter-next-job">${jico}${esc(r.job)}${more}</span>` +
        `<span class="crafter-next-amt codex-small">用 ×${r.amount}</span>${no}</button>`;
    }).join('') : '<div class="codex-empty crafter-next-empty">沒有符合的配方 — 換個關鍵字或清掉篩選</div>');
    $('next-list').querySelectorAll('.crafter-next-row').forEach((b) => {
      b.onclick = () => { const rid = Number(b.dataset.rid); close(); deps.onPick(rid); };
    });
  }

  function open(itemId, name, openerEl) {
    const { $, esc } = deps;
    cur = { itemId: Number(itemId), name: String(name || ''), rows: rowsFor(itemId) };
    opener = openerEl || null;
    $('next-title').innerHTML = `用「${esc(cur.name)}」還能做什麼？`;
    // 職業選單由**這批資料**產生（不是全 DoH 列表）——列出做不出任何一筆的職業等於給死選項
    const jobs = [...new Set(cur.rows.map((r) => r.job))].sort();
    $('next-job').innerHTML = '<option value="">全部職業</option>' + jobs.map((j) => `<option value="${esc(j)}">${esc(j)}</option>`).join('');
    // 每次開窗都從乾淨的條件開始：上一個成品留下的關鍵字／職業會讓這次少列一大半，
    // 而畫面上只看得到「就這幾項」——讀起來像資料本身就這麼少。（重建 <option> 後 value 歸零是
    // 瀏覽器的隱含行為，不靠它，顯式清掉。）
    $('next-search').value = '';
    $('next-job').value = '';
    $('next-only-mine').checked = true;
    render();
    $('next-modal').hidden = false;
    document.body.style.overflow = 'hidden';   // 鎖背景捲動（設計系統：modal 開啟時）
    releaseTrap = window.FFXIVA11y && typeof window.FFXIVA11y.trapFocus === 'function'
      ? window.FFXIVA11y.trapFocus($('next-modal').querySelector('.codex-modal'))
      : null;
    if (!releaseTrap) $('next-search').focus();   // CDN 缺席的退場版：至少把焦點送進視窗（功能不消失）
  }

  function close() {
    const { $ } = deps;
    if ($('next-modal').hidden) return;
    $('next-modal').hidden = true;
    document.body.style.overflow = '';
    cur = null;
    if (releaseTrap) { releaseTrap(); releaseTrap = null; }   // release **函式本身**＝解除＋還焦 opener
    // 還焦保險：trapFocus 記的是「開窗當下的 activeElement」，開窗路徑若不是真的點在鈕上
    // （鍵盤 Enter 之外的程式化開窗）焦點會掉回 body ⇒ 鍵盤使用者得從頁首重新 Tab 一遍。
    if (opener && opener.focus && (!document.activeElement || document.activeElement === document.body)) opener.focus();
    opener = null;
  }

  function bind() {
    const { $ } = deps;
    $('next-close').onclick = close;
    // 點遮罩關閉——**必須 mousedown 也落在遮罩上**才算。只看 click 的話：開窗那一發點擊
    // 在按鈕上按下、放開時遮罩已經蓋在游標底下 ⇒ 該次 click 的 target 變成遮罩，視窗開了又立刻被關掉，
    // 玩家看到的是「按鈕沒反應」（2026-08-17 實測；程式化 .click() 不會重現，只有真的用滑鼠點才會）。
    // 同一條也順便修好「在視窗內按住拖曳選字、放開時滑到遮罩上」的誤關。
    $('next-modal').addEventListener('mousedown', (e) => { downOnOverlay = e.target === $('next-modal'); });
    $('next-modal').addEventListener('click', (e) => {
      const onOverlay = e.target === $('next-modal') && downOnOverlay;
      downOnOverlay = false;
      if (onOverlay) close();
    });
    $('next-modal').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
    for (const id of ['next-search', 'next-job', 'next-only-mine']) {
      $(id).addEventListener('input', () => { if (cur) render(); });
    }
  }

  const REQUIRED = ['$', 'esc', 'iconUrl', 'JOB_ICON', 'getItems', 'getIngredients', 'getRecipesById', 'gearOkFor', 'onPick'];
  globalThis.CraftNext = {
    buildIndex, consumersOf,      // 純函式，golden 測試面
    countFor, open, close,
    init(d) {
      const miss = REQUIRED.filter((k) => d == null || d[k] == null);
      if (miss.length) throw new Error('CraftNext.init 缺依賴: ' + miss.join(', '));
      deps = d;
      bind();
    },
    setData() { index = null; },  // loadData 重新賦值 INGREDIENTS 綁定 → 索引作廢，下次用到再建
  };
})();

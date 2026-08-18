// app-browse.js — 配方瀏覽層（職業篩選 chips + 配方表 + 已加入清單標示）。
// classic script（無 module 語法）：發佈 globalThis.CraftBrowse，app.js init 注入依賴——
// 沿用 app-render/app-solve/crafting-list 的 classic-script + deps 注入 pattern（免 module 化破壞 test-formulas vm 載入）。
// 私有狀態：jobFilter（職業篩選，僅本層讀寫）。RINDEX/selected 由 getter 注入取 live 值（loadData 會重賦值綁定，持舊參照看不到新資料）。
(function () {
  let deps = null;      // app.js 注入：{ $, esc, iconUrl, DOH, JOB_ICON, NAME_COLLATOR, getRINDEX, getSelected, selectRecipe, toast }
  let jobFilter = '';   // '' = 全部（本層私有；app.js 不再讀寫）
  const PER_PAGE = 60;  // 每頁筆數（取代舊的 CAP 120 硬截斷：13874 筆只給前 120＝想「瀏覽某職某等級有哪些」的人會漏看）
  let page = 0;         // 目前頁（0-based）
  let lastKey = null;   // 上次的篩選指紋 —— 篩選一變就回第 1 頁，翻頁本身不變指紋故保留頁碼
                        // （比「呼叫端傳 resetPage 參數」可靠：renderTable 有 5 個外部呼叫點，漏傳就是靜默 bug）

  function filterKey() {
    const { $ } = deps;
    return [jobFilter, $('recipe-search').value.trim(), $('level-filter').value, $('rlv-filter').value, $('expert-filter').value].join('|');
  }

  function renderChips() {
    if (!deps) return;   // 未 init 即被呼叫（app.js 已保證順序）→ 防 destructure null 崩潰（對抗審 grok F2）
    const { $, esc, iconUrl, DOH, JOB_ICON } = deps;
    // 職業篩選＝方形分段（Owner 拍板：不用 pill 橢圓）。2026-08-17 由 `.codex-btn --primary/--ghost`
    // 遷到共用 segmented `.codex-tab--boxed`：選中態走 aria-pressed（設計系統合法填色四處之一），
    // 而 `--primary` 的語意是「本檢視唯一主動作」——拿它表達「這顆被選中」是借形不借意（§按鈕選型 Step 0 第 3 列）。
    // 沿用真實職業 icon（JOB_ICON→xivapi），勿換 emoji。
    $('job-chips').innerHTML = ['', ...DOH].map(j => {
      const on = j === jobFilter;
      const ico = j && JOB_ICON[j] ? `<img src="${iconUrl(JOB_ICON[j])}" alt="" loading="lazy">` : '';
      return `<button type="button" class="codex-tab codex-tab--boxed job-btn" aria-pressed="${on}" data-job="${esc(j)}">${ico}${j || '全部'}</button>`;
    }).join('');
    $('job-chips').querySelectorAll('.job-btn').forEach(b => b.onclick = () => {
      jobFilter = b.dataset.job; renderChips(); renderTable();
    });
  }

  // 「加入」鈕＝列級重複性動作（設計系統 §按鈕選型 第 0 步列級豁免）→ 恆 ghost 圖示鈕，不參賽 primary。
  // 圖示用**內嵌向量**而不是全形「＋」：字元版的重量／垂直位置隨系統字型跑（Owner 2026-08-19 回報「有好看一點的按鈕嗎」），
  // 且拿不到 currentColor。畫法逐項對齊 portal `FFXIVIcons` 的慣例（viewBox 0 0 18 18／stroke currentColor／
  // stroke-width 1.75／linecap round）⇒ 與同頁的 ✕／📋 圖示視覺重量一致。
  // ⚠ 沒改用 `FFXIVIcons.btnHTML`：共用圖示組刻意只收「已在 2 個以上 repo 被 emoji 頂替過」的圖示，
  //   plus 目前只有本站要用（rule of two 未達）⇒ 第二個 repo 需要時再提 Owner 升格，不單邊往共用 API 加東西。
  const ICON = (d) => '<svg viewBox="0 0 18 18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor"'
    + ' stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
  const PLUS_SVG = ICON('M9 4.25v9.5M4.25 9h9.5');
  const MINUS_SVG = ICON('M4.25 9h9.5');
  // ＋ 恆在；− 只在該配方已在清單時出現（markListState 切 hidden）。
  // Owner 2026-08-19：「不要一定得到清單才能取消」——加錯了要能就地退回，而不是切分頁去刪。
  // − **不是 danger**：同質可重加物件的列級增減走豁免（設計系統 §按鈕選型 第 0 步），一表 60 顆紅✕＝紅色的狼來了。
  // 兩顆都在同一格且 − 用 hidden 收合（不是不 render）→ markListState 是 in-place 更新、不重建表，焦點不掉。
  function addBtn(r) {
    const { esc } = deps;
    return `<span class="rt-actwrap"><button type="button" class="codex-btn codex-btn--ghost codex-btn--icon rt-add" data-id="${r.id}"`
      + ` aria-label="將「${esc(r.name)}」加入製造清單" data-help="加入製造清單（不離開目前畫面）">${PLUS_SVG}</button>`
      + `<button type="button" class="codex-btn codex-btn--ghost codex-btn--icon rt-del" data-id="${r.id}" hidden`
      + ` aria-label="把「${esc(r.name)}」從製造清單退掉一次" data-help="從製造清單退一次（減到 0 就整筆移除）">${MINUS_SVG}</button></span>`;
  }

  // 表格高度＝**當前螢幕還剩多少**（Owner 2026-08-19：「一個螢幕能顯示的數量就好，然後表內滾動，
  // 不要我還要滾動外表格」）。原本寫死 `max-height: 60vh`：60vh 之外還有站頭／流程軸／篩選區／
  // 翻頁器，加起來一定超過一個螢幕 ⇒ 外層頁面也得捲，等於捲兩層。
  // **不用魔術常數**（頁面上方的高度會隨窄屏折行而變、翻頁器有時整條收起）：
  //   可用高度 = 視窗高 − 表格上緣 − 表格下方實際佔用的高度（翻頁器＋頁尾＋panel padding）
  // 下方佔用量＝`<main>` 底緣 − 表格底緣，量到什麼算什麼、不必列舉下面有哪些東西。
  // ⚠ **不可拿 `document.scrollHeight` 反推**：portal 的 body 公式是 `min-height:100vh` ＋
  //   `padding-top:64px`（給固定站頭），所以文件高度**恆為 100vh+64、與內容無關** ⇒ 反推出來的
  //   「下方佔用」每次都多算一截，連按兩次表格就縮掉 140px（實測 489→419→349）。
  //   同理：那 64px 造成的外層捲軸是全 13 站共用的 body 公式帶來的，不是本表撐出來的。
  const MIN_H = 240;   // 至少留得下約 6 列——極矮視窗（或站頭很高）時不要把表格壓成一條縫
  function fitHeight() {
    if (!deps) return;
    const el = deps.$('recipe-table');
    if (!el || !el.getBoundingClientRect || !el.offsetParent) return;   // 未載入／picker 收合時不量（rect 全 0）
    const rect = el.getBoundingClientRect();
    const host = (el.closest && el.closest('main')) || null;            // 頁尾（授權標示）也在 main 裡
    if (!rect.height || !host) return;
    const below = Math.max(0, host.getBoundingClientRect().bottom - rect.bottom);
    const avail = Math.round(window.innerHeight - rect.top - below - 8);   // 8＝底部呼吸空隙
    if (!Number.isFinite(avail)) return;
    const h = Math.max(MIN_H, avail);
    el.style.maxHeight = h + 'px';
    // 首載佔位（CLS）：資料還沒回來時，讓佔位塊撐到跟載入後一樣高——不然表格長出來時整頁會跳
    const ph = el.querySelector && el.querySelector('.recipe-loading');
    if (ph) ph.style.minHeight = h + 'px';
  }

  function renderTable() {
    if (!deps) return;   // 同 renderChips：防未 init 崩潰（對抗審 grok F2）
    const { $, esc, iconUrl, JOB_ICON, NAME_COLLATOR, getRINDEX, getSelected, selectRecipe, toast } = deps;
    const RINDEX = getRINDEX();
    const selected = getSelected();
    const q = $('recipe-search').value.trim().toLowerCase();
    const range = $('level-filter').value;
    const [lo, hi] = range ? range.split('-').map(Number) : [0, 999];
    const rlvVal = +$('rlv-filter').value || 0;
    const expertMode = $('expert-filter').value;   // '' 全部 / only 只看高難度 / hide 排除
    let list = RINDEX.filter(r =>
      (!jobFilter || r.job === jobFilter) &&
      (!range || (r.level >= lo && r.level <= hi)) &&
      (!rlvVal || r.rlv === rlvVal) &&
      (!expertMode || (expertMode === 'only' ? r.expert : !r.expert)) &&
      (!q || r.name.toLowerCase().includes(q) || (r.nameSc && r.nameSc.includes(q))));
    const total = list.length;
    list.sort((a, b) => b.level - a.level || NAME_COLLATOR.compare(a.name, b.name));
    const key = filterKey();
    if (key !== lastKey) { page = 0; lastKey = key; }        // 篩選變更 → 回第 1 頁（翻頁時 key 不變故保留）
    const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
    if (page > pageCount - 1) page = pageCount - 1;          // 資料變少（如清單外部更新）時夾回合法頁
    const shown = list.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
    $('recipe-count').textContent = total
      ? `${total} 個配方${pageCount > 1 ? `（第 ${page + 1} / ${pageCount} 頁）` : ''}`
      : (jobFilter || range || rlvVal || q || expertMode ? '無符合配方' : '');   // 篩選條件全都要納入判斷，否則只設某一項而 0 命中時是一片空白  // rlvVal 納入判斷：僅配方等級篩選且 0 命中也顯「無符合配方」（對抗審 codex/grok，搬移前既有 bug）
    renderPager(total, pageCount);
    $('recipe-table').innerHTML = shown.length ? `
      <table class="codex-table codex-table--fixed codex-table--sticky rt">
        <thead><tr><th>名稱</th><th>種類</th><th>職業</th><th>Lv</th><th>配方等級</th><th>難度</th><th>品質</th><th class="rt-actcol">加入</th></tr></thead>
        <tbody>${shown.map(r =>
          `<tr class="rt-row${selected && selected.recipe.id === r.id ? ' is-sel' : ''}" data-id="${r.id}" tabindex="0"><td class="rt-name"><span class="rt-cellflex">${r.icon ? `<img class="rt-ico" src="${iconUrl(r.icon)}" alt="" loading="lazy">` : ''}<span class="rt-nmline"><span class="rt-nm">${esc(r.name)}</span>${r.expert ? '<span class="codex-badge codex-badge--warn rt-expert" data-help="高難度（expert）配方：遊戲內的製作狀態是隨機的，本站算出的靜態巨集只能當參考、無法保證成功">高難度</span>' : ''}</span></span></td><td class="rt-cat">${esc(r.category || '—')}</td><td class="rt-job">${JOB_ICON[r.job] ? `<img class="rt-jico" src="${iconUrl(JOB_ICON[r.job])}" alt="" loading="lazy">` : ''}${esc(r.job)}</td><td>${r.level}</td><td>${r.rlv}</td><td>${r.diff == null ? '—' : r.diff}</td><td>${r.qual == null ? '—' : r.qual}</td><td class="rt-act">${addBtn(r)}</td></tr>`).join('')}</tbody>
      </table>` : '';
    // 事件委派（單一 handler，取代每列 2N listener → 篩選/搜尋重繪不重綁、行動裝置省 GC）；handler 綁在持久的 #recipe-table 上，innerHTML 換內容不掉線
    const table = $('recipe-table');
    table.onclick = (e) => {
      const add = e.target.closest('.rt-add');
      if (add) {                               // ＋：只加清單、不進詳情
        if (typeof globalThis.CraftList?.add === 'function') globalThis.CraftList.add(+add.dataset.id);
        else toast('製造清單模組未載入，請重新整理頁面', 'error');  // 檢 add 是否為函式（非只檢物件存在）→ 半套/舊版 global 不炸 TypeError（對抗審 codex）
        return;
      }
      const del = e.target.closest('.rt-del');
      if (del) {                               // −：就地退一次（同上，不進詳情）
        if (typeof globalThis.CraftList?.removeOne === 'function') globalThis.CraftList.removeOne(+del.dataset.id);
        else toast('製造清單模組未載入，請重新整理頁面', 'error');
        return;
      }
      const row = e.target.closest('.rt-row');
      if (row) selectRecipe(+row.dataset.id);
    };
    table.onkeydown = (e) => {                  // 列本身聚焦時 Enter/Space 選配方；＋ 是原生 button，其 Enter/Space 由瀏覽器觸發 click → 冒泡到上面 onclick（不重複）
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('rt-row')) { e.preventDefault(); selectRecipe(+e.target.dataset.id); }
    };
    markListState();  // 標記已在製造清單的列（換底色 + 徽章）
    fitHeight();      // 內容一換，下方的翻頁器可能出現/收起 → 重新量一次可用高度
  }

  // 翻頁器：只有一頁時整條收起（不佔版面也不誤導「還有別頁」）。
  // 上/下一頁用真 disabled —— 停用原因由旁邊的「第 N / M 頁」自明，不需另掛說明。
  function renderPager(total, pageCount) {
    const { $ } = deps;
    const el = $('recipe-pager');
    if (!el) return;
    if (pageCount <= 1) { el.innerHTML = ''; return; }
    const first = page === 0, last = page >= pageCount - 1;
    el.innerHTML =
      `<button type="button" class="codex-btn codex-btn--ghost" data-pg="prev"${first ? ' disabled' : ''}>← 上一頁</button>` +
      `<span class="crafter-pager__info codex-small">第 <b>${page + 1}</b> / ${pageCount} 頁 · 共 ${total} 個配方</span>` +
      `<button type="button" class="codex-btn codex-btn--ghost" data-pg="next"${last ? ' disabled' : ''}>下一頁 →</button>`;
    el.onclick = (e) => {
      const b = e.target.closest('[data-pg]');
      if (!b || b.disabled) return;
      page += (b.dataset.pg === 'next' ? 1 : -1);
      renderTable();
      $('recipe-table').scrollTop = 0;                 // 表格是內部捲動容器 → 翻頁回到列首，否則停在上一頁的捲動位置
      const keep = $('recipe-pager').querySelector(`[data-pg="${b.dataset.pg}"]`);
      if (keep && !keep.disabled) keep.focus();        // 連續翻頁時焦點不掉（按鈕被 innerHTML 重建）
    };
  }

  // 標記「已在製造清單」的配方列（in-place 更新、不重建表 → 保留焦點；renderTable 初繪與 CraftList 變更 onChange 共用）。
  // 答「頁面除通知外根本沒提示、不知哪些已加入」＝持久提示：整列換綠底（掃視主訊號）＋名稱旁「已加入 ×N」綠徽章。
  // 按鈕**恆為 ＋**（動作一律「+1」）——不換 ✓/填色，避免「已完成/點擊取消」假 affordance（對抗審 grok F2）。
  function markListState() {
    if (!deps) return;   // 同上：防未 init 崩潰（對抗審 grok F2）
    const { $ } = deps;
    const CL = globalThis.CraftList;
    const tbl = $('recipe-table');
    if (!CL || typeof CL.count !== 'function' || !tbl) return; // 舊快取/半套 init：count 未 export 就跳過，不炸整表互動（對抗審 grok F4）
    tbl.querySelectorAll('.rt-row').forEach(tr => {
      const n = CL.count(+tr.dataset.id);
      const inList = n > 0;
      tr.classList.toggle('rt-in', inList);
      const del = tr.querySelector('.rt-del');   // 不在清單時沒東西可退 → 收起來（留著會是一顆按了沒反應的鈕）
      if (del) del.hidden = !inList;
      const line = tr.querySelector('.rt-nmline'); // 徽章插名稱同行（名稱旁）
      if (!line) return;
      let badge = line.querySelector('.rt-inlist');
      if (inList) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'codex-badge codex-badge--success rt-inlist'; line.appendChild(badge); }
        badge.textContent = n > 1 ? `已加入 ×${n}` : '已加入';
      } else if (badge) { badge.remove(); }
    });
  }

  const REQUIRED = ['$', 'esc', 'iconUrl', 'DOH', 'JOB_ICON', 'NAME_COLLATOR', 'getRINDEX', 'getSelected', 'selectRecipe', 'toast'];
  globalThis.CraftBrowse = {
    // 注入契約變可測不變量：缺鍵即早炸（→ app.js init try/catch 顯錯誤橫幅），非等到 render 才靜默錯行為（對抗審 grok F5）
    init(d) {
      const miss = REQUIRED.filter(k => d == null || d[k] == null);
      if (miss.length) throw new Error('CraftBrowse.init 缺依賴: ' + miss.join(', '));
      deps = d;
      fitHeight();   // 資料還沒回來就先量：佔位塊撐到與載入後同高＝零版面位移
      if (typeof window !== 'undefined' && window.addEventListener) {
        let t = null;   // 拖曳視窗會連發 resize → 收斂成一次（量測本身會觸發 layout）
        window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(fitHeight, 120); });
      }
    },
    renderChips,
    renderTable,
    markListState,
    fitHeight,
  };
})();

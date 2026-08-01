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
    return [jobFilter, $('recipe-search').value.trim(), $('level-filter').value, $('rlv-filter').value].join('|');
  }

  function renderChips() {
    if (!deps) return;   // 未 init 即被呼叫（app.js 已保證順序）→ 防 destructure null 崩潰（對抗審 grok F2）
    const { $, esc, iconUrl, DOH, JOB_ICON } = deps;
    // 職業篩選＝共用 .codex-btn 方形分段（Owner 拍板：不用 pill 橢圓）：選中＝--primary 填色 / 未選＝--ghost，aria-pressed 同步 a11y。
    // 沿用真實職業 icon（JOB_ICON→xivapi），勿換 emoji。picker 與求解 work 互斥顯示 → 選中職業的 --primary 不會與 solve-btn 主 CTA 同框。
    $('job-chips').innerHTML = ['', ...DOH].map(j => {
      const on = j === jobFilter;
      const ico = j && JOB_ICON[j] ? `<img src="${iconUrl(JOB_ICON[j])}" alt="" loading="lazy">` : '';
      return `<button type="button" class="codex-btn ${on ? 'codex-btn--primary' : 'codex-btn--ghost'} job-btn" aria-pressed="${on}" data-job="${esc(j)}">${ico}${j || '全部'}</button>`;
    }).join('');
    $('job-chips').querySelectorAll('.job-btn').forEach(b => b.onclick = () => {
      jobFilter = b.dataset.job; renderChips(); renderTable();
    });
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
    let list = RINDEX.filter(r =>
      (!jobFilter || r.job === jobFilter) &&
      (!range || (r.level >= lo && r.level <= hi)) &&
      (!rlvVal || r.rlv === rlvVal) &&
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
      : (jobFilter || range || rlvVal || q ? '無符合配方' : '');  // rlvVal 納入判斷：僅配方等級篩選且 0 命中也顯「無符合配方」（對抗審 codex/grok，搬移前既有 bug）
    renderPager(total, pageCount);
    $('recipe-table').innerHTML = shown.length ? `
      <table class="rt">
        <thead><tr><th>名稱</th><th>職業</th><th>Lv</th><th>配方等級</th><th class="rt-actcol">加入</th></tr></thead>
        <tbody>${shown.map(r =>
          `<tr class="rt-row${selected && selected.recipe.id === r.id ? ' is-sel' : ''}" data-id="${r.id}" tabindex="0"><td class="rt-name"><span class="rt-cellflex">${r.icon ? `<img class="rt-ico" src="${iconUrl(r.icon)}" alt="" loading="lazy">` : ''}<span class="rt-nmwrap"><span class="rt-nmline"><span class="rt-nm">${esc(r.name)}</span></span>${r.category ? `<span class="rt-cat codex-small">${esc(r.category)}</span>` : ''}</span></span></td><td class="rt-job">${JOB_ICON[r.job] ? `<img class="rt-jico" src="${iconUrl(JOB_ICON[r.job])}" alt="" loading="lazy">` : ''}${esc(r.job)}</td><td>${r.level}</td><td>${r.rlv}</td><td class="rt-act"><button type="button" class="codex-btn codex-btn--ghost codex-btn--icon rt-add" data-id="${r.id}" aria-label="將「${esc(r.name)}」加入製造清單" data-help="加入製造清單（不離開目前畫面）">＋</button></td></tr>`).join('')}</tbody>
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
      const row = e.target.closest('.rt-row');
      if (row) selectRecipe(+row.dataset.id);
    };
    table.onkeydown = (e) => {                  // 列本身聚焦時 Enter/Space 選配方；＋ 是原生 button，其 Enter/Space 由瀏覽器觸發 click → 冒泡到上面 onclick（不重複）
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('rt-row')) { e.preventDefault(); selectRecipe(+e.target.dataset.id); }
    };
    markListState();  // 標記已在製造清單的列（換底色 + 徽章）
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
    },
    renderChips,
    renderTable,
    markListState,
  };
})();

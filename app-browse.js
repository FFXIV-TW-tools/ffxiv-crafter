// app-browse.js — 配方瀏覽層（職業篩選 chips + 配方表 + 已加入清單標示）。
// classic script（無 module 語法）：發佈 globalThis.CraftBrowse，app.js init 注入依賴——
// 沿用 app-render/app-solve/crafting-list 的 classic-script + deps 注入 pattern（免 module 化破壞 test-formulas vm 載入）。
// 私有狀態：jobFilter（職業篩選，僅本層讀寫）。RINDEX/selected 由 getter 注入取 live 值（loadData 會重賦值綁定，持舊參照看不到新資料）。
(function () {
  let deps = null;      // app.js 注入：{ $, esc, iconUrl, DOH, JOB_ICON, NAME_COLLATOR, getRINDEX, getSelected, selectRecipe, toast }
  let jobFilter = '';   // '' = 全部（本層私有；app.js 不再讀寫）

  function renderChips() {
    const { $, esc, iconUrl, DOH, JOB_ICON } = deps;
    // 職業篩選＝共用 .codex-btn 方形分段（shawn 拍板：不用 pill 橢圓）：選中＝--primary 填色 / 未選＝--ghost，aria-pressed 同步 a11y。
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
      (!q || r.name.toLowerCase().includes(q)));
    const total = list.length;
    list.sort((a, b) => b.level - a.level || NAME_COLLATOR.compare(a.name, b.name));
    const CAP = 120;
    const shown = list.slice(0, CAP);
    $('recipe-count').textContent = total
      ? `${total} 個配方${total > CAP ? `（顯示前 ${CAP}，請用職業／等級／搜尋縮小）` : ''}`
      : (jobFilter || range || q ? '無符合配方' : '');
    $('recipe-table').innerHTML = shown.length ? `
      <table class="rt">
        <thead><tr><th>名稱</th><th>職業</th><th>Lv</th><th>配方等級</th><th class="rt-actcol">加入</th></tr></thead>
        <tbody>${shown.map(r =>
          `<tr class="rt-row${selected && selected.recipe.id === r.id ? ' is-sel' : ''}" data-id="${r.id}" tabindex="0"><td class="rt-name"><span class="rt-cellflex">${r.icon ? `<img class="rt-ico" src="${iconUrl(r.icon)}" alt="" loading="lazy">` : ''}<span class="rt-nmwrap"><span class="rt-nmline"><span class="rt-nm">${esc(r.name)}</span></span>${r.category ? `<span class="rt-cat codex-small">${esc(r.category)}</span>` : ''}</span></span></td><td class="rt-job">${JOB_ICON[r.job] ? `<img class="rt-jico" src="${iconUrl(JOB_ICON[r.job])}" alt="" loading="lazy">` : ''}${esc(r.job)}</td><td>${r.level}</td><td>${r.rlv}</td><td class="rt-act"><button type="button" class="codex-btn codex-btn--ghost codex-btn--icon rt-add" data-id="${r.id}" aria-label="將「${esc(r.name)}」加入製造清單" title="加入製造清單">＋</button></td></tr>`).join('')}</tbody>
      </table>` : '';
    // 事件委派（單一 handler，取代每列 2N listener → 篩選/搜尋重繪不重綁、行動裝置省 GC）；handler 綁在持久的 #recipe-table 上，innerHTML 換內容不掉線
    const table = $('recipe-table');
    table.onclick = (e) => {
      const add = e.target.closest('.rt-add');
      if (add) {                               // ＋：只加清單、不進詳情
        if (globalThis.CraftList) globalThis.CraftList.add(+add.dataset.id);
        else toast('製造清單模組未載入，請重新整理頁面', 'error');  // 缺依賴不靜默吞（禁假成功）
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

  // 標記「已在製造清單」的配方列（in-place 更新、不重建表 → 保留焦點；renderTable 初繪與 CraftList 變更 onChange 共用）。
  // 答「頁面除通知外根本沒提示、不知哪些已加入」＝持久提示：整列換綠底（掃視主訊號）＋名稱旁「已加入 ×N」綠徽章。
  // 按鈕**恆為 ＋**（動作一律「+1」）——不換 ✓/填色，避免「已完成/點擊取消」假 affordance（對抗審 grok F2）。
  function markListState() {
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
        if (!badge) { badge = document.createElement('span'); badge.className = 'codex-badge codex-badge--success codex-badge--text rt-inlist'; line.appendChild(badge); }
        badge.textContent = n > 1 ? `已加入 ×${n}` : '已加入';
      } else if (badge) { badge.remove(); }
    });
  }

  globalThis.CraftBrowse = {
    init(d) { deps = d; },  // { $, esc, iconUrl, DOH, JOB_ICON, NAME_COLLATOR, getRINDEX, getSelected, selectRecipe, toast }
    renderChips,
    renderTable,
    markListState,
  };
})();

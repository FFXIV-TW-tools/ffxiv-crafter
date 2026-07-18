// app-render.js — 求解結果渲染層：結果摘要（badge/進度條）/ 手法序列 chips / 逐步走查表 / 遊戲巨集。
// classic script（無 module 語法，同 crafting-list.js 手法）：發佈 globalThis.CraftRender，app.js init 注入依賴。
// 注入 getter（getSelected/getItems/getActions）而非值 —— loadData 會「重新賦值」ITEMS/ACTIONS 綁定，持舊參照看不到新資料，故取 live 值。
(function () {
  let deps = null; // { $, esc, iconUrl, b64urlEncode, copyText, MACRO_BUILDER_BASE, PH_HTML, getSelected, getItems, getActions }

  // HQ 高品質率：品質% → HQ%。表逐格移植自 ffxiv-crafting 7.4.5 data::high_quality_table（Tnze，權威遊戲表）— 勿自改。純函式（golden 測試面）。
  function hqPercent(quality, maxQuality) {
    if (!maxQuality) return null;
    const p = Math.floor(Math.min(quality, maxQuality) * 100 / maxQuality); // 夾到上限：raphael 末步品質會溢出，遊戲內封頂
    if (p === 100) return 100;
    if (p >= 99) return 98; if (p >= 98) return 96; if (p >= 97) return 94; if (p >= 96) return 92;
    if (p >= 95) return 91; if (p >= 94) return 90; if (p >= 93) return 89; if (p >= 92) return 88;
    if (p >= 91) return 87; if (p >= 90) return 86; if (p >= 89) return 85; if (p >= 88) return 84;
    if (p >= 87) return 83; if (p >= 86) return 82; if (p >= 85) return 81; if (p >= 84) return 80;
    if (p >= 83) return 78; if (p >= 82) return 76; if (p >= 81) return 74; if (p >= 80) return 71;
    if (p >= 79) return 68; if (p >= 78) return 64; if (p >= 77) return 58; if (p >= 76) return 52;
    if (p >= 75) return 47; if (p >= 74) return 42; if (p >= 73) return 38; if (p >= 72) return 34;
    if (p >= 71) return 31; if (p >= 70) return 28; if (p >= 69) return 26; if (p >= 68) return 24;
    if (p >= 67) return 23; if (p >= 66) return 22; if (p >= 65) return 21; if (p >= 63) return 20;
    if (p >= 61) return 19; if (p >= 58) return 18; if (p >= 55) return 17; if (p >= 53) return 16;
    if (p >= 50) return 15; if (p >= 47) return 14; if (p >= 44) return 13; if (p >= 41) return 12;
    if (p >= 38) return 11; if (p >= 35) return 10; if (p >= 32) return 9; if (p >= 29) return 8;
    if (p >= 25) return 7; if (p >= 21) return 6; if (p >= 17) return 5; if (p >= 13) return 4;
    if (p >= 9) return 3; if (p >= 5) return 2; if (p === 0) return 1;
    return null; // 1-4%：權威表未定義（實務不會發生）
  }

  function bar(label, v, m, pct) {
    return `<div class="bar-row"><span class="bar-label">${label}</span>
      <div class="codex-progress"><div class="codex-progress__bar" style="width:${pct(v, m)}%"></div></div>
      <span class="bar-num codex-small">${v}/${m}</span></div>`;
  }
  function actionName(v) { const A = deps.getActions(); return (A[v] && A[v].nameTc) || v; }
  function actImg(v) { const a = deps.getActions()[v]; return (a && a.icon) ? `<img class="act-ico" src="${deps.iconUrl(a.icon)}" alt="" loading="lazy">` : ''; }
  function actionChip(s) {
    const { esc } = deps;
    return `<div class="chip" title="${esc(actionName(s.action))}">${actImg(s.action)}<span class="chip-name codex-xs">${esc(actionName(s.action))}</span></div>`;
  }
  function renderMacro(steps) {
    const { $, esc, b64urlEncode, copyText, MACRO_BUILDER_BASE, getSelected } = deps;
    const selected = getSelected();
    const lines = steps.map(s => `/ac "${actionName(s.action)}" <wait.${s.time}>`);
    const macros = [];
    if (lines.length <= 15) macros.push(lines.slice());
    else for (let i = 0; i < lines.length; i += 14) {
      const c = lines.slice(i, i + 14);
      c.push(`/echo 第 ${macros.length + 1} 段完成 <se.${(macros.length % 8) + 1}>`);
      macros.push(c);
    }
    // 存進巨集庫深連結（named target 共用分頁、不加 noopener——生態內互跳鐵則；收端經確認 modal 絕不自動寫入）
    const itemName = (selected && selected.recipe && selected.recipe.item_name) || '製作巨集';
    const payload = b64urlEncode(JSON.stringify(macros.map((m, i) => {
      // title「物品名 段X/Y」：段號後綴先預留空間、只截物品名（adv-review：20 字物品名原本會截掉段號 → 各段同名無法分辨）
      const suffix = macros.length > 1 ? ` 段${i + 1}/${macros.length}` : '';
      const nameMax = Math.max(1, 20 - Array.from(suffix).length);
      return { title: Array.from(itemName).slice(0, nameMax).join('') + suffix, lines: m };
    })));
    const importUrl = `${MACRO_BUILDER_BASE}?import=${payload}`;
    const saveLink = importUrl.length <= 8192   // 超過 URL 安全線不出鈕（防呆；實務 1–3.5KB 遠低於線）
      ? `<div class="macro-tools"><a class="codex-btn codex-btn--ghost" href="${importUrl}" target="ffxiv-macro-builder" title="帶到巨集產生器，確認後存進巨集庫（共用同一分頁；不會自動寫入）">📥 存進巨集庫 ↗</a></div>`
      : '';
    $('macro').innerHTML = saveLink + macros.map((m, i) =>
      `<div class="macro-block">
         <div class="macro-head"><span class="codex-small">巨集 ${i + 1} / ${macros.length}（${m.length} 行）</span>
           <button class="codex-btn codex-btn--ghost copy-btn" data-i="${i}">複製</button></div>
         <textarea class="macro-text codex-textarea" rows="${m.length}" readonly>${esc(m.join('\n'))}</textarea>
       </div>`).join('');
    $('macro').querySelectorAll('.copy-btn').forEach(b => b.onclick = () => copyText(macros[+b.dataset.i].join('\n'), '✓ 已複製巨集'));
  }

  function render(r, scroll = true) {
    const { $, esc, getSelected, getItems } = deps;
    const selected = getSelected();
    const ITEMS = getItems();
    $('results-placeholder').hidden = true;
    $('results').hidden = false;
    const pct = (v, m) => m > 0 ? Math.min(100, Math.floor(v / m * 100)) : 0; // floor 與 hqPercent 內部一致，避免未滿卻顯示 100%
    const hq = r.final_quality >= r.max_quality && r.max_quality > 0;
    const itemHqable = !!(ITEMS[String(selected && selected.recipe.item_id)] || {}).can_be_hq;
    const hqp = itemHqable ? hqPercent(r.final_quality, r.max_quality) : null;
    // 高難度(expert)配方遊戲內為隨機製作狀態，引擎只算 Normal 靜態巨集 → 不顯示無條件「✓ 可完成」，改中性試算標記 + 警語
    const isExpert = !!(selected && selected.recipe.is_expert);
    const completeBadge = r.complete
      ? (isExpert
          ? '<span class="codex-badge" title="高難度配方為隨機製作狀態，靜態試算不代表遊戲內必成">試算完成 ⚠</span>'
          : '<span class="codex-badge codex-badge--success">✓ 可完成</span>')
      : '<span class="codex-badge codex-badge--danger">✗ 未完成</span>';
    const expertWarn = isExpert ? '<div class="sum-err codex-small">⚠ 高難度配方在遊戲內為隨機製作狀態，此靜態巨集僅供參考、無法保證能在遊戲內完成</div>' : '';
    const errLine = r.error ? `<div class="sum-err codex-small">⚠ 第 ${r.error_step + 1} 步無法執行（${esc(r.error)}）— 之後略過</div>` : ''; // engine 錯誤字串轉義（轉義紀律一致；icon 皆來自 build-data 常數、無注入面故不包）
    $('result-summary').innerHTML = `
      <div class="sum-row">
        ${completeBadge}
        <span class="codex-badge ${hq ? 'codex-badge--gold' : ''}">品質 ${pct(r.final_quality, r.max_quality)}%${hq ? ' · 滿' : ''}</span>
        ${hqp != null ? `<span class="codex-badge codex-badge--gold" title="成品高品質(HQ)機率">HQ ${hqp}%</span>` : ''}
        <span class="sum-meta">${r.step_count} 步 · ${r.total_time} 秒</span>
      </div>
      ${expertWarn}
      ${errLine}
      ${bar('進展', r.final_progress, r.max_progress, pct)}
      ${bar('品質', r.final_quality, r.max_quality, pct)}`;
    $('rotation').innerHTML = r.steps.map(actionChip).join('');
    $('walkthrough').innerHTML = `
      <table class="wt-table">
        <thead><tr><th>#</th><th>手法</th><th>進展</th><th>品質</th><th>耐久</th><th>CP</th></tr></thead>
        <tbody>${r.steps.map((s, i) =>
          `<tr><td>${i + 1}</td><td class="wt-act">${actImg(s.action)}${esc(actionName(s.action))}</td><td>${s.progress}</td><td>${s.quality}</td><td>${s.durability}</td><td>${s.cp}</td></tr>`).join('')}</tbody>
      </table>`;
    renderMacro(r.steps);
    $('solve-status').innerHTML = `<span class="codex-small">✓ 求解完成：品質 ${pct(r.final_quality, r.max_quality)}%、共 ${r.step_count} 步，巨集已產生</span>`; // aria-live 向螢幕閱讀器播報完成
    $('results').focus({ preventScroll: true }); // 顯式移焦到結果區（tabindex=-1）→ 鍵盤下一 Tab 直達複製鈕
    if (scroll) $('results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  globalThis.CraftRender = {
    init(d) { deps = d; },
    render,
    hqPercent, // 純函式，golden 測試面（test-formulas 載本檔取用）
  };
})();

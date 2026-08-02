// app-gear.js — 角色數值（localStorage）與職業裝備表。
// classic script（無 module 語法）：發佈 globalThis.CraftGear，app.js init 注入依賴——
// 沿用 app-browse/app-render/app-solve/crafting-list 的 classic-script + deps 注入 pattern。
// ⚠ 這兩個刻意留在 IIFE **外面**（其他層的狀態都是私有的，這裡是例外）：
// tools/test-formulas.mjs 的 T6 sec-A2 用 `vm.runInContext('gearsets', ctx)` 直接讀全域識別字，
// 驗「壞掉的 localStorage 值要被重置成空物件」。搬進 IIFE 會讓那兩條斷言 ReferenceError。
// 要收進私有狀態就得同時改那兩條測試的取值方式 —— 是可以做，但別在「順手整理」時不小心做。
const GEAR_KEY = 'ffxiv-crafter-gearsets-v1';
let gearsets = {};      // { 職業: {level,cms,ctrl,cp} }

(function () {
  let deps = null;
  let gearLoadWarned = false;
  let gearSaveWarned = false;

  function loadGear() {
    try {
      const raw = localStorage.getItem(GEAR_KEY);
      if (raw == null) { gearsets = {}; return; } // 首次使用：沒有保存值不是錯誤
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('角色數值資料不是物件');
      gearsets = parsed;
    } catch (e) {
      gearsets = {};
      console.warn('[crafter] 角色數值讀取失敗，已重置:', e);
      if (!gearLoadWarned) { gearLoadWarned = true; deps.toast('角色數值讀取失敗，已重置', 'warn'); }
    }
  }

  function saveGear() {
    try { localStorage.setItem(GEAR_KEY, JSON.stringify(gearsets)); }
    catch (e) {                                   // 無痕/私密模式或配額滿：至少 warn（禁靜默吞），並一次性提醒玩家設定不會保存
      console.warn('[crafter] 角色數值儲存失敗（可能是無痕模式）:', e);
      if (!gearSaveWarned) { gearSaveWarned = true; deps.toast('無法保存角色數值（可能是無痕/私密模式），本次設定重整後會遺失', 'warn'); }
    }
  }

  function gearValid(g) { return !!(g && g.cms > 0 && g.ctrl > 0 && g.cp > 0); }
  function gearFor(job) {                       // 該職有效 → 用；否則用「預設」；都無 → null
    if (gearValid(gearsets[job])) return { ...gearsets[job], _src: job };
    if (gearValid(gearsets['預設'])) return { ...gearsets['預設'], _src: '預設' };
    return null;
  }
  function anyGear() { return deps.DOH.concat('預設').some(j => gearValid(gearsets[j])); }

  function renderGearsets() {
    const { $, esc, iconUrl, DOH, JOB_ICON } = deps;
    const rows = ['預設', ...DOH];
    const cell = (job, f, ph) => {
      const v = (gearsets[job] && gearsets[job][f] != null) ? (Number(gearsets[job][f]) || '') : ''; // 強制數字 → 堵 localStorage 竄改的 self-XSS sink（非數字/0 → 空，顯示 placeholder）
      return `<td><input class="codex-input gear-in" data-job="${esc(job)}" data-f="${f}" type="number" min="0" inputmode="numeric" value="${v}" placeholder="${ph || ''}"></td>`;
    };
    const jico = (job) => JOB_ICON[job]
      ? `<img class="gj-ico" src="${iconUrl(JOB_ICON[job])}" alt="" loading="lazy">`
      : '<span class="gj-ico gj-ico--empty" aria-hidden="true"></span>'; // 預設列無職業 icon → 等寬佔位讓職名對齊
    $('gearsets').innerHTML = `
      <table class="gear-table">
        <thead><tr><th>職業</th><th>等級</th><th>作業精度</th><th>加工精度</th><th>CP</th></tr></thead>
        <tbody>${rows.map(job =>
          `<tr><th class="gj${job === '預設' ? ' gj-default' : ''}">${jico(job)}${esc(job)}</th>${cell(job, 'level', '100')}${cell(job, 'cms', '工藝')}${cell(job, 'ctrl', '加工')}${cell(job, 'cp', 'CP')}</tr>`).join('')}</tbody>
      </table>`;
    $('gearsets').querySelectorAll('.gear-in').forEach(inp => inp.addEventListener('input', onGearInput));
  }

  function onGearInput(e) {
    const { job, f } = e.target.dataset;
    const raw = e.target.value;
    let value = +raw || 0;
    if (f === 'level') {
      const clamped = Math.min(100, Math.max(0, value));
      // 0 是「未填」：清空要保留空白，顯式輸入 0 也正規化回 placeholder。
      if (clamped !== value || (clamped === 0 && String(raw).trim() !== '')) e.target.value = clamped || '';
      value = clamped;
    }
    (gearsets[job] = gearsets[job] || {})[f] = value;
    saveGear();
    deps.afterInput();
  }

  const REQUIRED = ['$', 'esc', 'toast', 'iconUrl', 'DOH', 'JOB_ICON', 'afterInput'];
  globalThis.CraftGear = {
    // 注入契約變可測不變量：缺鍵即早炸（→ app.js init 顯錯誤橫幅），非等到 render 才靜默錯行為。
    init(d) {
      const miss = REQUIRED.filter(k => d == null || d[k] == null);
      if (miss.length) throw new Error('CraftGear.init 缺依賴: ' + miss.join(', '));
      deps = d;
    },
    loadGear,
    saveGear,
    gearFor,
    gearValid,
    anyGear,
    renderGearsets,
    onGearInput,
  };
})();

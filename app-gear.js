// app-gear.js — 角色數值（localStorage）與職業裝備表。
// classic script（無 module 語法）：發佈 globalThis.CraftGear，app.js init 注入依賴——
// 沿用 app-browse/app-render/app-solve/crafting-list 的 classic-script + deps 注入 pattern。
// ⚠ 這兩個刻意留在 IIFE **外面**（其他層的狀態都是私有的，這裡是例外）：
// tools/test-formulas.mjs 的 T6 sec-A2 用 `vm.runInContext('gearsets', ctx)` 直接讀全域識別字，
// 驗「壞掉的 localStorage 值要被重置成空物件」。搬進 IIFE 會讓那兩條斷言 ReferenceError。
// 要收進私有狀態就得同時改那兩條測試的取值方式 —— 是可以做，但別在「順手整理」時不小心做。
const GEAR_KEY = 'ffxiv-crafter-gearsets-v1';
let gearsets = {};      // { 職業: {level,cms,ctrl,cp,specialist} }

(function () {
  const SPEC_MAX = 3;     // 遊戲限制：一個角色同時最多持有 3 個專家之證
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
  // 專家之證＝角色狀態（每職一份，遊戲上限 3），不是消耗品也不是數值：
  // 故**獨立於數值的 fallback 來源**——用「預設」數值的職業照樣算自己的專家之證。
  function specialistFor(job) { return !!(gearsets[job] && gearsets[job].specialist); }
  function specialistCount() { return deps.DOH.filter(specialistFor).length; }
  function gearFor(job) {                       // 該職有效 → 用；否則用「預設」；都無 → null
    if (gearValid(gearsets[job])) return { ...gearsets[job], _src: job, specialist: specialistFor(job) };
    if (gearValid(gearsets['預設'])) return { ...gearsets['預設'], _src: '預設', specialist: specialistFor(job) };
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
    // 專家之證欄：「預設」不是職業（是數值 fallback），不給勾——勾了也無從對應到哪個職業的證
    const specCell = (job) => job === '預設'
      ? '<td class="gear-na" aria-hidden="true">—</td>'
      : `<td><input class="gear-spec" type="checkbox" data-job="${esc(job)}"${specialistFor(job) ? ' checked' : ''} aria-label="${esc(job)}：專家之證"></td>`;
    $('gearsets').innerHTML = `
      <table class="codex-table codex-table--fixed gear-table">
        <thead><tr><th>職業</th><th>等級</th><th>作業精度</th><th>加工精度</th><th>CP</th>
          <th data-help="持有專家之證的職業：作業 +20・加工 +20・CP +15，並解鎖「專心致志」「快速改革」｜遊戲同時最多 3 個">專家之證 <span id="spec-count" class="gear-spec-count"></span></th></tr></thead>
        <tbody>${rows.map(job =>
          `<tr><th class="gj${job === '預設' ? ' gj-default' : ''}">${jico(job)}${esc(job)}</th>${cell(job, 'level', '100')}${cell(job, 'cms', '工藝')}${cell(job, 'ctrl', '加工')}${cell(job, 'cp', 'CP')}${specCell(job)}</tr>`).join('')}</tbody>
      </table>`;
    $('gearsets').querySelectorAll('.gear-in').forEach(inp => inp.addEventListener('input', onGearInput));
    $('gearsets').querySelectorAll('.gear-spec').forEach(inp => inp.addEventListener('change', onSpecialistToggle));
    updateSpecCount();
  }

  // 計數只改文字、不重繪整張表（重繪會吃掉勾選當下的焦點）
  function updateSpecCount() {
    const el = deps.$('spec-count');
    if (!el) return;
    const n = specialistCount();
    el.textContent = `${n}/${SPEC_MAX}`;
    el.classList.toggle('is-full', n >= SPEC_MAX);
  }

  // 上限不用 disabled 擋（disabled 的 checkbox 鍵盤走不到、也讀不到原因）：
  // 照樣可按，超過就退回並說明為什麼——玩家看得到「哪一格不能再勾」的理由。
  function onSpecialistToggle(e) {
    const job = e.target.dataset.job;
    if (e.target.checked && specialistCount() >= SPEC_MAX) {
      e.target.checked = false;
      deps.toast(`專家之證同時最多 ${SPEC_MAX} 個 — 請先取消其他職業`, 'warn');
      return;
    }
    (gearsets[job] = gearsets[job] || {}).specialist = e.target.checked;
    saveGear();
    updateSpecCount();
    deps.afterInput();
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
    onSpecialistToggle,
    specialistFor,
    specialistCount,
    SPEC_MAX,
  };
})();

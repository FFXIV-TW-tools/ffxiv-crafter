// 配方製作求解器 — 分頁式：配方求解（職業+等級瀏覽）/ 角色數值（各職裝備）。
// 公式（已對抗驗證，spec §4）在此算，WASM worker 只跑引擎。
const $ = (id) => document.getElementById(id);
const ICON_BASE = 'https://xivapi.com';
// 跨工具深連結：到 marketboard 看材料樹/行情/成本（dev 走 :8774 統一外部站，prod 走 pages.dev）
const MARKETBOARD_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:8774/ffxiv-tw-marketboard/'
  : 'https://ffxiv-tw-marketboard.pages.dev/';
const DOH = ['木工', '鍛造', '甲冑', '金工', '皮革', '裁縫', '鍊金', '烹調']; // 8 DoH（= recipe.job 值，依製作職業列序）
// DoH 職業 icon：classjob_id 8–15 → icon_id 62100+id（同 jobs.json framed icon 模式）
const JOB_ICON = {
  '木工': '/i/062000/062108.png', '鍛造': '/i/062000/062109.png', '甲冑': '/i/062000/062110.png',
  '金工': '/i/062000/062111.png', '皮革': '/i/062000/062112.png', '裁縫': '/i/062000/062113.png',
  '鍊金': '/i/062000/062114.png', '烹調': '/i/062000/062115.png',
};
const GEAR_KEY = 'ffxiv-crafter-gearsets-v1';
const PH_HTML = '設定好左側後按「求解最佳手法」，<br>巨集與手法序列會顯示在這裡 →';

let RECIPES = [], RLV = {}, ACTIONS = {}, RINDEX = [], ITEMS = {}, INGREDIENTS = {};
let FOOD = {}, POTION = {};  // name → { nq, hq }
let gearsets = {};      // { 職業: {level,cms,ctrl,cp} }
let jobFilter = '';     // '' = 全部
let selected = null;    // { recipe, rlv }
let computedInitial = 0; // 由 HQ 原料勾選算出的初始品質
let worker = null;

// ---------- 資料 ----------
async function loadData() {
  const [recipes, rlv, actions, items, ingredients, meals, medicine] = await Promise.all([
    fetch('data/recipes.json').then(r => r.json()),
    fetch('data/recipe_levels.json').then(r => r.json()),
    fetch('data/craft-actions.json').then(r => r.json()),
    fetch('data/items.json').then(r => r.json()),
    fetch('data/ingredients.json').then(r => r.json()),
    fetch('data/meals.json').then(r => r.json()),
    fetch('data/medicine.json').then(r => r.json()),
  ]);
  RECIPES = recipes; RLV = rlv; ACTIONS = actions; ITEMS = items; INGREDIENTS = ingredients;
  FOOD = buildConsumables(meals); POTION = buildConsumables(medicine);
  RINDEX = RECIPES.map(r => ({
    id: r.id, name: r.item_name || '', job: r.job || '', rlv: r.rlv,
    level: (RLV[String(r.rlv)] && RLV[String(r.rlv)].class_job_level) || 0,
    icon: (ITEMS[String(r.item_id)] && ITEMS[String(r.item_id)].icon) || null,
  }));
}

// ---------- 角色數值（localStorage）----------
function loadGear() { try { gearsets = JSON.parse(localStorage.getItem(GEAR_KEY)) || {}; } catch { gearsets = {}; } }
function saveGear() { try { localStorage.setItem(GEAR_KEY, JSON.stringify(gearsets)); } catch { /* private mode */ } }
function gearValid(g) { return !!(g && g.cms > 0 && g.ctrl > 0 && g.cp > 0); }
function gearFor(job) {                       // 該職有效 → 用；否則用「預設」；都無 → null
  if (gearValid(gearsets[job])) return { ...gearsets[job], _src: job };
  if (gearValid(gearsets['預設'])) return { ...gearsets['預設'], _src: '預設' };
  return null;
}
function anyGear() { return DOH.concat('預設').some(j => gearValid(gearsets[j])); }

function renderGearsets() {
  const rows = ['預設', ...DOH];
  const cell = (job, f, ph) => {
    const v = (gearsets[job] && gearsets[job][f] != null) ? gearsets[job][f] : '';
    return `<td><input class="codex-input gear-in" data-job="${esc(job)}" data-f="${f}" type="number" min="0" inputmode="numeric" value="${v}" placeholder="${ph || ''}"></td>`;
  };
  const jico = (job) => JOB_ICON[job]
    ? `<img class="gj-ico" src="${ICON_BASE}${JOB_ICON[job]}" alt="" loading="lazy">`
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
  (gearsets[job] = gearsets[job] || {})[f] = +e.target.value || 0;
  saveGear(); updateHint();
  if (selected) refreshSelectedGear();
}

// ---------- 職業 chips + 配方表 ----------
function renderChips() {
  $('job-chips').innerHTML = ['', ...DOH].map(j =>
    `<button class="job-chip${j === jobFilter ? ' is-active' : ''}" data-job="${esc(j)}">${j && JOB_ICON[j] ? `<img src="${ICON_BASE}${JOB_ICON[j]}" alt="" loading="lazy">` : ''}${j || '全部'}</button>`).join('');
  $('job-chips').querySelectorAll('.job-chip').forEach(b => b.onclick = () => {
    jobFilter = b.dataset.job; renderChips(); renderTable();
  });
}
function renderTable() {
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
  list.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, 'zh-Hant'));
  const CAP = 120;
  const shown = list.slice(0, CAP);
  $('recipe-count').textContent = total
    ? `${total} 個配方${total > CAP ? `（顯示前 ${CAP}，請用職業／等級／搜尋縮小）` : ''}`
    : (jobFilter || range || q ? '無符合配方' : '');
  $('recipe-table').innerHTML = shown.length ? `
    <table class="rt">
      <thead><tr><th>名稱</th><th>職業</th><th>Lv</th><th>配方等級</th></tr></thead>
      <tbody>${shown.map(r =>
        `<tr class="rt-row${selected && selected.recipe.id === r.id ? ' is-sel' : ''}" data-id="${r.id}"><td class="rt-name">${r.icon ? `<img class="rt-ico" src="${ICON_BASE}${r.icon}" alt="" loading="lazy">` : ''}${esc(r.name)}</td><td class="rt-job">${JOB_ICON[r.job] ? `<img class="rt-jico" src="${ICON_BASE}${JOB_ICON[r.job]}" alt="" loading="lazy">` : ''}${esc(r.job)}</td><td>${r.level}</td><td>${r.rlv}</td></tr>`).join('')}</tbody>
    </table>` : '';
  $('recipe-table').querySelectorAll('.rt-row').forEach(tr => tr.onclick = () => selectRecipe(+tr.dataset.id));
}

function selectRecipe(id) {
  const recipe = RECIPES.find(r => r.id === id);
  if (!recipe) return;
  const rlv = RLV[String(recipe.rlv)];
  if (!rlv) { toast('此配方缺 recipe level 資料', 'error'); return; }
  selected = { recipe, rlv };
  // 收合配方表，騰出空間
  $('picker').hidden = true;
  $('change-recipe').hidden = false;
  $('selected-bar').hidden = false;
  $('selected-bar').innerHTML = `已選配方：<b>${esc(recipe.item_name)}</b> <span class="codex-small">${esc(recipe.job)} · Lv ${rlv.class_job_level} · rlv ${recipe.rlv}</span>`;
  $('work').hidden = false;
  $('results').hidden = true;
  $('results-placeholder').hidden = false;
  $('results-placeholder').innerHTML = PH_HTML;
  refreshSelectedGear();
  $('work').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function showPicker() {
  $('picker').hidden = false;
  $('change-recipe').hidden = true;
  $('selected-bar').hidden = true;
  $('work').hidden = true;
  renderTable();
  $('pick-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function refreshSelectedGear() {
  const { recipe, rlv } = selected;
  const maxP = Math.floor(rlv.difficulty * recipe.difficulty_factor / 100);
  const maxQ = Math.floor(rlv.quality * recipe.quality_factor / 100);
  const maxD = Math.floor(rlv.durability * recipe.durability_factor / 100);
  const g = gearFor(recipe.job);
  const note = g
    ? `<span class="gear-ok">套用「${esc(g._src)}」：作業 ${g.cms} · 加工 ${g.ctrl} · CP ${g.cp} · Lv ${g.level || 100}${g.level ? '' : '（假設，未填等級）'}</span>`
    : `<span class="gear-warn">⚠ 尚未設定「${esc(recipe.job)}」數值 — <a href="#" id="goto-stats">去填角色數值 →</a></span>`;
  const icon = (ITEMS[String(recipe.item_id)] || {}).icon;
  const jico = JOB_ICON[recipe.job] ? `<img class="ri-jico" src="${ICON_BASE}${JOB_ICON[recipe.job]}" alt="">` : '';
  $('recipe-info').innerHTML = `
    ${icon ? `<img class="ri-icon" src="${ICON_BASE}${icon}" alt="">` : ''}
    <div class="ri-main">
      <div class="ri-name">${esc(recipe.item_name)}${recipe.is_expert ? ' <span class="codex-small">高難度</span>' : ''}</div>
      <div class="ri-stats"><span class="ri-stat ri-jobstat">${jico}${esc(recipe.job)}</span><span class="ri-stat">難度 <b>${maxP}</b></span><span class="ri-stat">品質 <b>${maxQ}</b></span><span class="ri-stat">耐久 <b>${maxD}</b></span></div>
      <a class="ri-mblink codex-small" href="${MARKETBOARD_BASE}#/craft/${recipe.item_id}" target="ffxiv-marketboard" rel="noopener" title="到市場板看材料多層樹 / 各材料即時價 / 成本 / 利潤（共用同一分頁）">💰 材料行情・成本 →</a>
    </div>
    <div class="ri-gear">${note}</div>`;
  const gl = $('goto-stats'); if (gl) gl.onclick = (e) => { e.preventDefault(); switchTab('stats'); };
  $('opt-target').value = ''; $('opt-target').max = maxQ; $('opt-target').placeholder = '滿(' + maxQ + ')';
  renderIngredients(recipe, maxQ);
  updateEff();
  $('solve-btn').disabled = !g;
  $('opt-adversarial').disabled = recipe.is_expert; // 高難度配方引擎不支援防球
  if (recipe.is_expert) $('opt-adversarial').checked = false;
}

// ---------- 配方原料 + HQ → 自動初始品質 ----------
function renderIngredients(recipe, maxQ) {
  const ings = INGREDIENTS[String(recipe.id)] || [];
  const mf = recipe.material_quality_factor || 0;
  const hqable = (iid) => mf > 0 && !!(ITEMS[String(iid)] && ITEMS[String(iid)].can_be_hq);
  const isCrystal = (iid) => { const nm = (ITEMS[String(iid)] || {}).name || ''; return iid < 20 || /晶簇|水晶|碎晶/.test(nm); };
  // 遊戲原順序（ingredients.json 序），但晶體移到最後（對齊遊戲製作筆記呈現）
  const ordered = [...ings.filter(([iid]) => !isCrystal(iid)), ...ings.filter(([iid]) => isCrystal(iid))];
  const anyHq = ings.some(([iid]) => hqable(iid));
  const rows = ordered.map(([iid, amount]) => {
    const it = ITEMS[String(iid)] || {};
    const name = it.name || ('#' + iid);
    const ico = it.icon ? `<img class="ing-ico" src="${ICON_BASE}${it.icon}" alt="" loading="lazy">` : '';
    const ctl = hqable(iid)
      ? `<span class="ing-hqctl">HQ <input class="ing-hq-in codex-input" data-iid="${iid}" data-amt="${amount}" type="number" min="0" max="${amount}" value="0" inputmode="numeric">/${amount}</span>`
      : '<span class="ing-na codex-small">不可 HQ</span>';
    return `<div class="ing${hqable(iid) ? ' ing--hq' : ''}">${ico}<span class="ing-name">${esc(name)}</span><span class="ing-amt">×${amount}</span>${ctl}</div>`;
  }).join('');
  $('ingredients').innerHTML = `
    <div class="ing-head"><span class="ing-group-title">配方原料</span>${anyHq ? '<button class="codex-btn codex-btn--ghost ing-allhq">全部 HQ</button>' : ''}</div>
    <div class="ing-list">${rows || '<span class="codex-small">（無原料資料）</span>'}</div>
    <div class="ing-initial" id="ing-initial"></div>`;
  $('ingredients').querySelectorAll('.ing-hq-in').forEach(inp => inp.addEventListener('input', () => updateInitial(recipe, maxQ)));
  const all = $('ingredients').querySelector('.ing-allhq');
  if (all) all.onclick = () => { $('ingredients').querySelectorAll('.ing-hq-in').forEach(i => i.value = i.dataset.amt); updateInitial(recipe, maxQ); };
  updateInitial(recipe, maxQ);
}

// ---------- 食物 / 藥水 ----------
function buildConsumables(arr) {
  const m = {};
  for (const e of arr) {
    if (!e.cm && !e.ct && !e.cp) continue; // 無作業/加工/CP 加成跳過
    (m[e.name] = m[e.name] || {})[e.is_hq ? 'hq' : 'nq'] = e;
  }
  return m;
}
function fillConsumableSelect(selId, map) {
  const lvl = (o) => ((o.hq || o.nq) || {}).level || 0;
  const names = Object.keys(map).sort((a, b) => lvl(map[b]) - lvl(map[a])); // 高等級在前
  $(selId).innerHTML = '<option value="">無</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
}
function getConsumable(selId, hqId, map) {
  const name = $(selId).value;
  if (!name || !map[name]) return null;
  return ($(hqId).checked && map[name].hq) ? map[name].hq : (map[name].nq || map[name].hq);
}
function applyConsumables(baseCms, baseCtrl, baseCp) {
  let cms = baseCms, ctrl = baseCtrl, cp = baseCp;
  for (const e of [getConsumable('food', 'food-hq', FOOD), getConsumable('potion', 'potion-hq', POTION)]) {
    if (!e) continue;
    if (e.cm) cms += Math.min(e.cm_max || Infinity, Math.floor(baseCms * e.cm / 100));
    if (e.ct) ctrl += Math.min(e.ct_max || Infinity, Math.floor(baseCtrl * e.ct / 100));
    if (e.cp) cp += Math.min(e.cp_max || Infinity, Math.floor(baseCp * e.cp / 100));
  }
  return { cms, ctrl, cp };
}
function effectiveStats(gear) {
  const sp = $('specialist').checked ? 20 : 0;
  return applyConsumables(gear.cms + sp, gear.ctrl + sp, gear.cp);
}
function updateEff() {
  if (!selected) return;
  const g = gearFor(selected.recipe.job);
  if (!g) { $('eff-stats').textContent = ''; return; }
  const e = effectiveStats(g);
  const buffed = (e.cms !== g.cms || e.ctrl !== g.ctrl || e.cp !== g.cp || $('specialist').checked);
  $('eff-stats').innerHTML = buffed ? `實際數值：作業 <b>${e.cms}</b> · 加工 <b>${e.ctrl}</b> · CP <b>${e.cp}</b>` : '';
}
function updateInitial(recipe, maxQ) {
  const mf = recipe.material_quality_factor || 0;
  let totalIlvl = 0, providedIlvl = 0;
  $('ingredients').querySelectorAll('.ing-hq-in').forEach(inp => {
    const amt = +inp.dataset.amt, hq = Math.min(Math.max(0, +inp.value || 0), amt);
    const ilvl = (ITEMS[String(inp.dataset.iid)] || {}).level || 0;
    totalIlvl += ilvl * amt; providedIlvl += ilvl * hq;
  });
  computedInitial = (mf > 0 && totalIlvl > 0) ? Math.floor(maxQ * mf * providedIlvl / totalIlvl / 100) : 0;
  const initMax = mf > 0 ? Math.floor(maxQ * mf / 100) : 0;
  const el = $('ing-initial');
  if (el) el.innerHTML = mf > 0
    ? `<div class="qline">初始品質（HQ 素材自動帶入）：<b>${computedInitial}</b> / ${maxQ}</div>` +
      `<div class="qline codex-small">最高可帶入品質：${initMax}</div>`
    : '<span class="codex-small">此配方無法用 HQ 素材提升初始品質</span>';
}

// ---------- 公式（FFXIV，已驗證；spec §4）----------
function computeSettings(recipe, rlv, gear) {
  const level = gear.level || 100;
  const eff = effectiveStats(gear);            // 含食物/藥/專家之證
  let bp = eff.cms * 10 / rlv.progress_divider + 2;
  let bq = eff.ctrl * 10 / rlv.quality_divider + 35;
  if (level <= rlv.class_job_level) {          // 等級懲罰閘 ≤（已驗證）
    bp = bp * rlv.progress_modifier / 100;
    bq = bq * rlv.quality_modifier / 100;
  }
  bp = Math.trunc(bp); bq = Math.trunc(bq);    // as u16 截斷
  const max_progress = Math.floor(rlv.difficulty * recipe.difficulty_factor / 100);
  const max_quality = Math.floor(rlv.quality * recipe.quality_factor / 100);
  const max_durability = Math.floor(rlv.durability * recipe.durability_factor / 100);
  return {
    max_cp: eff.cp, max_durability, max_progress, max_quality,
    base_progress: bp, base_quality: bq, job_level: level,
    use_manipulation: $('opt-manip').checked,
    use_heart_and_soul: $('opt-heart').checked,
    use_quick_innovation: $('opt-qi').checked,
    use_trained_eye: !recipe.is_expert && level >= rlv.class_job_level + 10, // 自動（出等級即可）
    adversarial: $('opt-adversarial').checked && !recipe.is_expert, // 高難度配方引擎不支援，強制關

    backload_progress: $('opt-backload').checked,
    stellar_steady_hand_charges: 0,
    target_quality: $('solve-mode').value === 'nq' ? 0
      : (($('opt-target').value && +$('opt-target').value > 0) ? Math.min(+$('opt-target').value, max_quality) : max_quality),
    initial_quality: Math.min(Math.max(0, computedInitial || 0), max_quality),
  };
}

// ---------- 求解 ----------
function newWorker() {
  if (worker) worker.terminate();
  worker = new Worker('worker.js', { type: 'module' });
  worker.onmessage = onWorkerMsg;
  worker.onerror = (e) => { setSolving(false); toast('求解器載入失敗：' + (e.message || ''), 'error'); };
}
function doSolve() {
  if (!selected) return;
  const gear = gearFor(selected.recipe.job);
  if (!gear) { toast('請先設定「' + selected.recipe.job + '」的角色數值', 'error'); switchTab('stats'); return; }
  const settings = computeSettings(selected.recipe, selected.rlv, gear);
  if (settings.base_progress <= 0 || settings.base_quality <= 0) { toast('作業/加工數值過低', 'error'); return; }
  setSolving(true);
  if (!worker) newWorker();
  worker.postMessage({ cmd: 'solve', input: settings });
}
function onWorkerMsg(e) {
  setSolving(false);
  if (!e.data.ok) { toast('無法求解：' + (e.data.error || ''), 'error'); return; }
  render(e.data.result, true);
}
function cancelSolve() { newWorker(); setSolving(false); toast('已取消求解', 'warn'); }
function setSolving(on) {
  $('solve-btn').hidden = on;
  $('cancel-btn').hidden = !on;
  if (on) {
    $('results').hidden = true;
    $('results-placeholder').hidden = false;
    $('results-placeholder').innerHTML = '<span class="codex-spinner"></span> 求解中…';
  } else if (!$('results') || $('results').hidden) {
    $('results-placeholder').innerHTML = PH_HTML; // 取消/錯誤結束 → 還原提示（成功時 render 會隱藏）
  }
  $('solve-status').innerHTML = on ? '<span class="codex-spinner"></span> 求解中…（高難度配方可能數秒）' : '';
}

// ---------- 呈現 ----------
// HQ 高品質率：品質% → HQ%。表逐格移植自 ffxiv-crafting 7.4.5 data::high_quality_table（Tnze，權威遊戲表）— 勿自改。
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
function render(r, scroll = true) {
  $('results-placeholder').hidden = true;
  $('results').hidden = false;
  const pct = (v, m) => m > 0 ? Math.min(100, Math.round(v / m * 100)) : 0;
  const hq = r.final_quality >= r.max_quality && r.max_quality > 0;
  const itemHqable = !!(ITEMS[String(selected && selected.recipe.item_id)] || {}).can_be_hq;
  const hqp = itemHqable ? hqPercent(r.final_quality, r.max_quality) : null;
  const errLine = r.error ? `<div class="sum-err codex-small">⚠ 第 ${r.error_step + 1} 步無法執行（${r.error}）— 之後略過</div>` : '';
  $('result-summary').innerHTML = `
    <div class="sum-row">
      <span class="codex-badge ${r.complete ? 'codex-badge--success' : 'codex-badge--danger'}">${r.complete ? '✓ 可完成' : '✗ 未完成'}</span>
      <span class="codex-badge ${hq ? 'codex-badge--gold' : ''}">品質 ${pct(r.final_quality, r.max_quality)}%${hq ? ' · 滿' : ''}</span>
      ${hqp != null ? `<span class="codex-badge codex-badge--gold" title="成品高品質(HQ)機率">HQ ${hqp}%</span>` : ''}
      <span class="sum-meta">${r.step_count} 步 · ${r.total_time} 秒</span>
    </div>
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
  if (scroll) $('results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function bar(label, v, m, pct) {
  return `<div class="bar-row"><span class="bar-label">${label}</span>
    <div class="codex-progress"><div class="codex-progress__bar" style="width:${pct(v, m)}%"></div></div>
    <span class="bar-num codex-small">${v}/${m}</span></div>`;
}
function actionName(v) { return (ACTIONS[v] && ACTIONS[v].nameTc) || v; }
function actImg(v) { const a = ACTIONS[v]; return (a && a.icon) ? `<img class="act-ico" src="${ICON_BASE}${a.icon}" alt="" loading="lazy">` : ''; }
function actionChip(s) {
  return `<div class="chip" title="${esc(actionName(s.action))}">${actImg(s.action)}<span class="chip-name codex-xs">${esc(actionName(s.action))}</span></div>`;
}
function renderMacro(steps) {
  const lines = steps.map(s => `/ac "${actionName(s.action)}" <wait.${s.time}>`);
  const macros = [];
  if (lines.length <= 15) macros.push(lines.slice());
  else for (let i = 0; i < lines.length; i += 14) {
    const c = lines.slice(i, i + 14);
    c.push(`/echo 第 ${macros.length + 1} 段完成 <se.${(macros.length % 8) + 1}>`);
    macros.push(c);
  }
  $('macro').innerHTML = macros.map((m, i) =>
    `<div class="macro-block">
       <div class="macro-head"><span class="codex-small">巨集 ${i + 1} / ${macros.length}（${m.length} 行）</span>
         <button class="codex-btn codex-btn--ghost copy-btn" data-i="${i}">複製</button></div>
       <textarea class="macro-text codex-textarea" rows="${m.length}" readonly>${esc(m.join('\n'))}</textarea>
     </div>`).join('');
  $('macro').querySelectorAll('.copy-btn').forEach(b => b.onclick = () =>
    navigator.clipboard.writeText(macros[+b.dataset.i].join('\n'))
      .then(() => toast('✓ 已複製巨集', 'ok'), () => toast('複製失敗', 'error')));
}

// ---------- 分頁 ----------
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.tab === name));
  $('tab-solve').hidden = name !== 'solve';
  $('tab-stats').hidden = name !== 'stats';
}
function updateHint() { $('first-run-hint').hidden = anyGear(); }

// ---------- utils ----------
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function toast(msg, v) { (window.FFXIVToast && window.FFXIVToast.show ? window.FFXIVToast.show : (m) => console.log(m))(msg, v); }

// ---------- init ----------
(async function () {
  try {
  await loadData();
  loadGear();
  renderChips();
  renderGearsets();
  renderTable();
  updateHint();
  // 深連結：?recipe=<id> 或 ?item=<id> → 自動選配方（marketboard「求解手法」鈕用）
  const dlp = new URLSearchParams(location.search);
  const dlRecipe = +dlp.get('recipe') || 0, dlItem = +dlp.get('item') || 0;
  if (dlRecipe && RECIPES.some(r => r.id === dlRecipe)) selectRecipe(dlRecipe);
  else if (dlItem) { const r = RECIPES.find(r => r.item_id === dlItem); if (r) selectRecipe(r.id); }
  fillConsumableSelect('food', FOOD);
  fillConsumableSelect('potion', POTION);
  ['food', 'potion', 'food-hq', 'potion-hq', 'specialist'].forEach(id => $(id).addEventListener('change', updateEff));
  $('recipe-search').addEventListener('input', renderTable);
  $('level-filter').addEventListener('change', renderTable);
  $('rlv-filter').addEventListener('input', renderTable);
  $('solve-btn').addEventListener('click', doSolve);
  $('cancel-btn').addEventListener('click', cancelSolve);
  $('change-recipe').addEventListener('click', showPicker);
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => switchTab(t.dataset.tab));
  newWorker(); // 預熱
  } catch (e) {
    console.error('[crafter] 初始化失敗:', e);
    const main = document.querySelector('main');
    if (main) main.insertAdjacentHTML('afterbegin',
      '<div class="codex-tablet panel" style="margin:16px 0;color:var(--color-warn)">⚠ 資料載入失敗，請重新整理頁面或稍後再試。</div>');
  }
})();

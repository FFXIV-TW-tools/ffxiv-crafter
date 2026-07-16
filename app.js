// 配方製作求解器 — 分頁式：配方求解（職業+等級瀏覽）/ 角色數值（各職裝備）。
// 公式（已對抗驗證，spec §4）在此算，WASM worker 只跑引擎。
const $ = (id) => document.getElementById(id);
// icon URL — xivapi v2 asset CDN（v1 xivapi.com 圖庫停更，7.5 新 icon 404；權威寫法＝marketboard modules/icon.js，此為 v1 路徑輸入版）
function iconUrl(p) {
  const m = /^\/i\/(\d{6})\/(\d{6})\.png$/.exec(p || '');
  return m ? `https://v2.xivapi.com/api/asset/ui/icon/${m[1]}/${m[2]}_hr1.tex?format=png` : '';
}
// 跨工具深連結：到 marketboard 看材料樹/行情/成本（dev 走 :8774 統一外部站，prod 走 pages.dev）
const MARKETBOARD_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:8774/ffxiv-tw-marketboard/'
  : 'https://ffxiv-tw-marketboard.pages.dev/';
// 跨工具深連結：求解巨集帶到 macro-builder 匯入（?import= 收端契約見 external/_NEW-TOOL.md；波次 2）
const MACRO_BUILDER_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:8774/ffxiv-tw-macro-builder/'
  : 'https://ffxiv-tw-macro-builder.pages.dev/';
// base64url（UTF-8 安全：中文必先 TextEncoder 轉 bytes，不能直接 btoa）
function b64urlEncode(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const DOH = ['木工', '鍛造', '甲冑', '金工', '皮革', '裁縫', '鍊金', '烹調']; // 8 DoH（= recipe.job 值，依製作職業列序）
// DoH 職業 icon：classjob_id 8–15 → icon_id 62100+id（同 jobs.json framed icon 模式）
const JOB_ICON = {
  '木工': '/i/062000/062108.png', '鍛造': '/i/062000/062109.png', '甲冑': '/i/062000/062110.png',
  '金工': '/i/062000/062111.png', '皮革': '/i/062000/062112.png', '裁縫': '/i/062000/062113.png',
  '鍊金': '/i/062000/062114.png', '烹調': '/i/062000/062115.png',
};
const GEAR_KEY = 'ffxiv-crafter-gearsets-v1';
const PH_HTML = '設定完成後按「求解最佳手法」，<br>巨集與手法序列即會顯示在結果區。';
const NAME_COLLATOR = new Intl.Collator('zh-Hant'); // 預建 collator，避免每次比較重建（快於逐次 localeCompare(...,'zh-Hant')）

let RECIPES = [], RLV = {}, ACTIONS = {}, RINDEX = [], ITEMS = {}, INGREDIENTS = {};
let FOOD = {}, POTION = {};  // name → { nq, hq }
let gearsets = {};      // { 職業: {level,cms,ctrl,cp} }
let jobFilter = '';     // '' = 全部
let selected = null;    // { recipe, rlv }
let computedInitial = 0; // 由 HQ 原料勾選算出的初始品質
let worker = null;
let solveClock = null;  // 求解計時器（interval）：每秒更新已耗時；≥60s 升級可取消軟提示（不殺 worker，正常長求解仍在跑）

// ---------- 資料 ----------
async function loadData() {
  const fetchJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url} HTTP ${r.status}`); return r.json(); }; // HTTP 錯誤明確降級（非把 404 頁當 JSON 硬 parse）
  // 選配資料（食物/藥水）非必要 → 失敗只降級該功能、不拖垮整站；回傳 [] 讓 buildConsumables 安全略過
  const fetchOpt = async (url) => { try { return await fetchJson(url); } catch (e) { console.warn('[crafter] 選配資料載入失敗，略過:', url, e); return []; } };
  const [recipes, rlv, actions, items, ingredients] = await Promise.all([
    fetchJson('data/recipes.json'),
    fetchJson('data/recipe_levels.json'),
    fetchJson('data/craft-actions.json'),
    fetchJson('data/items.json'),
    fetchJson('data/ingredients.json'),
  ]);
  const [meals, medicine] = await Promise.all([fetchOpt('data/meals.json'), fetchOpt('data/medicine.json')]);
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
let gearSaveWarned = false;
function saveGear() {
  try { localStorage.setItem(GEAR_KEY, JSON.stringify(gearsets)); }
  catch (e) {                                   // 無痕/私密模式或配額滿：至少 warn（禁靜默吞），並一次性提醒玩家設定不會保存
    console.warn('[crafter] 角色數值儲存失敗（可能是無痕模式）:', e);
    if (!gearSaveWarned) { gearSaveWarned = true; toast('無法保存角色數值（可能是無痕/私密模式），本次設定重整後會遺失', 'warn'); }
  }
}
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
  (gearsets[job] = gearsets[job] || {})[f] = +e.target.value || 0;
  saveGear(); updateHint();
  if (selected) refreshSelectedGear();
  invalidateResults(); // 改角色數值 → 舊巨集過期
}

// ---------- 職業 chips + 配方表 ----------
function renderChips() {
  $('job-chips').innerHTML = ['', ...DOH].map(j =>
    `<button class="job-chip${j === jobFilter ? ' is-active' : ''}" data-job="${esc(j)}">${j && JOB_ICON[j] ? `<img src="${iconUrl(JOB_ICON[j])}" alt="" loading="lazy">` : ''}${j || '全部'}</button>`).join('');
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
  list.sort((a, b) => b.level - a.level || NAME_COLLATOR.compare(a.name, b.name));
  const CAP = 120;
  const shown = list.slice(0, CAP);
  $('recipe-count').textContent = total
    ? `${total} 個配方${total > CAP ? `（顯示前 ${CAP}，請用職業／等級／搜尋縮小）` : ''}`
    : (jobFilter || range || q ? '無符合配方' : '');
  $('recipe-table').innerHTML = shown.length ? `
    <table class="rt">
      <thead><tr><th>名稱</th><th>職業</th><th>Lv</th><th>配方等級</th></tr></thead>
      <tbody>${shown.map(r =>
        `<tr class="rt-row${selected && selected.recipe.id === r.id ? ' is-sel' : ''}" data-id="${r.id}" tabindex="0"><td class="rt-name">${r.icon ? `<img class="rt-ico" src="${iconUrl(r.icon)}" alt="" loading="lazy">` : ''}${esc(r.name)}</td><td class="rt-job">${JOB_ICON[r.job] ? `<img class="rt-jico" src="${iconUrl(JOB_ICON[r.job])}" alt="" loading="lazy">` : ''}${esc(r.job)}</td><td>${r.level}</td><td>${r.rlv}</td></tr>`).join('')}</tbody>
    </table>` : '';
  $('recipe-table').querySelectorAll('.rt-row').forEach(tr => {
    const pick = () => selectRecipe(+tr.dataset.id);
    tr.onclick = pick;
    tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }; // 鍵盤可選（Space 防捲動）
  });
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
// 配方三上限（進展/品質/耐久）：顯示（refreshSelectedGear）與求解（computeSettings）共用同一算式，防兩處漂移（CQ-01）
function recipeMaxes(recipe, rlv) {
  return {
    max_progress: Math.floor(rlv.difficulty * recipe.difficulty_factor / 100),
    max_quality: Math.floor(rlv.quality * recipe.quality_factor / 100),
    max_durability: Math.floor(rlv.durability * recipe.durability_factor / 100),
  };
}
function refreshSelectedGear() {
  const { recipe, rlv } = selected;
  const { max_progress: maxP, max_quality: maxQ, max_durability: maxD } = recipeMaxes(recipe, rlv);
  const g = gearFor(recipe.job);
  const note = g
    ? `<span class="gear-ok">套用「${esc(g._src)}」：作業 ${g.cms} · 加工 ${g.ctrl} · CP ${g.cp} · Lv ${Number(g.level) || 100}${g.level ? '' : '（假設，未填等級）'}</span>`
    : `<span class="gear-warn">⚠ 尚未設定「${esc(recipe.job)}」數值 — <a href="#" id="goto-stats">去填角色數值 →</a></span>`;
  const icon = (ITEMS[String(recipe.item_id)] || {}).icon;
  const jico = JOB_ICON[recipe.job] ? `<img class="ri-jico" src="${iconUrl(JOB_ICON[recipe.job])}" alt="">` : '';
  $('recipe-info').innerHTML = `
    ${icon ? `<img class="ri-icon" src="${iconUrl(icon)}" alt="">` : ''}
    <div class="ri-main">
      <div class="ri-name">${esc(recipe.item_name)}${recipe.is_expert ? ' <span class="codex-small">高難度</span>' : ''}</div>
      <div class="ri-stats"><span class="ri-stat ri-jobstat">${jico}${esc(recipe.job)}</span><span class="ri-stat">難度 <b>${maxP}</b></span><span class="ri-stat">品質 <b>${maxQ}</b></span><span class="ri-stat">耐久 <b>${maxD}</b></span></div>
      <a class="ri-mblink codex-small" href="${MARKETBOARD_BASE}#/craft/${recipe.item_id}" target="ffxiv-marketboard" title="到市場板看材料多層樹 / 各材料即時價 / 成本 / 利潤（共用同一分頁）">💰 材料行情・成本 →</a>
      <button id="add-to-list" class="ri-addlist codex-small" type="button" title="加進「製造清單」分頁，彙總素材總需求">📋 加入製造清單</button>
    </div>
    <div class="ri-gear">${note}</div>`;
  const gl = $('goto-stats'); if (gl) gl.onclick = (e) => { e.preventDefault(); switchTab('stats'); };
  const ab = $('add-to-list'); if (ab) ab.onclick = () => { if (globalThis.CraftList) globalThis.CraftList.add(recipe.id); };
  $('opt-target').value = ''; $('opt-target').max = maxQ; $('opt-target').placeholder = '滿(' + maxQ + ')';
  $('opt-target').disabled = $('solve-mode').value === 'nq'; // NQ 模式目標品質欄停用（與 solve-mode 監聽一致）
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
    const ico = it.icon ? `<img class="ing-ico" src="${iconUrl(it.icon)}" alt="" loading="lazy">` : '';
    const ctl = hqable(iid)
      ? `<span class="ing-hqctl">HQ <input class="ing-hq-in codex-input" data-iid="${iid}" data-amt="${amount}" type="number" min="0" max="${amount}" value="0" inputmode="numeric">/${amount}</span>`
      : '<span class="ing-na codex-small">不可 HQ</span>';
    return `<div class="ing${hqable(iid) ? ' ing--hq' : ''}">${ico}<span class="ing-name">${esc(name)}</span><span class="ing-amt">×${amount}</span>${ctl}</div>`;
  }).join('');
  $('ingredients').innerHTML = `
    <div class="ing-head"><span class="ing-group-title">配方原料</span>${anyHq ? '<button class="codex-btn codex-btn--ghost ing-allhq">全部 HQ</button>' : ''}</div>
    <div class="ing-list">${rows || '<span class="codex-small">（無原料資料）</span>'}</div>
    <div class="ing-initial" id="ing-initial"></div>`;
  $('ingredients').querySelectorAll('.ing-hq-in').forEach(inp => inp.addEventListener('input', () => { updateInitial(recipe, maxQ); invalidateResults(); }));
  const all = $('ingredients').querySelector('.ing-allhq');
  if (all) all.onclick = () => { $('ingredients').querySelectorAll('.ing-hq-in').forEach(i => i.value = i.dataset.amt); updateInitial(recipe, maxQ); invalidateResults(); };
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
  const spec = $('specialist').checked;
  const sp = spec ? 20 : 0;                    // 專家之證：作業 +20・加工 +20
  return applyConsumables(gear.cms + sp, gear.ctrl + sp, gear.cp + (spec ? 15 : 0)); // 專家之證：CP +15（Soul of the Crafter 專家狀態加成）
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
  const { max_progress, max_quality, max_durability } = recipeMaxes(recipe, rlv);
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
  worker.onerror = () => {                    // module/worker 載入失敗
    worker = null;                            // 設 null → 下次 doSolve 的 if(!worker) 重建，不卡在壞掉的 worker
    stopSolveClock();
    setSolving(false);
    toast('求解器載入失敗，請重新整理頁面後再試', 'error');
  };
}
function doSolve() {
  if (!selected) return;
  const gear = gearFor(selected.recipe.job);
  if (!gear) { toast('請先設定「' + selected.recipe.job + '」的角色數值', 'error'); switchTab('stats'); return; }
  const settings = computeSettings(selected.recipe, selected.rlv, gear);
  if (settings.base_progress <= 0 || settings.base_quality <= 0) { toast('作業/加工數值過低', 'error'); return; }
  setSolving(true);
  if (!worker) newWorker();
  worker.postMessage({ input: settings }); // worker 只跑 solve（simulate 尚未接 UI），無需 cmd dispatch 欄
  startSolveClock();
}
// 求解計時：每秒更新已耗時（求解跑在 worker，主執行緒空閒故計數不凍結）；≥60s 升級為可取消軟提示。
// 軟提示不殺 worker（正常長求解仍在跑）；成功/取消/載入失敗三路徑均 stopSolveClock（別讓計數殘留）。
function startSolveClock() {
  stopSolveClock();
  const t0 = Date.now();
  const paint = () => {
    if ($('cancel-btn').hidden) { stopSolveClock(); return; }  // 已結束的保險
    const secs = Math.floor((Date.now() - t0) / 1000);
    const overtime = secs >= 60 ? ' — 仍在計算中，可繼續等待或按「取消」' : '';
    $('solve-status').innerHTML = `<span class="codex-spinner"></span> 求解中… 已耗時 ${secs} 秒（高難度配方可能數十秒）${overtime}`;
  };
  paint();
  solveClock = setInterval(paint, 1000);
}
function stopSolveClock() { if (solveClock) { clearInterval(solveClock); solveClock = null; } }
// SolverException（raphael）3 變體 + serde 反序列化錯誤 → 繁中人話 + 下一步
function solveErrorMessage(raw) {
  const s = String(raw || '');
  if (s === 'NoSolution') return '以目前數值無法完成此配方 — 試著提升作業精度／加工精度／等級、開啟食物藥水或專家之證，或降低目標品質後再求解。';
  if (s === 'Interrupted') return '求解被中斷，請再試一次。';
  if (/internal error|bug report/i.test(s)) return '求解器內部錯誤，請稍後再試（技術細節已記錄於主控台）。';
  if (/invalid value|expected u\d|integer/i.test(s)) return '角色數值超出合理範圍 — 請確認作業精度／加工精度／CP／等級的數字是否正確。';
  return '求解失敗，請調整設定後再試一次。';
}
function onWorkerMsg(e) {
  stopSolveClock();
  setSolving(false);
  if (!e.data.ok) {
    console.warn('[crafter] 求解失敗:', e.data.error);   // 技術原文進主控台，不丟給玩家
    toast(solveErrorMessage(e.data.error), 'error');
    return;
  }
  try {
    render(e.data.result, true);
  } catch (err) {                             // WASM Output 契約漂移等 → 有可見降級而非空白
    console.error('[crafter] 結果渲染失敗:', err);
    toast('結果解析失敗，請重新求解', 'error');
    $('results').hidden = true;
    $('results-placeholder').hidden = false;
    $('results-placeholder').innerHTML = PH_HTML;
  }
}
function cancelSolve() { stopSolveClock(); newWorker(); setSolving(false); toast('已取消求解', 'warn'); $('solve-btn').focus(); } // 取消後移焦回求解鈕（鍵盤流暢）
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
  $('solve-status').innerHTML = on ? '<span class="codex-spinner"></span> 求解中…（高難度配方可能數十秒）' : '';
}
// 已顯示的求解結果在任一求解輸入變更後即過期 → 隱藏舊結果避免複製到與當前設定不符的巨集（白做一爐）
function invalidateResults() {
  if (!$('results') || $('results').hidden) return; // 尚無結果就不動
  $('results').hidden = true;
  $('results-placeholder').hidden = false;
  $('results-placeholder').innerHTML = '⚠ 設定已變更，請重新求解';
  $('solve-status').innerHTML = '';
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
function bar(label, v, m, pct) {
  return `<div class="bar-row"><span class="bar-label">${label}</span>
    <div class="codex-progress"><div class="codex-progress__bar" style="width:${pct(v, m)}%"></div></div>
    <span class="bar-num codex-small">${v}/${m}</span></div>`;
}
function actionName(v) { return (ACTIONS[v] && ACTIONS[v].nameTc) || v; }
function actImg(v) { const a = ACTIONS[v]; return (a && a.icon) ? `<img class="act-ico" src="${iconUrl(a.icon)}" alt="" loading="lazy">` : ''; }
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
  $('macro').querySelectorAll('.copy-btn').forEach(b => b.onclick = () => copyText(macros[+b.dataset.i].join('\n')));
}

// ---------- 分頁 ----------
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => {
    const on = t.dataset.tab === name;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false'); // 同步分頁選中狀態給螢幕閱讀器
  });
  $('tab-solve').hidden = name !== 'solve';
  $('tab-stats').hidden = name !== 'stats';
  $('tab-list').hidden = name !== 'list';
}
function updateHint() { $('first-run-hint').hidden = anyGear(); }

// ---------- utils ----------
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); } // 含單引號 → 無例外通用轉義（防 attribute 用單引號時破格）
function toast(msg, v) {
  if (window.FFXIVToast && window.FFXIVToast.show) { window.FFXIVToast.show(msg, v); return; }
  console.log(`[toast:${v || 'info'}] ${msg}`);            // codex CDN 未載時的降級：至少留主控台紀錄
  if (v === 'error' || v === 'warn') alert(msg);           // 重要訊息用原生提示 → CDN toast 未載時玩家仍看得到
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
// 複製：優先 async clipboard；行動 webview / 非安全脈絡（http、file://）無 navigator.clipboard → execCommand 降級
function copyText(text) {
  if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text).then(() => toast('✓ 已複製巨集', 'ok'), () => fallbackCopy(text)); return; }
  fallbackCopy(text);
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-9999px'; ta.setAttribute('readonly', '');
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { console.warn('[crafter] execCommand copy 失敗:', e); }
  document.body.removeChild(ta);
  toast(ok ? '✓ 已複製巨集' : '複製失敗，請長按巨集文字手動複製', ok ? 'ok' : 'error');
}

// ---------- init ----------
(async function () {
  try {
  newWorker(); // 預熱 WASM — 提前於 loadData，讓 WASM download 與資料 fetch 並行（縮短最壞情況首解等待）
  await loadData();
  loadGear();
  renderChips();
  renderGearsets();
  renderTable();
  updateHint();
  // 深連結：?recipe=<id> 或 ?item=<id> → 自動選配方（marketboard「求解手法」鈕用）
  const dlp = new URLSearchParams(location.search);
  const dlRecipe = +dlp.get('recipe') || 0, dlItem = +dlp.get('item') || 0;
  const dlByItem = dlItem ? RECIPES.find(r => r.item_id === dlItem) : null;
  if (dlRecipe && RECIPES.some(r => r.id === dlRecipe)) selectRecipe(dlRecipe);
  else if (dlByItem) selectRecipe(dlByItem.id);
  else if (dlRecipe || dlItem) toast('找不到深連結指定的配方，請用搜尋手動選擇', 'warn'); // 從 marketboard 點過來但該物品無配方 → 給提示不迷路（ux-3）
  fillConsumableSelect('food', FOOD);
  fillConsumableSelect('potion', POTION);
  ['food', 'potion', 'food-hq', 'potion-hq', 'specialist'].forEach(id => $(id).addEventListener('change', () => { updateEff(); invalidateResults(); }));
  // 任一求解輸入變更 → 舊結果過期（gate：集中失效，涵蓋程式化改值與 gear 傳播）
  ['opt-manip', 'opt-heart', 'opt-qi', 'opt-backload', 'opt-adversarial'].forEach(id => $(id).addEventListener('change', invalidateResults));
  $('opt-target').addEventListener('input', () => {
    const el = $('opt-target'), max = +el.max || 0;
    if (max && +el.value > max) el.value = max; // 超配方品質上限即時回填 maxQ（求解本就 clamp，先讓 UI 誠實一致，ux-5）
    invalidateResults();
  });
  $('solve-mode').addEventListener('change', (e) => { $('opt-target').disabled = e.target.value === 'nq'; invalidateResults(); }); // NQ 模式不吃目標品質 → 停用該欄
  const debouncedRender = debounce(renderTable, 180); // 搜尋/rlv 逐字輸入不必每鍵重繪 11803 筆
  $('recipe-search').addEventListener('input', debouncedRender);
  $('level-filter').addEventListener('change', renderTable);
  $('rlv-filter').addEventListener('input', debouncedRender);
  $('solve-btn').addEventListener('click', doSolve);
  $('cancel-btn').addEventListener('click', cancelSolve);
  $('change-recipe').addEventListener('click', showPicker);
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => switchTab(t.dataset.tab));
  // 製造清單（crafting-list.js classic script，先於本 module 執行）：注入依賴後接手 #craft-list 分頁
  if (globalThis.CraftList) globalThis.CraftList.init({ $, esc, iconUrl, RECIPES, ITEMS, INGREDIENTS, selectRecipe, switchTab, toast });
  } catch (e) {
    console.error('[crafter] 初始化失敗:', e);
    $('recipe-table').innerHTML = ''; // 清掉首載「載入中…」佔位，避免與失敗橫幅並存殘留轉圈
    const main = document.querySelector('main');
    if (main) main.insertAdjacentHTML('afterbegin',
      '<div class="codex-tablet panel" style="margin:16px 0;color:var(--color-warn)">⚠ 資料載入失敗，請重新整理頁面或稍後再試。</div>');
  }
})();

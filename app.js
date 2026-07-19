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
// marketboard 深連結 helper（DRY：base 一處；item_id≠recipe id 分清）。named target 共用分頁、刻意不加 rel=noopener＝生態內互跳慣例（見 renderMacro 註解；全 repo noopener 慣例待 Owner 拍板＝BACKLOG B-006）。
const mbUrl = (route, id) => { const n = Number(id); return Number.isFinite(n) && n > 0 ? `${MARKETBOARD_BASE}#/${route}/${n}` : '#'; }; // 型別收斂+防壞連結（非正整數→'#'，禁 #/item/undefined）
const mbItem = (iid) => mbUrl('item', iid);       // 查價 / 歷史 / 來源
const mbCraft = (itemId) => mbUrl('craft', itemId); // BOM 樹 / 每材料價 / 利潤試算
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
let selected = null;    // { recipe, rlv }
let openedFromList = false; // 由製造清單「前往求解」進入 → 結果區顯示「← 回製造清單」；瀏覽/深連結進入則不顯示（避免幽靈導覽）
let computedInitial = 0; // 由 HQ 原料勾選算出的初始品質
// worker / solveClock 已移入 app-solve.js（該層私有狀態）

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
    category: (ITEMS[String(r.item_id)] && ITEMS[String(r.item_id)].category) || '', // 道具種類（繁中）→ 配方名副行說明
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

// ---------- 職業 chips + 配方表（已抽到 app-browse.js：globalThis.CraftBrowse；jobFilter 為該層私有狀態）----------
// proxy：既有呼叫點 / 事件綁定 / CraftList onChange 沿用同名，實體在 CraftBrowse（init 注入依賴：getter 取 live RINDEX/selected）。
// 抽出理由＝app.js >500 觸拆分閘門（B-007，Owner 核可）；配方瀏覽表為內聚獨立單元（jobFilter 私有、對外僅注入依賴溝通）。
// 用 function 宣告（有 hoisting、貼近原碼契約）→ 避免 const arrow 的 TDZ：日後若在定義前呼叫不會 ReferenceError（對抗審 grok F4）
function renderChips() { return globalThis.CraftBrowse.renderChips(); }
function renderTable() { return globalThis.CraftBrowse.renderTable(); }
function markListState() { return globalThis.CraftBrowse.markListState(); }

function selectRecipe(id, fromList) {
  const recipe = RECIPES.find(r => r.id === id);
  if (!recipe) return false;
  const rlv = RLV[String(recipe.rlv)];
  if (!rlv) { toast('此配方缺 recipe level 資料', 'error'); return false; }   // 回傳成功與否 → 呼叫端（goSolve）失敗時不強制切頁
  selected = { recipe, rlv };
  openedFromList = !!fromList;   // 從製造清單「前往求解」進入 → 結果區顯示「← 回製造清單」；瀏覽/深連結進入為 false
  // 收合配方表；返回控件＝右上「← 返回配方列表」鈕（唯一可點）。此處只放誠實的「當前位置」狀態，不做「配方瀏覽›」假 nav 麵包屑（死 span 誤導可點）。
  $('picker').hidden = true;
  $('change-recipe').hidden = false;
  $('selected-bar').hidden = false;
  $('selected-bar').innerHTML = `目前配方：<b class="sb-cur">${esc(recipe.item_name)}</b> <span class="codex-small">${esc(recipe.job)} · Lv ${rlv.class_job_level} · rlv ${recipe.rlv}</span>`;
  $('work').hidden = false;
  $('results').hidden = true;
  $('results-placeholder').hidden = false;
  $('results-placeholder').innerHTML = PH_HTML;
  refreshSelectedGear();
  $('work').scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}
function showPicker() {
  openedFromList = false;   // 返回瀏覽即結束「從清單進入」情境 → 下次選配方不殘留「← 回製造清單」
  $('picker').hidden = false;
  $('change-recipe').hidden = true;
  $('selected-bar').hidden = true;
  $('work').hidden = true;
  renderTable();  // 篩選/搜尋值保留在 input 上、不清（返回不重置瀏覽狀態）
  $('pick-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const back = $('recipe-table').querySelector('.rt-row.is-sel') || $('recipe-search'); // 還焦：優先原選中列、否則搜尋框（a11y 返回焦點不遺失）
  if (back && back.focus) back.focus({ preventScroll: true });
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
  // 動作列：統一 ghost 按鈕群（設計系統，取代自寫 link-button）。marketboard 連結只在有 item_id 時出（防壞連結）。
  const mbLink = recipe.item_id
    ? `<a class="codex-btn codex-btn--ghost" href="${mbCraft(recipe.item_id)}" target="ffxiv-marketboard" title="到市場板看材料多層樹 / 各材料即時價 / 成本 / 利潤（共用同一分頁）">💰 材料樹與利潤</a>`
    : '';
  const backToList = openedFromList
    ? `<button id="back-to-list" class="codex-btn codex-btn--ghost" type="button" title="回到製造清單分頁">← 回製造清單</button>`
    : '';
  $('recipe-info').innerHTML = `
    ${icon ? `<img class="ri-icon" src="${iconUrl(icon)}" alt="">` : ''}
    <div class="ri-main">
      <div class="ri-name">${esc(recipe.item_name)}${recipe.is_expert ? ' <span class="codex-small">高難度</span>' : ''}</div>
      <div class="ri-stats"><span class="ri-stat ri-jobstat">${jico}${esc(recipe.job)}</span><span class="ri-stat">難度 <b>${maxP}</b></span><span class="ri-stat">品質 <b>${maxQ}</b></span><span class="ri-stat">耐久 <b>${maxD}</b></span></div>
      <div class="ri-actions">
        <button id="add-to-list" class="codex-btn codex-btn--ghost" type="button" title="加進「製造清單」分頁，彙總素材總需求">📋 加入製造清單</button>
        ${mbLink}
        ${backToList}
      </div>
    </div>
    <div class="ri-gear">${note}</div>`;
  const gl = $('goto-stats'); if (gl) gl.onclick = (e) => { e.preventDefault(); switchTab('stats', true); };
  const ab = $('add-to-list'); if (ab) ab.onclick = () => { if (typeof globalThis.CraftList?.add === 'function') globalThis.CraftList.add(recipe.id); };
  // 回清單：switchTab('list') 已集中清 openedFromList + 收返回鈕（見 switchTab），此處只需切頁+移焦
  const bl = $('back-to-list'); if (bl) bl.onclick = () => switchTab('list', true);
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
    // 素材名掛 marketboard 查價/來源深連結（DRY mbItem）；晶體/水晶/晶簇亦可上市場板交易，故一律連（isCrystal 僅用於排序殿後）
    const nameHtml = `<a class="ing-name ing-name--link" href="${mbItem(iid)}" target="ffxiv-marketboard" title="到市場板查「${esc(name)}」價格與來源（共用同一分頁）">${esc(name)}</a>`;
    const ctl = hqable(iid)
      ? `<span class="ing-hqctl">HQ <input class="ing-hq-in codex-input" data-iid="${iid}" data-amt="${amount}" type="number" min="0" max="${amount}" value="0" inputmode="numeric">/${amount}</span>`
      : '<span class="ing-na codex-small">不可 HQ</span>';
    return `<div class="ing${hqable(iid) ? ' ing--hq' : ''}">${ico}${nameHtml}<span class="ing-amt">×${amount}</span>${ctl}</div>`;
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

// ---------- 求解（已抽到 app-solve.js：globalThis.CraftSolve；worker/solveClock 為該層私有狀態）----------
// invalidateResults 留此：被 gear/原料/求解輸入等多處外部呼叫，且求解編排層內部不呼叫它。
// 已顯示的求解結果在任一求解輸入變更後即過期 → 隱藏舊結果避免複製到與當前設定不符的巨集（白做一爐）
function invalidateResults() {
  if (!$('results') || $('results').hidden) return; // 尚無結果就不動
  $('results').hidden = true;
  $('results-placeholder').hidden = false;
  $('results-placeholder').innerHTML = '⚠ 設定已變更，請重新求解';
  $('solve-status').innerHTML = '';
}

// ---------- 呈現（已抽到 app-render.js：globalThis.CraftRender；init 注入 getter 取 live 狀態）----------

// ---------- 分頁 ----------
function switchTab(name, moveFocus) {
  // 離開求解分頁即結束「從清單進入」情境 → 集中清 openedFromList + 收起殘留返回鈕（涵蓋所有出口：頂部 tab / 返回鈕 / 回清單鈕，修頂部 tab 洩漏）
  if (name !== 'solve') { openedFromList = false; const b = $('back-to-list'); if (b) b.hidden = true; }
  let activeTab = null;
  document.querySelectorAll('#main-tabs .codex-tab').forEach(t => {  // scope 到本工具 tablist，勿劫持 portal 共用 .codex-tab（header/settings 若用同 class）
    const on = t.dataset.tab === name;
    if (on) activeTab = t;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false'); // 同步分頁選中狀態給螢幕閱讀器
    t.tabIndex = on ? 0 : -1;                                // roving tabindex（tablist 標準：只有選中 tab 進 Tab 序）
  });
  $('tab-solve').hidden = name !== 'solve';
  $('tab-stats').hidden = name !== 'stats';
  $('tab-list').hidden = name !== 'list';
  if (moveFocus && activeTab) activeTab.focus(); // 程式化切頁移焦到選中 tab，避免焦點卡在被隱藏的按鈕（鍵盤/SR a11y）
}
// tablist 鍵盤導覽（ARIA APG 水平：←→ 切換 + Home/End；焦點隨切換移動）
function onTabKey(e) {
  const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
  const tabs = [...document.querySelectorAll('#main-tabs .codex-tab')];
  const i = tabs.indexOf(e.target);
  if (i < 0) return;
  let j;
  if (dir != null) j = (i + dir + tabs.length) % tabs.length;
  else if (e.key === 'Home') j = 0;
  else if (e.key === 'End') j = tabs.length - 1;
  else return;
  e.preventDefault();
  switchTab(tabs[j].dataset.tab);
  tabs[j].focus();
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
function copyText(text, okMsg = '✓ 已複製') {   // okMsg 泛化：巨集/素材清單共用同一 clipboard fallback（DRY）
  if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text).then(() => toast(okMsg, 'ok'), () => fallbackCopy(text, okMsg)); return; }
  fallbackCopy(text, okMsg);
}
function fallbackCopy(text, okMsg = '✓ 已複製') {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-9999px'; ta.setAttribute('readonly', '');
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { console.warn('[crafter] execCommand copy 失敗:', e); }
  document.body.removeChild(ta);
  toast(ok ? okMsg : '複製失敗，請長按文字手動複製', ok ? 'ok' : 'error');
}

// ---------- init ----------
(async function () {
  try {
  // 求解編排（app-solve.js classic script）：注入依賴後預熱 WASM（提前於 loadData，讓 download 與 fetch 並行）
  if (globalThis.CraftSolve) {
    globalThis.CraftSolve.init({ $, toast, PH_HTML, getSelected: () => selected, gearFor, computeSettings, switchTab });
    globalThis.CraftSolve.newWorker();
  }
  await loadData();
  loadGear();
  // 配方瀏覽層（app-browse.js classic script）：注入依賴後才能 render（getter 取 live RINDEX/selected——loadData 會重賦值綁定）
  if (!globalThis.CraftBrowse) throw new Error('app-browse.js 未載入（部署不完整）'); // 明確早報 → 落 catch 顯錯誤橫幅，非等 render 才 undefined.X 白屏（對抗審 grok F3）
  globalThis.CraftBrowse.init({ $, esc, iconUrl, DOH, JOB_ICON, NAME_COLLATOR,
    getRINDEX: () => RINDEX, getSelected: () => selected, selectRecipe, toast });
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
  $('solve-btn').addEventListener('click', () => globalThis.CraftSolve.doSolve());
  $('cancel-btn').addEventListener('click', () => globalThis.CraftSolve.cancelSolve());
  $('change-recipe').addEventListener('click', showPicker);
  const gsh = $('goto-stats-hint'); if (gsh) gsh.onclick = () => switchTab('stats', true);
  document.querySelectorAll('#main-tabs .codex-tab').forEach(t => {
    t.onclick = () => switchTab(t.dataset.tab);
    t.onkeydown = onTabKey;
    t.tabIndex = t.classList.contains('is-active') ? 0 : -1; // 初始 roving tabindex（tablist a11y）
  });
  // 結果渲染（app-render.js classic script）：注入 getter 取 live 狀態（loadData 會重賦值 ITEMS/ACTIONS 綁定）
  if (globalThis.CraftRender) globalThis.CraftRender.init({ $, esc, iconUrl, b64urlEncode, copyText, MACRO_BUILDER_BASE,
    getSelected: () => selected, getItems: () => ITEMS, getActions: () => ACTIONS });
  // 製造清單（crafting-list.js classic script，先於本 module 執行）：注入依賴後接手 #craft-list 分頁
  if (globalThis.CraftList) {
    globalThis.CraftList.init({ $, esc, iconUrl, RECIPES, ITEMS, INGREDIENTS, selectRecipe, switchTab, showPicker, toast, copyText, mbItem, mbCraft, MARKETBOARD_BASE, onChange: markListState,
      goSolve: (id) => { if (selectRecipe(id, true)) switchTab('solve', true); } }); // 前往求解：selectRecipe 失敗（缺 rlv）就不切頁；成功才切+移焦，詳情顯示「← 回製造清單」
    markListState(); // 初載：清單已 load，回填首屏配方表的「已加入」標示（renderTable 早於 init 執行時清單尚空）
  }
  } catch (e) {
    console.error('[crafter] 初始化失敗:', e);
    $('recipe-table').innerHTML = ''; // 清掉首載「載入中…」佔位，避免與失敗橫幅並存殘留轉圈
    const main = document.querySelector('main');
    if (main) main.insertAdjacentHTML('afterbegin',
      '<div class="codex-tablet panel" style="margin:16px 0;color:var(--color-warn)">⚠ 資料載入失敗，請重新整理頁面或稍後再試。</div>');
  }
})();

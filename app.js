// 配方製作求解器 — 分頁式：配方求解（職業+等級瀏覽）/ 角色數值（各職裝備）。
// 公式（已對抗驗證，spec §4）在此算，WASM worker 只跑引擎。
const $ = (id) => document.getElementById(id);
// icon URL — xivapi v2 asset CDN（v1 xivapi.com 圖庫停更，7.5 新 icon 404；權威寫法＝marketboard modules/icon.js，此為 v1 路徑輸入版）
function iconUrl(p) {
  const m = /^\/i\/(\d{6})\/(\d{6})\.png$/.exec(p || '');
  return m ? `https://v2.xivapi.com/api/asset/ui/icon/${m[1]}/${m[2]}_hr1.tex?format=png` : '';
}
// 跨工具深連結：到 marketboard 看材料樹/行情/成本（dev 走 :8774 統一外部站，prod 走 market.xivtc.com）
const MARKETBOARD_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:8774/ffxiv-tw-marketboard/'
  : 'https://market.xivtc.com/';
// marketboard 深連結 helper（DRY：base 一處；item_id≠recipe id 分清）。named target 共用分頁、刻意不加 rel=noopener＝生態內互跳慣例（見 renderMacro 註解；全 repo noopener 慣例待 Owner 拍板＝BACKLOG B-006）。
const mbUrl = (route, id) => { const n = Number(id); return Number.isFinite(n) && n > 0 ? `${MARKETBOARD_BASE}#/${route}/${n}` : '#'; }; // 型別收斂+防壞連結（非正整數→'#'，禁 #/item/undefined）
const mbItem = (iid) => mbUrl('item', iid);       // 查價 / 歷史 / 來源
const mbCraft = (itemId) => mbUrl('craft', itemId); // BOM 樹 / 每材料價 / 利潤試算
// 跨工具深連結：求解巨集帶到 macro-builder 匯入（?import= 收端契約見 external/_NEW-TOOL.md；波次 2）
const MACRO_BUILDER_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:8774/ffxiv-tw-macro-builder/'
  : 'https://macro.xivtc.com/';
// base64url（UTF-8 安全：中文必先 TextEncoder 轉 bytes，不能直接 btoa）
function b64urlEncode(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// ⚠ **刻意 local hardcode，不是漏 sync**（B-001，Owner 2026-08-03 拍板）：
// monorepo 的職業權威源 `data/item_dict/jobs.json` 只散布 **21 個戰鬥職**，不含 8 個製作職
// （`tools/sync-ffxiv-constants.ps1` 的散布範圍就是那 21 職）⇒ 這兩份沒有上游可對。
// 月稽核／AUTO-SYNC 掃描看到這裡請跳過。真正防漂移的是 test-formulas.mjs 的 T29 不變量：
// DOH 必須恰好等於 recipes.json 出現過的 job 集合，且 JOB_ICON 的鍵必須與 DOH 一致。
const DOH = ['木工', '鍛造', '甲冑', '金工', '皮革', '裁縫', '鍊金', '烹調']; // 8 DoH（= recipe.job 值，依製作職業列序）
// DoH 職業 icon：classjob_id 8–15 → icon_id 62100+id（同 jobs.json framed icon 模式）
const JOB_ICON = {
  '木工': '/i/062000/062108.png', '鍛造': '/i/062000/062109.png', '甲冑': '/i/062000/062110.png',
  '金工': '/i/062000/062111.png', '皮革': '/i/062000/062112.png', '裁縫': '/i/062000/062113.png',
  '鍊金': '/i/062000/062114.png', '烹調': '/i/062000/062115.png',
};
// 結果欄空狀態（.codex-empty 內容）：說清楚「這裡會出現什麼」＋附一顆可直接按下去的 CTA
// （設計系統 §功能頁引導標準 驗收線 1；主 CTA 仍是設定欄那顆 --primary，此處用 ghost 不搶主 CTA 唯一性）。
const PH_HTML =
  '<div class="codex-empty__icon" aria-hidden="true">⚒</div>' +
  '<div><b>求解後這裡會出現</b>' +
  '<ul class="crafter-ph__list codex-small">' +
  '<li>🎮 可直接貼進遊戲的巨集</li><li>📜 手法序列（每一步用什麼技能）</li><li>🔍 逐步走查（進展／品質／耐久／CP）</li>' +
  '</ul>' +
  '<button type="button" id="ph-solve" class="codex-btn codex-btn--ghost">求解最佳手法</button></div>';
const NAME_COLLATOR = new Intl.Collator('zh-Hant'); // 預建 collator，避免每次比較重建（快於逐次 localeCompare(...,'zh-Hant')）

let RECIPES = [], RLV = {}, ACTIONS = {}, RINDEX = [], ITEMS = {}, INGREDIENTS = {};
let selected = null;    // { recipe, rlv }
// 職業任務層展開素材樹要用的兩份索引（建一次、隨 loadData 重建；避免每次重繪掃 11803 筆）
let RECIPE_BY_ID = {}, RECIPE_BY_ITEM = {}, RECIPES_BY_ITEM = {};   // 後者＝item_id → 全部配方 id（多職業）
let openedFromList = false; // 由製造清單「前往求解」進入 → 結果區顯示「← 回製造清單」；瀏覽/深連結進入則不顯示（避免幽靈導覽）
let computedInitial = 0; // 由 HQ 原料勾選算出的初始品質
// worker / solveClock 已移入 app-solve.js（該層私有狀態）

// ---------- 資料 ----------
async function loadData() {
  // 逾時：網路 stall 時不讓「📦 載入配方資料中…」無限空轉（無逾時＝玩家看不出是慢還是壞掉，只能自己重整）
  const fetchJson = async (url) => { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`${url} HTTP ${r.status}`); return r.json(); }; // HTTP 錯誤明確降級（非把 404 頁當 JSON 硬 parse）
  // 選配資料（食物/藥水）非必要 → 失敗只降級該功能、不拖垮整站；回傳 [] 讓 buildConsumables 安全略過
  const fetchOpt = async (url) => { try { return await fetchJson(url); } catch (e) { console.warn('[crafter] 選配資料載入失敗，略過:', url, e); return []; } };
  // 七檔同一輪併發：meals/medicine 原本排第二輪 await，白等一個 RTT 只換 2.5KB（fetchOpt 自己吞錯，不會拖垮必要資料）
  // 品質階段同為選配：載不到只是少了「一階/二階/三階」快捷，目標品質仍可手打 → 不拖垮整站
  const fetchOptObj = async (url) => { try { return await fetchJson(url); } catch (e) { console.warn('[crafter] 選配資料載入失敗，略過:', url, e); return {}; } };
  // 等級同步**不是普通選配資料**：其他選配載不到只是少一個快捷（品質階段）或少一份加成（食藥），
  // 這一份載不到會讓宇宙探索配方沿用資料裡的 rlv 690 ＝ Lv100 版本的難度/品質/耐久
  // —— Lv70 玩家看到的是六倍難度，求解直接回「做不到」，而畫面上一切正常（零回饋訊號，B-016 的原病）。
  // 故降級要**看得見**：仍不拖垮整站（其餘 99% 配方不受影響），但必須告訴玩家數字可能不對。
  const fetchLevelSync = async () => {
    try { return await fetchJson('data/level-sync.json'); }
    catch (e) {
      console.warn('[crafter] 等級同步資料載入失敗:', e);
      toast('等級同步資料載入失敗 — 宇宙探索配方可能顯示 Lv100 的難度與品質，重整可重試', 'warn');
      return {};
    }
  };
  const [recipes, rlv, actions, items, ingredients, meals, medicine, stages, levelSync, quests, vendors] = await Promise.all([
    fetchJson('data/recipes.json'),
    fetchJson('data/recipe_levels.json'),
    fetchJson('data/craft-actions.json'),
    fetchJson('data/items.json'),
    fetchJson('data/ingredients.json'),
    fetchOpt('data/meals.json'),
    fetchOpt('data/medicine.json'),
    fetchOptObj('data/quality-stages.json'),
    fetchLevelSync(),
    fetchOpt('data/job-quests.json'),
    fetchOptObj('data/vendors.json'),
  ]);
  RECIPES = recipes; RLV = rlv; ACTIONS = actions; ITEMS = items; INGREDIENTS = ingredients;
  globalThis.CraftConsumable?.setData?.(meals, medicine);
  globalThis.CraftStages?.setData?.(stages);
  globalThis.CraftSync?.setData?.(levelSync);
  globalThis.CraftNext?.setData?.();   // INGREDIENTS 換了新綁定 → 反查索引作廢（下次用到再建）
  RECIPE_BY_ID = {}; RECIPE_BY_ITEM = {}; RECIPES_BY_ITEM = {};
  for (const r of RECIPES) {
    RECIPE_BY_ID[r.id] = r;
    if (r.item_id != null && RECIPE_BY_ITEM[r.item_id] == null) RECIPE_BY_ITEM[r.item_id] = r.id;  // 同物品多配方取先出現者（與配方表一致）
    // **同一件東西常常好幾個職業都能做**（實測 651 件；宇宙探索的「統一規格的金屬板」有 12 個＝全 DoH）。
    // 只留「先出現者」等於幫玩家選了一個他可能沒練的職業 → 另存完整清單供職業切換與「先做這個」挑選。
    if (r.item_id != null) (RECIPES_BY_ITEM[r.item_id] = RECIPES_BY_ITEM[r.item_id] || []).push(r.id);
  }
  RINDEX = RECIPES.map(r => ({
    id: r.id, name: r.item_name || '', job: r.job || '', rlv: r.rlv,
    // 簡中名只進搜尋、不顯示（顯示一律繁中）：很多人記的是陸服名或直接從簡中攻略貼過來
    nameSc: (ITEMS[String(r.item_id)] && ITEMS[String(r.item_id)].name_sc) || '',
    level: (RLV[String(r.rlv)] && RLV[String(r.rlv)].class_job_level) || 0,
    icon: (ITEMS[String(r.item_id)] && ITEMS[String(r.item_id)].icon) || null,
    category: (ITEMS[String(r.item_id)] && ITEMS[String(r.item_id)].category) || '', // 道具種類（繁中）→ 配方表獨立一欄
    expert: !!r.is_expert,   // 高難度（expert）＝遊戲內隨機製作狀態的配方（536 筆）；配方表標徽章＋可篩選
    patch: (ITEMS[String(r.item_id)] && ITEMS[String(r.item_id)].patch) || '',   // 成品的實裝版本（item_lookup.items.patch，13874 筆全有值）→ 版本欄＋版本篩選
    // 難度／品質上限：**一律走 recipeMaxes**（顯示與求解共用同一算式的鐵則，CQ-01）——
    // 這裡多一份 `rlv.difficulty * factor / 100` 就是第二份公式，改版時只會有一邊被改到。
    // 缺 rlv 列（資料半套）→ 給 null，渲染端顯「—」而不是假的 0。
    ...(function () {
      const row = RLV[String(r.rlv)];
      if (!row) return { diff: null, qual: null };
      const m = recipeMaxes(r, row);
      return { diff: m.max_progress, qual: m.max_quality };
    })(),
  }));
  // **必須在兩份配方索引建好之後**：職業任務的素材展開要靠它們判斷「這件東西做得出來嗎」，
  // 早一步呼叫的話整份清單會靜默變成「全部非製作」（畫面正常、只是全錯）。
  globalThis.CraftQuests?.setVendors?.(vendors);   // 先給商人資料，setData 一次繪到位（省一次重繪）
  globalThis.CraftQuests?.setData?.(quests);
}

// ---------- 角色數值（localStorage，已抽到 app-gear.js：globalThis.CraftGear）----------
// proxy：既有呼叫點 / 事件綁定沿用同名，實體在 CraftGear（init 注入依賴：DOM/工具/職業資料/輸入後回呼）。
// 只留**真的還有人呼叫**的三支；saveGear／gearValid／onGearInput 的 proxy 已於 2026-08-15 刪除
// （零呼叫點，各自的呼叫端都在 app-gear.js 內部；測試改直接走 CraftGear，不需要 app.js 再轉一手）。
function loadGear() { return globalThis.CraftGear.loadGear(); }
function gearFor(job) { return globalThis.CraftGear.gearFor(job); }
function anyGear() { return globalThis.CraftGear.anyGear(); }
function renderGearsets() { return globalThis.CraftGear.renderGearsets(); }

// ---------- 職業 chips + 配方表（已抽到 app-browse.js：globalThis.CraftBrowse；jobFilter 為該層私有狀態）----------
// proxy：既有呼叫點 / 事件綁定 / CraftList onChange 沿用同名，實體在 CraftBrowse（init 注入依賴：getter 取 live RINDEX/selected）。
// 抽出理由＝app.js >500 觸拆分閘門（B-007，Owner 核可）；配方瀏覽表為內聚獨立單元（jobFilter 私有、對外僅注入依賴溝通）。
// 用 function 宣告（有 hoisting、貼近原碼契約）→ 避免 const arrow 的 TDZ：日後若在定義前呼叫不會 ReferenceError（對抗審 grok F4）
function renderChips() { return globalThis.CraftBrowse.renderChips(); }
function renderTable() { return globalThis.CraftBrowse.renderTable(); }
function markListState() { return globalThis.CraftBrowse.markListState(); }

function selectRecipe(id, fromList) { return globalThis.CraftRecipe.selectRecipe(id, fromList); }
function showPicker() { return globalThis.CraftRecipe.showPicker(); }
// 配方三上限（進展/品質/耐久）：顯示（refreshSelectedGear）與求解（computeSettings）共用同一算式，防兩處漂移（CQ-01）
function recipeMaxes(recipe, rlv) {
  return {
    max_progress: Math.floor(rlv.difficulty * recipe.difficulty_factor / 100),
    max_quality: Math.floor(rlv.quality * recipe.quality_factor / 100),
    max_durability: Math.floor(rlv.durability * recipe.durability_factor / 100),
  };
}
// 配方的最低能力要求（`Recipe.RequiredCraftsmanship` / `RequiredControl`，13874 個裡 3396 個有）：
// 遊戲內數值不到就**根本不給做**，站上原本完全沒讀這兩欄 ⇒ 使用者拿得到一份進遊戲用不了的巨集。
// 比較基準＝`effectiveStats`（含食物／藥水／專家之證）——遊戲的判定同樣吃 buff，拿裸裝比會誤擋。
// 單一出口：顯示（app-recipe 的需求標示與求解鈕狀態）與擋閘（app-solve.doSolve）共用這一份。
function statShortfall(recipe, gear) {
  const need = { cms: +(recipe && recipe.required_craftsmanship) || 0, ctrl: +(recipe && recipe.required_control) || 0 };
  if (!gear || (!need.cms && !need.ctrl)) return { need, cms: 0, ctrl: 0, ok: true };
  const eff = effectiveStats(gear);
  const cms = Math.max(0, need.cms - eff.cms);
  const ctrl = Math.max(0, need.ctrl - eff.ctrl);
  return { need, cms, ctrl, ok: cms === 0 && ctrl === 0 };
}

// CraftRecipe.refreshGearNote 內保留 Number(g.level) 等級同步硬化。
function refreshGearNote() { return globalThis.CraftRecipe.refreshGearNote(); }
function refreshSelectedGear() { return globalThis.CraftRecipe.refreshSelectedGear(); }
function renderIngredients(recipe, maxQ) { return globalThis.CraftRecipe.renderIngredients(recipe, maxQ); }

// ---------- 食物 / 藥水（選擇 UI + 本地保存已抽到 app-consumable.js：globalThis.CraftConsumable）----------
// 這裡只留「選中品項 → 數值加成」的公式面；選單渲染/鍵盤/保存屬該層。
// 選擇性呼叫（?.）：測試 sandbox 未載該層時＝無食藥，公式仍可決定性驗證。
function applyConsumables(baseCms, baseCtrl, baseCp) {
  let cms = baseCms, ctrl = baseCtrl, cp = baseCp;
  const cs = globalThis.CraftConsumable;
  for (const e of [cs?.get?.('food') || null, cs?.get?.('potion') || null]) {
    if (!e) continue;
    if (e.cm) cms += Math.min(e.cm_max || Infinity, Math.floor(baseCms * e.cm / 100));
    if (e.ct) ctrl += Math.min(e.ct_max || Infinity, Math.floor(baseCtrl * e.ct / 100));
    if (e.cp) cp += Math.min(e.cp_max || Infinity, Math.floor(baseCp * e.cp / 100));
  }
  return { cms, ctrl, cp };
}
// 食藥任一變更 → 實際數值、摘要、舊結果失效（三者永遠同步，勿在別處只做其中一項）
// 專家之證＝「角色數值」分頁裡該職業的狀態（CraftGear），不是這一區的開關 → 閘的來源是選中配方的職業
function refreshSpecialistGate() {
  const g = selected ? gearFor(selected.recipe.job) : null;
  const enabled = !!(g && g.specialist);
  $('opt-heart').disabled = !enabled;
  $('opt-qi').disabled = !enabled;
  $('heart-why').hidden = enabled;
  $('qi-why').hidden = enabled;
  if (enabled) {
    SPEC_GATED_IDS.forEach(id => { $(id).checked = specWanted[id]; });   // 閘打開 → 把玩家原本的選擇還他
  } else {
    $('opt-heart').checked = false;
    $('opt-qi').checked = false;
  }
}
function onConsumableChange() { updateEff(); globalThis.CraftFlow?.updateConsumableSummary?.(); invalidateResults(); }
function effectiveStats(gear) {
  const spec = !!gear.specialist;               // 該職業是否持有專家之證（角色數值分頁設定，gearFor 帶進來）
  const sp = spec ? 20 : 0;                    // 專家之證：作業 +20・加工 +20
  return applyConsumables(gear.cms + sp, gear.ctrl + sp, gear.cp + (spec ? 15 : 0)); // 專家之證：CP +15（Soul of the Crafter 專家狀態加成）
}
function updateEff() {
  if (!selected) return;
  const g = gearFor(selected.recipe.job);
  if (!g) { $('eff-stats').textContent = ''; return; }
  const e = effectiveStats(g);
  const buffed = (e.cms !== g.cms || e.ctrl !== g.ctrl || e.cp !== g.cp); // 專家之證必然改動數值 → 不需另外判旗標
  $('eff-stats').innerHTML = buffed ? `實際數值：作業 <b>${e.cms}</b> · 加工 <b>${e.ctrl}</b> · CP <b>${e.cp}</b>` : '';
}
function updateInitial(recipe, maxQ) { return globalThis.CraftRecipe.updateInitial(recipe, maxQ); }

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
    use_heart_and_soul: $('opt-heart').checked && !!gear.specialist,
    use_quick_innovation: $('opt-qi').checked && !!gear.specialist,
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
  // 【求解中改設定】必須先作廢飛行中的求解，且**必須放在下面的 early return 之前**：
  // 求解期間 results 正是 hidden，靠 early return 就整條漏掉 → 舊 worker 回來時 solveGen 未變、
  // 世代守衛放行、用「舊設定」算出的手法渲染在「新設定」的畫面上 → 玩家複製到錯綁巨集。
  // （2026-07-25 T13 只修了「換配方」那條路徑；「改食藥/技能/目標品質/角色數值」這條 2026-07-27 外審才抓到）
  if (globalThis.CraftSolve?.invalidateInFlight?.()) {
    $('results-placeholder').innerHTML = '<div class="crafter-ph__warn">⚠ 設定已變更，先前的求解已停止 — 請重新求解</div>' + PH_HTML;
    globalThis.CraftFlow?.update?.();
    return;
  }
  if (!$('results') || $('results').hidden) return; // 尚無結果就不動
  $('results').hidden = true;
  $('results-placeholder').hidden = false;
  // 保留空狀態本體（含「會出現什麼」與 CTA）、只在前面加一行失效警語 → 失效後仍有一鍵重算入口
  $('results-placeholder').innerHTML = '<div class="crafter-ph__warn">⚠ 設定已變更，請重新求解</div>' + PH_HTML;
  $('solve-status').innerHTML = '';
  globalThis.CraftFlow?.update?.();   // ③ 退回待辦（上游變更使下游失效）
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
  $('tab-quests').hidden = name !== 'quests';
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

// ---------- 求解選項（localStorage）----------
// 全部預設**不勾**：這些技能不是到等級就自動有（掌握需 Lv65 **並完成解鎖任務**、
// 專心致志/快速改革需專家之證），預設替玩家勾＝預設產出他按不出來的巨集 → 一律由他自己選。
// 保存讓「選一次就好」，否則每次重整都要重勾一輪（食藥區早有同樣的本地保存）。
const SOLVE_OPTS_KEY = 'ffxiv-crafter-solve-opts-v1';
const SOLVE_OPT_IDS = ['opt-manip', 'opt-heart', 'opt-qi', 'opt-backload', 'opt-adversarial'];
// 需要專家之證的兩個選項：「玩家想不想用」與「現在能不能用」是兩件事。
// 閘會強制取消勾選（對的——沒插證卻排進「專心致志」＝產出他按不出來的巨集），但那次強制取消
// 不能把偏好吃掉：換到有證的職業時要能回來。原本沒有人把它套回去 ⇒ 保存的偏好**永遠套不回**
// （init 時 selected 還是 null，閘一律關 → 勾選被清掉，之後閘打開也只是「可勾」而不會勾回來）。
const SPEC_GATED_IDS = ['opt-heart', 'opt-qi'];
const specWanted = { 'opt-heart': false, 'opt-qi': false };
function loadSolveOpts() {
  try {
    const s = JSON.parse(localStorage.getItem(SOLVE_OPTS_KEY)) || {};
    // 只認布林：localStorage 被竄改成別的型別時退回 HTML 的預設值，不硬套
    SOLVE_OPT_IDS.forEach(id => { if (typeof s[id] === 'boolean') $(id).checked = s[id]; });
  } catch (e) { console.warn('[crafter] 求解選項讀取失敗，使用預設值:', e); }
  SPEC_GATED_IDS.forEach(id => { specWanted[id] = $(id).checked; });   // 記住偏好本身，閘關了也不會遺失
}
let solveOptsSaveWarned = false;
function saveSolveOpts() {
  try {
    const s = {};
    // 閘關著時 DOM 是被強制取消的，寫它等於把玩家的偏好洗掉（他只是暫時拔了專家之證）→ 寫回偏好本身
    SOLVE_OPT_IDS.forEach(id => { s[id] = ($(id).disabled && id in specWanted) ? specWanted[id] : $(id).checked; });
    localStorage.setItem(SOLVE_OPTS_KEY, JSON.stringify(s));
  } catch (e) {                                 // 無痕/配額滿：至少 warn（禁靜默吞）＋一次性提醒
    console.warn('[crafter] 求解選項儲存失敗（可能是無痕模式）:', e);
    if (!solveOptsSaveWarned) { solveOptsSaveWarned = true; toast('無法保存求解選項（可能是無痕/私密模式），重整後會回到預設', 'warn'); }
  }
}

// 晶體判定（水晶/碎晶/晶簇）——**單一出口**：配方原料排序（app-recipe）與製造清單彙總（crafting-list）
// 各自需要它，兩份平行實作只要有人改了規則就會分岔（Q-02）。規則本身是「低 id 段」＋三個關鍵字：
// 低 id 是遊戲把水晶類放在最前面的事實，關鍵字是保險（新增的晶體若 id 不在低段仍抓得到）。
function isCrystal(iid, name) { return iid < 20 || /晶簇|水晶|碎晶/.test(name || ''); }

// ---------- utils ----------
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); } // 含單引號 → 無例外通用轉義（防 attribute 用單引號時破格）
function toast(msg, v) {
  if (window.FFXIVToast && window.FFXIVToast.show) { window.FFXIVToast.show(msg, v); return; }
  console.log(`[toast:${v || 'info'}] ${msg}`);            // codex CDN 未載時的降級：至少留主控台紀錄
  if (v === 'error' || v === 'warn') alert(msg);           // 重要訊息用原生提示 → CDN toast 未載時玩家仍看得到
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
// 複製：**優先 portal 共用實作**（`FFXIVClipboard.copy`，B-027 自 marketboard 升格——secure-context
// 判斷＋execCommand fallback＋toast 都在那邊，是生態內最完整的一份）。
// 本地那份只留作 CDN 未載時的退場（本機沒開 portal svc、或 CDN 掛掉時複製功能不能跟著消失）。
// ⚠ 共用版的 toast 文字固定是「已複製「label」」→ 呼叫端的 okMsg 改當 label 傳（不要兩套文案各講一次）。
function copyText(text, okMsg = '✓ 已複製', label) {   // okMsg 泛化：巨集/素材清單共用同一 clipboard fallback（DRY）
  if (window.FFXIVClipboard?.copy) { window.FFXIVClipboard.copy(text, label); return; }
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
  // ⚠ 分層檔缺席一律**硬失敗**（RES-02）：每一支都是必經路徑，缺了就是部署不完整。
  // 早報會落到下面的 catch 顯示錯誤橫幅；用 `?.` 軟略過的話玩家看到的是一個少了功能、
  // 按下去才無聲 TypeError 的頁面。各層**內部**的 `globalThis.CraftXxx?.` 選擇性呼叫不在此列
  // （那是給測試 sandbox 只載部分層用的）。新增分層檔時這裡要一起加，T49 機械守。
  // 求解編排（app-solve.js classic script）：注入依賴後預熱 WASM（提前於 loadData，讓 download 與 fetch 並行）
  if (!globalThis.CraftSolve) throw new Error('app-solve.js 未載入（部署不完整）');
  {
    globalThis.CraftSolve.init({ $, toast, PH_HTML, getSelected: () => selected, gearFor, computeSettings, switchTab, statShortfall });
    globalThis.CraftSolve.newWorker();
  }
  // 角色數值層（app-gear.js classic script）：注入依賴後才讀 localStorage/繪表；輸入後回呼維持原 app.js 事件鏈順序
  if (!globalThis.CraftGear) throw new Error('app-gear.js 未載入（部署不完整）');
  globalThis.CraftGear.init({ $, esc, toast, iconUrl, DOH, JOB_ICON,
    afterInput: () => {
      updateHint();
      if (selected) refreshGearNote();
      invalidateResults(); // 改角色數值 → 舊巨集過期
      globalThis.CraftFlow?.update?.(); // 填完數值 → ② 由「無法進行」轉「進行中」（invalidateResults 無結果時會早退，故此處明呼）
    } });
  // 配方詳情層（app-recipe.js classic script）：狀態仍由 app.js 持有，透過 getter/setter 注入取 live 資料
  if (!globalThis.CraftRecipe) throw new Error('app-recipe.js 未載入（部署不完整）');
  globalThis.CraftRecipe.init({ $, esc, iconUrl, toast, PH_HTML, JOB_ICON, mbItem, mbCraft, recipeMaxes, switchTab, isCrystal,
    statGate: (recipe) => statShortfall(recipe, gearFor(recipe.job)),
    renderTable, getRecipes: () => RECIPES, getRlvTable: () => RLV, getItems: () => ITEMS, getIngredients: () => INGREDIENTS,
    getSelected: () => selected, setSelected: (v) => { selected = v; },
    getComputedInitial: () => computedInitial, setComputedInitial: (v) => { computedInitial = v; },
    getOpenedFromList: () => openedFromList, setOpenedFromList: (v) => { openedFromList = v; },
    invalidateResults, updateEff, gearFor, refreshSpecialistGate,
    getRecipesById: () => RECIPE_BY_ID, getRecipeByItem: () => RECIPE_BY_ITEM,
    getRecipesByItem: () => RECIPES_BY_ITEM, gearOkFor: (job) => !!gearFor(job) });
  // 「繼續做」反查層（app-nextcraft.js classic script）：索引在資料載完後才建（setData 作廢重建）
  if (!globalThis.CraftNext) throw new Error('app-nextcraft.js 未載入（部署不完整）');
  globalThis.CraftNext.init({ $, esc, iconUrl, JOB_ICON,
    getItems: () => ITEMS, getIngredients: () => INGREDIENTS, getRecipesById: () => RECIPE_BY_ID,
    gearOkFor: (job) => !!gearFor(job),
    onPick: (rid) => globalThis.CraftRecipe.continueWith(rid) });
  // 食物/藥水選擇層（app-consumable.js classic script）：**必須早於 loadData**——loadData 尾端會 setData 繪按鈕，
  // 且本層 init 才會把保存值套回 HQ / 專家之證 checkbox（保存值要先就位，後續公式與摘要才讀得到）
  if (!globalThis.CraftConsumable) throw new Error('app-consumable.js 未載入（部署不完整）');
  globalThis.CraftConsumable.init({ $, esc, iconUrl, toast, onChange: onConsumableChange });
  // 職業任務層（app-quests.js classic script）：**必須早於 loadData**——loadData 尾端會 setData 繪清單
  if (!globalThis.CraftQuests) throw new Error('app-quests.js 未載入（部署不完整）');
  globalThis.CraftQuests.init({ $, esc, iconUrl, toast, mbItem, selectRecipe, switchTab, copyText,
    getItems: () => ITEMS, getIngredients: () => INGREDIENTS,
    getRecipesById: () => RECIPE_BY_ID, getRecipeByItem: () => RECIPE_BY_ITEM });
  // 品質階段層（app-quality-stages.js classic script）：**必須早於 loadData**——loadData 尾端 setData、
  // 且深連結路徑會在 init 之後立刻 selectRecipe → refreshSelectedGear → setRecipe，監聽器要先掛好
  if (!globalThis.CraftStages) throw new Error('app-quality-stages.js 未載入（部署不完整）');
  globalThis.CraftStages.init({ $, invalidateResults });
  // 等級同步層（app-level-sync.js classic script）：手動指定等級 → 重算三上限並作廢舊巨集
  // （生效 rlv 變了，先前那份手法是照別的難度算的）
  if (!globalThis.CraftSync) throw new Error('app-level-sync.js 未載入（部署不完整）');
  globalThis.CraftSync.init({
    $, toast,
    // 走 refreshGearNote 而非 refreshSelectedGear：後者無條件重建素材列與目標欄
    // ⇒ 玩家在這裡打一個等級，已填的 HQ 素材數量與目標品質就靜默歸零（健檢 2026-08-15，T37 守）。
    // refreshGearNote 只有在生效 rlv 真的變了才完整重繪，且會先記成果、重繪後套回並收斂到新上限
    // ——與「改角色數值」共用同一條路（B-011 修的就是那條，這條後來才加、漏接上）。
    onChange: () => { if (selected) refreshGearNote(); invalidateResults(); },
  });
  // gear 只讀 localStorage（同步）→ 刻意早於 await：首次使用提示要在資料回來前就定案，
  // 否則等 fetch 完才 unhide 會把下方整段推開一次（CLS）
  loadGear();
  updateHint();
  // 求解選項同樣只讀 localStorage（同步、無網路）→ 與 gear 一起在 await 前套回，
  // 讓深連結路徑（init 後立刻 selectRecipe→求解）拿到的就是玩家上次的選擇
  loadSolveOpts();
  refreshSpecialistGate();
  // 分頁切換**必須在 await 之前接好**：updateHint 已經在畫面上叫玩家「去填角色數值」並指著這幾顆按鈕，
  // 而 loadData 在慢網路上是好幾秒 —— 綁在 await 之後等於那段時間按鈕是死的，玩家照著提示點卻毫無反應
  // 且沒有任何訊號說「還在載」（健檢 2026-08-15 ux-flows，T42 守）。
  // switchTab 只切 class 與 hidden、完全不碰資料，早綁沒有副作用。
  document.querySelectorAll('#main-tabs .codex-tab').forEach(t => {
    t.onclick = () => switchTab(t.dataset.tab);
    t.onkeydown = onTabKey;
    t.tabIndex = t.classList.contains('is-active') ? 0 : -1; // 初始 roving tabindex（tablist a11y）
  });
  await loadData();
  // 配方瀏覽層（app-browse.js classic script）：注入依賴後才能 render（getter 取 live RINDEX/selected——loadData 會重賦值綁定）
  if (!globalThis.CraftBrowse) throw new Error('app-browse.js 未載入（部署不完整）'); // 明確早報 → 落 catch 顯錯誤橫幅，非等 render 才 undefined.X 白屏（對抗審 grok F3）
  if (!globalThis.CraftFlow) throw new Error('app-flow.js 未載入（部署不完整）');     // 同上：setTargetMode/摘要為必經路徑，缺檔要早報而非中途 TypeError
  globalThis.CraftBrowse.init({ $, esc, iconUrl, DOH, JOB_ICON, NAME_COLLATOR,
    getRINDEX: () => RINDEX, getSelected: () => selected, selectRecipe, toast });
  renderChips();
  globalThis.CraftBrowse.renderPatchOptions();   // 版本選項由資料生成（不寫死 68 個版號——資料一變就漂移）
  renderGearsets();
  renderTable();
  $('picker').classList.remove('is-loading');   // 預留高度交還給真實內容（篩選出少量結果時不留空井）
  // 深連結：?recipe=<id> 或 ?item=<id> → 自動選配方（marketboard / 宇宙探索「求解手法」鈕用）
  const dlp = new URLSearchParams(location.search);
  const dlRecipe = +dlp.get('recipe') || 0, dlItem = +dlp.get('item') || 0;
  // 多職業可做時優先挑玩家**有填數值**的那個職業（挑一個他沒練的等於一進站就是死路）；
  // 都沒填就沿用第一個，畫面上的職業切換鈕仍可換。
  const dlCands = dlItem ? (RECIPES_BY_ITEM[dlItem] || []).map((id) => RECIPE_BY_ID[id]).filter(Boolean) : [];
  const dlByItem = dlCands.find((r) => gearFor(r.job)) || dlCands[0] || null;
  if (dlRecipe && RECIPES.some(r => r.id === dlRecipe)) selectRecipe(dlRecipe);
  else if (dlByItem) selectRecipe(dlByItem.id);
  else if (dlRecipe || dlItem) toast('找不到深連結指定的配方，請用搜尋手動選擇', 'warn'); // 從 marketboard 點過來但該物品無配方 → 給提示不迷路（ux-3）
  // ?stage=1|2|3 → 直接選到那一檔品質（宇宙探索任務點過來時已知要交幾檔）。
  // **只認階段序號、不收絕對品質數字**：門檻換算的唯一實作在 CraftStages，讓外部站塞絕對值進來
  // 等於開第二條換算路徑，對面資料一舊就靜默給出達不到門檻的手法。
  const dlStage = +dlp.get('stage') || 0;
  if (dlStage >= 1 && dlStage <= 3 && $('opt-target-stage')) {
    const opt = [...$('opt-target-stage').options].find(o => o.textContent.startsWith(['一階', '二階', '三階'][dlStage - 1]));
    if (opt) { $('opt-target-stage').value = opt.value; $('opt-target').value = opt.value; }
    else toast('此配方沒有第 ' + dlStage + ' 階品質門檻，已改用滿品質', 'warn');
  }
  globalThis.CraftFlow.updateConsumableSummary();
  // HQ 勾選仍是原生 checkbox；食物/藥水本體是 CraftConsumable 的自繪選單（無 change 事件 → 走 onChange 回呼）
  ['food-hq', 'potion-hq'].forEach(id => $(id).addEventListener('change', onConsumableChange));
  // 任一求解輸入變更 → 舊結果過期（gate：集中失效，涵蓋程式化改值與 gear 傳播）＋保存選擇
  SOLVE_OPT_IDS.forEach(id => $(id).addEventListener('change', () => {
    if (id in specWanted) specWanted[id] = $(id).checked;   // 玩家自己動的才算偏好（程式化的強制取消不觸發 change）
    saveSolveOpts(); invalidateResults();
  }));
  $('opt-target').addEventListener('input', () => {
    const el = $('opt-target'), max = +el.max || 0;
    if (max && +el.value > max) el.value = max; // 超配方品質上限即時回填 maxQ（求解本就 clamp，先讓 UI 誠實一致，ux-5）
    globalThis.CraftStages?.syncFromInput?.();  // 手打的數字剛好等於某一檔 → 下拉跟著指到那一檔，不然顯示「自訂」
    invalidateResults();
  });
  $('solve-mode').addEventListener('change', () => { globalThis.CraftFlow.setTargetMode(); invalidateResults(); }); // NQ 模式不吃目標品質 → 停用該欄並寫出原因
  const debouncedRender = debounce(renderTable, 180); // 搜尋/rlv 逐字輸入不必每鍵重繪 11803 筆
  $('recipe-search').addEventListener('input', debouncedRender);
  $('level-filter').addEventListener('change', renderTable);
  $('expert-filter').addEventListener('change', renderTable);   // 高難度篩選（漏掉這行＝控件在畫面上但按了沒反應）
  $('patch-filter').addEventListener('change', renderTable);    // 版本篩選（同上）
  $('rlv-filter').addEventListener('input', debouncedRender);
  $('solve-btn').addEventListener('click', () => globalThis.CraftSolve.doSolve());
  $('cancel-btn').addEventListener('click', () => globalThis.CraftSolve.cancelSolve());
  // 結果欄空狀態內的 CTA：PH_HTML 每次重設都會換新節點 → 事件委派綁在持久容器上（不重綁、不漏綁）
  $('results-placeholder').addEventListener('click', (e) => {
    if (e.target.closest('#ph-solve')) globalThis.CraftSolve.doSolve();
  });
  $('change-recipe').addEventListener('click', showPicker);
  const gsh = $('goto-stats-hint'); if (gsh) gsh.onclick = () => switchTab('stats', true);
  // 結果渲染（app-render.js classic script）：注入 getter 取 live 狀態（loadData 會重賦值 ITEMS/ACTIONS 綁定）
  if (!globalThis.CraftRender) throw new Error('app-render.js 未載入（部署不完整）');
  globalThis.CraftRender.init({ $, esc, iconUrl, b64urlEncode, copyText, MACRO_BUILDER_BASE,
    getSelected: () => selected, getItems: () => ITEMS, getActions: () => ACTIONS });
  // 製造清單（crafting-list.js classic script，先於本 module 執行）：注入依賴後接手 #craft-list 分頁
  if (!globalThis.CraftList) throw new Error('crafting-list.js 未載入（部署不完整）');
  {
    globalThis.CraftList.init({ $, esc, iconUrl, RECIPES, ITEMS, INGREDIENTS, selectRecipe, switchTab, showPicker, toast, copyText, mbItem, mbCraft, MARKETBOARD_BASE, isCrystal, onChange: markListState,
      // 素材卡「可自製」分組與商人徽章：一律借既有實作，不在製造清單層另刻一份
      // （挑配方＝CraftRecipe.pickRecipeForItem 的「優先挑玩家有填數值的職業」；商人＝職業任務分頁的 vendorHtml）
      pickRecipeForItem: (iid) => globalThis.CraftRecipe?.pickRecipeForItem?.(Number(iid)) || null,
      vendorHtml: (iid) => globalThis.CraftQuests?.vendorHtml?.(iid) || '',
      goSolve: (id) => { if (selectRecipe(id, true)) switchTab('solve', true); } }); // 前往求解：selectRecipe 失敗（缺 rlv）就不切頁；成功才切+移焦，詳情顯示「← 回製造清單」
    markListState(); // 初載：清單已 load，回填首屏配方表的「已加入」標示（renderTable 早於 init 執行時清單尚空）
  }
  // 流程引導（app-flow.js classic script）：三步軸 + 下一步 + pick-panel 收合 + CTA 就緒提示
  if (globalThis.CraftFlow) {
    globalThis.CraftFlow.init({ esc, getSelected: () => selected,
      isPicking: () => !$('picker').hidden,
      gearOkFor: (job) => !!gearFor(job),
      hasResult: () => !!$('results') && !$('results').hidden,
      isSolving: () => !$('cancel-btn').hidden });
    globalThis.CraftFlow.update();
  }
  window.FFXIVHelp?.setup?.();   // [data-help] 即現說明卡（設計系統鐵則：禁原生 title；opt-in、冪等）
  } catch (e) {
    console.error('[crafter] 初始化失敗:', e);
    $('recipe-table').innerHTML = ''; // 清掉首載「載入中…」佔位，避免與失敗橫幅並存殘留轉圈
    $('picker').classList.remove('is-loading'); // 失敗路徑也要卸下，否則空的篩選區留一整片預留高度
    const main = document.querySelector('main');
    if (main) main.insertAdjacentHTML('afterbegin',
      '<div class="codex-tint-panel codex-tint-panel--warn crafter-loaderr">⚠ 資料載入失敗，請重新整理頁面或稍後再試。</div>');
  }
})();

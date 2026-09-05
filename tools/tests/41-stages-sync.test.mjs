// tools/tests/41-stages-sync.test.mjs — 品質階段（T18）／求解選項預設與保存（T19）／等級同步（T20）
// 由 tools/test-formulas.mjs 依檔名序 import 跑；斷言計數器與共用 fixture 都在 ./_harness.mjs。
import { fs, vm, path, ROOT, APP_SRC, GEAR_SRC, FORMULA_SRC, DATA_SRC, RECIPE_SRC, LAYER_STUBS, sandbox, check, eq, gear } from './_harness.mjs';

// ===== T18：app-quality-stages.js 品質階段層 =====
// 換算錯的後果與「算錯巨集」同級：玩家照著求解、貼進遊戲卻差一格達不到門檻，且過程零錯誤訊號。
{
  const QS_SRC = fs.readFileSync(path.join(ROOT, 'app-quality-stages.js'), 'utf8');
  const mk = () => {
    const el = { options: [], value: '', textContent: '', hidden: false, selectedIndex: -1,
      addEventListener() {}, append(...xs) { el.options.push(...xs); } };
    Object.defineProperty(el, 'innerHTML', { get: () => '', set: () => { el.options.length = 0; } });
    return el;
  };
  const els = {};
  const $q = (id) => els[id] || (els[id] = mk());
  const qs = { console, document: { getElementById: $q },
    Option: function (text, value) { return { textContent: text, value: String(value), disabled: false }; } };
  qs.globalThis = qs;
  vm.createContext(qs);
  vm.runInContext(QS_SRC, qs, { filename: 'app-quality-stages.js' });
  const QS = qs.CraftStages;

  // 換算（純函式）：兩種來源單位不同，混用會靜默給出錯誤目標
  eq('T18 收藏品：收藏價值 ×10', QS._toQuality('collectable', 190, 99999), 1900);
  eq('T18 收藏品：不得超過配方滿品質', QS._toQuality('collectable', 200, 1500), 1500);
  eq('T18 宇宙任務：滿品質百分比', QS._toQuality('cosmic', 85, 14900), 12665);
  // 進位方向是有意義的：floor 會落在門檻下方，求出來的手法剛好差一格
  eq('T18 宇宙任務：百分比無條件進位（非捨去/四捨五入）', QS._toQuality('cosmic', 97, 101), 98);
  eq('T18 門檻 0 ＝沒這一檔 → 0', QS._toQuality('cosmic', 0, 14900), 0);
  eq('T18 未知來源不猜換算', QS._toQuality('mystery', 50, 14900), 0);

  QS.setData({ 36199: { src: 'cosmic', stages: [50, 60, 85] }, 900: { src: 'collectable', stages: [0, 160, 200] } });
  QS.setRecipe({ id: 12345 }, 5000);
  eq('T18 配方無分階 → 階段欄整組隱藏', $q('target-stage-field').hidden, true);

  QS.setRecipe({ id: 36199 }, 14900);
  eq('T18 有分階 → 階段欄顯示', $q('target-stage-field').hidden, false);
  eq('T18 選項＝滿品質＋三階＋自訂', $q('opt-target-stage').options.map((o) => o.value).join(','),
    ',7450,8940,12665,custom');
  eq('T18 提示列出來源與門檻原值', $q('target-stage-hint').textContent,
    '宇宙探索任務 · 一階 50%／二階 60%／三階 85%');

  // 某一檔為 0 → 不得列出（點了沒反應的選項比沒有更糟）
  QS.setRecipe({ id: 900 }, 99999);
  eq('T18 一階為 0 → 只列二/三階', $q('opt-target-stage').options.map((o) => o.textContent).join(','),
    '滿品質（99999）,二階（1600）,三階（2000）,自訂');
  // 階名要用 stages 的原始位置：對 filter 後的陣列取索引會把二階標成「一階」
  eq('T18 一階為 0 → 提示的階名不得位移', $q('target-stage-hint').textContent,
    '收藏品交易 · 二階 160／三階 200（收藏價值）');

  // 目標沒達到必須講出來：raphael 達不到目標時回「最佳努力」而非失敗，complete 只看進展
  // ⇒ 沒這行就會出現「✓ 可完成」配上達不到門檻的品質（2026-08-01 實測 三階 12665 / 實際 8488 全綠）
  const SF = sandbox.CraftRender.shortfallHtml;
  eq('T18 未達目標 → 出警語並寫出差額', /未達目標品質 12665.*實際 8488.*差 4177/.test(SF(12665, 8488)), true);
  eq('T18 達到目標 → 不警告', SF(12665, 12665), '');
  eq('T18 超過目標 → 不警告', SF(7450, 7509), '');
  eq('T18 未設目標（欄位留空／NQ）→ 不警告', SF(0, 100), '');

  QS.setRecipe({ id: 36199 }, 14900);
  $q('opt-target').value = '8940';
  QS.syncFromInput();
  eq('T18 手打數字等於二階 → 下拉指到二階',
    $q('opt-target-stage').options[$q('opt-target-stage').selectedIndex].value, '8940');
  $q('opt-target').value = '9999';
  QS.syncFromInput();
  eq('T18 手打數字不等於任何一檔 → 顯示自訂',
    $q('opt-target-stage').options[$q('opt-target-stage').selectedIndex].value, 'custom');
  $q('opt-target').value = '';
  QS.syncFromInput();
  eq('T18 清空 → 回滿品質', $q('opt-target-stage').selectedIndex, 0);

  // ===== T38：生效 rlv 改變時要保留「哪一檔」，不是那個絕對數字 =====
  // 由來（健檢 2026-08-15 correctness-data）：宇宙任務的門檻是**滿品質的百分比**，
  // rlv 一變同一檔就是不同數字。原本 refreshGearNote 在 rlv 改變時保留的是絕對品質再收斂到新上限
  // ⇒ 等級同步的宇宙配方降級後，玩家選的「三階」變成一個舊 rlv 才成立的數字，
  // 而下拉會翻成「自訂」——畫面上看不出哪裡不對，求出來的手法卻是照錯目標算的。
  {
    const stage = $q('opt-target-stage'), target = $q('opt-target');
    QS.setRecipe({ id: 36199 }, 14900);                    // Lv100：滿品質 14900
    stage.value = '12665'; target.value = '12665';         // 玩家選三階（85%）
    const keep = QS.stageSelection();
    eq('T38 選了三階 → stageSelection 回檔次 2（不是絕對品質）', keep, 2);

    QS.setRecipe({ id: 36199 }, 8000);                     // 等級同步降級：滿品質變 8000
    eq('T38 換 rlv 後套回同一檔 → 回 true', QS.applyStageSelection(keep), true);
    eq('T38 換 rlv 後套回同一檔 → 目標依新滿品質重推（ceil(8000×85%)）', target.value, '6800');
    eq('T38 換 rlv 後套回同一檔 → 下拉指到新的三階', stage.value, '6800');

    // 「滿品質」也是一種選擇（空字串），要能原樣保留
    stage.value = ''; target.value = '';
    eq('T38 選了滿品質 → stageSelection 回 full', QS.stageSelection(), 'full');
    QS.setRecipe({ id: 36199 }, 9000);
    eq('T38 滿品質套回 → 目標維持留空（＝滿品質，語意與手動清空一致）',
      QS.applyStageSelection('full') && target.value, '');

    // 自訂（手打的數字）不屬於任何一檔 → 不能硬套成某一檔，讓呼叫端沿用既有的絕對值收斂
    QS.setRecipe({ id: 36199 }, 14900);
    stage.value = 'custom'; target.value = '9999';
    eq('T38 自訂數字 → stageSelection 回 null（不猜檔次）', QS.stageSelection(), null);
    eq('T38 自訂數字 → applyStageSelection 回 false（呼叫端自行處理）', QS.applyStageSelection(null), false);

    // 新 rlv 下這一檔不存在（值算出來是 0）→ 同樣不硬湊
    QS.setData({ 901: { src: 'collectable', stages: [0, 160, 200] } });
    QS.setRecipe({ id: 901 }, 99999);
    stage.value = '1600';
    const keep2 = QS.stageSelection();
    eq('T38 缺一階時 → 檔次仍以原始位置計（二階＝1）', keep2, 1);
  }
}

// ===== T19：求解選項一律預設不勾 + 本機保存 =====
// 為什麼要守：技能是玩家練到才有的（掌握 Lv65；專心致志/快速改革需專家之證），
// 預設替他勾＝預設產出他按不出來的巨集。這條防有人日後把 checked 加回 index.html。
{
  const HTML19 = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const OPT_IDS = ['opt-manip', 'opt-heart', 'opt-qi', 'opt-backload', 'opt-adversarial'];
  OPT_IDS.forEach(id => {
    const tag = (HTML19.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)) || [''])[0];
    check(`T19 ${id} 預設不勾（index.html 無 checked）`, !!tag && !/\bchecked\b/.test(tag), `tag=${tag}`);
  });

  // 保存往返：獨立 context + 有實體的 localStorage（主 sandbox 的是 no-op stub）
  const mkCtx = (store) => {
    const els = {};
    const el = () => ({ checked: false, value: '', innerHTML: '', textContent: '', hidden: true,
      disabled: false, max: '', min: '', placeholder: '', dataset: {}, style: {},
      classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, getAttribute: () => null,
      addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
      appendChild() {}, removeChild() {}, insertAdjacentHTML() {}, focus() {}, scrollIntoView() {}, select() {} });
    const ctx = {
      ...LAYER_STUBS(),
      console: { log() {}, warn() {}, error() {} },
      document: { getElementById: (id) => els[id] || (els[id] = el()), querySelector: () => null,
        querySelectorAll: () => [], createElement: el, body: el() },
      location: { hostname: 'localhost', search: '' }, window: {},
      localStorage: { getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
      Worker: function () { this.postMessage = () => {}; this.terminate = () => {}; },
      fetch: () => Promise.reject(new Error('test: no network')),
      setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams,
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(GEAR_SRC, ctx, { filename: 'app-gear-t19.js' });
    vm.runInContext(RECIPE_SRC, ctx, { filename: 'app-recipe-t19.js' });
    vm.runInContext(FORMULA_SRC, ctx, { filename: 'app-formula-t19.js' });
    vm.runInContext(DATA_SRC, ctx, { filename: 'app-data-t19.js' });
    vm.runInContext(APP_SRC, ctx, { filename: 'crafter-app-t19.js' });
    return ctx;
  };

  const store = {};
  const a = mkCtx(store);
  a.document.getElementById('opt-manip').checked = true;
  a.document.getElementById('opt-backload').checked = true;
  a.saveSolveOpts();
  const b = mkCtx(store);                       // 新開一次頁
  b.loadSolveOpts();
  eq('T19 保存往返：勾選的選項重載後仍勾', b.document.getElementById('opt-manip').checked, true);
  eq('T19 保存往返：未勾的仍未勾', b.document.getElementById('opt-heart').checked, false);
  eq('T19 保存往返：第二群組也保存', b.document.getElementById('opt-backload').checked, true);

  // 竄改防禦：非布林值不套用（退回 HTML 預設），不因 localStorage 被亂改就產出怪狀態
  const bad = { 'ffxiv-crafter-solve-opts-v1': JSON.stringify({ 'opt-manip': 'yes', 'opt-qi': 1 }) };
  const c = mkCtx(bad);
  c.loadSolveOpts();
  eq('T19 保存值非布林 → 不套用', c.document.getElementById('opt-manip').checked, false);
  eq('T19 保存值為數字 → 不套用', c.document.getElementById('opt-qi').checked, false);
}

// ===== T20：app-level-sync.js 等級同步層（宇宙探索配方）=====
// 算錯的後果與「算錯巨集」同級且零訊號：Lv70 拿 rlv690 的難度 4026（實際 658）→ 求解回「做不到」，
// 或給一份貼進遊戲完全對不上的手法。identity（滿等不得改變任何東西）是這層最重要的護欄。
{
  const LS_SRC = fs.readFileSync(path.join(ROOT, 'app-level-sync.js'), 'utf8');
  const HTML_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const mkEl = () => ({ value: '', textContent: '', placeholder: '', hidden: false, addEventListener() {} });
  const mkCtx = (store) => {
    const els = {};
    const ctx = {
      ...LAYER_STUBS(),
      console,
      document: { getElementById: (id) => els[id] || (els[id] = mkEl()), activeElement: null },
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
      },
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(LS_SRC, ctx, { filename: 'app-level-sync.js' });
    ctx._els = els;
    return ctx;
  };

  const RLVT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/recipe_levels.json'), 'utf8'));
  const SYNCMAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/level-sync.json'), 'utf8'));
  const ctx = mkCtx({});
  const LS = ctx.CraftSync;

  // 基準 rlv＝該職業等級的最小 rlv。690/290 是實測值，不是推導出來的常數。
  eq('T20 Lv100 的基準 rlv', LS._minRlvId(RLVT, 100), 690);
  eq('T20 Lv70 的基準 rlv', LS._minRlvId(RLVT, 70), 290);
  eq('T20 Lv60 的基準 rlv（60 級有多列，取最小）', LS._minRlvId(RLVT, 60), 150);
  eq('T20 資料沒有的等級 → null（不硬湊相近的）', LS._minRlvId(RLVT, 101), null);

  LS.setData(SYNCMAP);
  const COSMIC = { id: 36165, rlv: 690, job: '木工' };
  const NORMAL = { id: 12345, rlv: 640, job: '木工' };

  eq('T20 不會同步的配方 → 不介入', LS.resolve(NORMAL, RLVT, 70), null);
  eq('T20 Lv70 做宇宙配方 → 降到 rlv 290', LS.resolve(COSMIC, RLVT, 70).row.id, 290);
  // identity：滿等時生效 rlv 必須就是配方存的那個 —— 這條同時也是「取最小 rlv」這個對照的依據
  eq('T20 identity：Lv100 的生效 rlv == 配方原始 rlv', LS.resolve(COSMIC, RLVT, 100).row.id, COSMIC.rlv);
  eq('T20 未填角色等級 → 不猜（回 null，沿用配方原始值）', LS.resolve(COSMIC, RLVT, 0), null);

  // 手動覆寫優先於角色等級；清空回到跟隨
  LS._setOverride(80);
  eq('T20 手動指定優先於角色等級', LS.resolve(COSMIC, RLVT, 70).row.id, 430);
  eq('T20 手動指定會標記為 manual', LS.resolve(COSMIC, RLVT, 70).manual, true);
  LS._setOverride(150);
  eq('T20 手動指定超過資料上限 → 收在上限（不外插出不存在的等級）',
    LS.resolve(COSMIC, RLVT, 70).row.id, 690);
  LS._setOverride(null);
  eq('T20 清空手動值 → 回到跟隨角色等級', LS.resolve(COSMIC, RLVT, 70).row.id, 290);

  // 不靜默換數字：同步後的說明必須寫出生效 rlv、三上限與配方原始值
  LS.render(COSMIC, LS.resolve(COSMIC, RLVT, 70), 70,
    { max_progress: 658, max_quality: 1728, max_durability: 40 });
  const note = ctx._els['ls-note'].textContent;
  eq('T20 說明寫出依據的等級與生效 rlv', /Lv 70.*rlv 290/.test(note), true);
  eq('T20 說明寫出三上限', /658.*1728.*40/.test(note), true);
  eq('T20 說明寫出配方原始值（讓玩家對得上遊戲畫面）', /原始.*Lv 100.*rlv 690/.test(note), true);
  eq('T20 會同步的配方 → 顯示這一區', ctx._els['level-sync'].hidden, false);
  LS.render(NORMAL, null, 70, null);
  eq('T20 不會同步的配方 → 整區隱藏（不留一個永遠沒作用的輸入框）', ctx._els['level-sync'].hidden, true);

  // 保存往返
  const store = {};
  const w = mkCtx(store);
  w.CraftSync.init({ $: null, onChange() {} });
  w._els['ls-level'].value = '70';
  w._els['ls-level'].addEventListener = () => {};
  w.CraftSync._setOverride(70);
  w.CraftSync.setData(SYNCMAP);
  // 直接走公開路徑保存：init 綁的是 DOM 事件，這裡用內部 setter + 再開一次頁驗證
  vm.runInContext('localStorage.setItem("ffxiv-crafter-level-sync-v1", JSON.stringify({level:70}))', w);
  const w2 = mkCtx(store);
  w2.CraftSync.init({ $: null, onChange() {} });
  w2.CraftSync.setData(SYNCMAP);
  eq('T20 保存往返：手動等級重載後仍生效', w2.CraftSync.resolve(COSMIC, RLVT, 100).row.id, 290);

  const bad = mkCtx({ 'ffxiv-crafter-level-sync-v1': JSON.stringify({ level: 'seventy' }) });
  bad.CraftSync.init({ $: null, onChange() {} });
  bad.CraftSync.setData(SYNCMAP);
  eq('T20 保存值非合法等級 → 退回跟隨角色等級', bad.CraftSync.resolve(COSMIC, RLVT, 100).row.id, 690);

  // 實資料不變量：**每一個**會同步的配方，其原始 rlv 都必須等於「資料所依據的最高等級」的基準 rlv。
  // 這條把「等級→rlv＝取該等級最小 rlv」這個對照釘在真實資料上：上游改版讓對照失效時會直接紅。
  const RECIPES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/recipes.json'), 'utf8'));
  const byId = new Map(RECIPES.map((r) => [String(r.id), r]));
  const ids = Object.keys(SYNCMAP);
  const orphan = ids.filter((id) => !byId.has(id));
  const broken = ids.filter((id) => byId.has(id)
    && LS._minRlvId(RLVT, SYNCMAP[id]) !== byId.get(id).rlv);
  check(`T20 level-sync.json 有資料（現況 768，實測 ${ids.length}）`, ids.length >= 768);   // 門檻＝宣告值，不留 68 筆的靜默縮水空間（健檢 R5 M19）
  eq('T20 同步清單裡沒有本站不存在的配方', orphan.length, 0);
  eq('T20 每個同步配方的原始 rlv == 其最高等級的基準 rlv（identity 全量）', broken.length, 0);
  eq('T20 index.html 有等級同步靜態骨架（不靠 JS 建 DOM，免 CLS 與游標遺失）',
    /id="level-sync"[\s\S]*id="ls-level"[\s\S]*id="ls-note"/.test(HTML_SRC), true);
  check('T20 index.html 載入 app-level-sync.js',
    HTML_SRC.includes('<script src="app-level-sync.js"></script>'));
}

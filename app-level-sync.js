// app-level-sync.js — 等級同步層：把「這個配方會依職業等級改變數值」翻成生效的 recipe level。
// classic script（同 app-quality-stages.js 手法）：發佈 globalThis.CraftSync，app.js init 注入依賴。
//
// 為什麼要這層：宇宙探索（Cosmic Exploration）的配方是**同一列資料**掛在多個等級級距的任務上
// （WKSMissionUnit 的 LevelGroup 1/2/3 共用同一個 recipe id、IsSynced=1），資料裡存的 rlv 690
// 是「Lv100 版本」。Lv70 的玩家看到 rlv 690 的難度 4026／品質 5760，比實際要做的（rlv 290 → 658／1728）
// 高出六倍——求解器會回「做不到」或給一份貼進遊戲完全對不上的巨集，而且**全程零錯誤訊號**。
//
// 資料＝data/level-sync.json（權威=game_ref.sqlite 的 recipe_level_sync，
// 由 Recipe.MaxAdjustableJobLevel 解出）。值＝該筆資料所依據的最高職業等級（現況恆為 100）。
//
// 等級 → 生效 rlv 的換算放在這裡而不是資料產生端：recipe_levels.json 是前端的資料，
// 在 Python 端再算一次就是第二份會漂移的對照（同 CQ-01 / quality-stages 的教訓）。
//
// **不靜默換數字**：只要生效等級不等於配方原始等級，畫面就要寫出「依 Lv X 同步 → rlv Y」
// 與配方原始值。玩家對不上遊戲畫面時，才分得出是等級選錯還是工具算錯。
(function () {
  let deps = null;         // app.js 注入：{ $, toast, onChange }
  let saveWarned = false;  // 保存失敗只提醒一次（同 crafting-list / app-quests 的慣例）
  let SYNC = {};           // recipe id → max_adjustable_job_level
  let override = null;     // 手動指定的等級；null ＝ 跟隨角色等級
  let last = null;         // 最近一次 apply 的結果（給 UI 重繪與測試查詢）

  const KEY = 'ffxiv-crafter-level-sync-v1';
  const $ = (id) => document.getElementById(id);

  /** 某職業等級的「基準 rlv」＝該等級所有 recipe level 中 id 最小的那個。
   *
   * 依據不是猜的：資料裡 MaxAdjustableJobLevel=100 的配方，存的 rlv 正好就是 Lv100 的最小 rlv（690）
   * —— 遊戲把可調整配方存成「最高等級版本」時用的就是這個對照，代入最高等級會還原成原值（identity）。
   * 找不到（等級超出資料範圍）回 null，由呼叫端退回配方原始 rlv，不硬湊一個相近的。
   */
  function minRlvId(rlvTable, level) {
    let best = null;
    for (const k in rlvTable) {
      const r = rlvTable[k];
      if (r && r.class_job_level === level && (best === null || r.id < best)) best = r.id;
    }
    return best;
  }

  /** 這個配方會不會依等級同步。回傳資料所依據的最高等級，否則 0。 */
  function maxLevelOf(recipe) {
    return (recipe && SYNC[String(recipe.id)]) || 0;
  }

  /** 解析生效的 recipe level 列。純函式（不碰 DOM），UI 與求解共用同一結果。
   *
   * @returns null ＝ 此配方不同步、或無等級可依據（呼叫端沿用配方原始 rlv）
   *          否則 { row, level, maxLevel, manual }
   */
  function resolve(recipe, rlvTable, charLevel) {
    const maxLevel = maxLevelOf(recipe);
    if (!maxLevel) return null;
    const manual = override !== null;
    const wanted = manual ? override : charLevel;
    if (!wanted || wanted < 1) return null;      // 沒填角色等級 → 不假裝知道，維持配方原始值並在 UI 說明
    const level = Math.min(wanted, maxLevel);    // 超過資料上限＝沒有更高的版本，取上限（等於原始值）
    const id = minRlvId(rlvTable, level);
    const row = id === null ? null : rlvTable[String(id)];
    if (!row) return null;
    return { row, level, maxLevel, manual };
  }

  // ---------- 保存（同求解選項：這一區的選擇會跟著人走）----------
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY)) || {};
      // 只認 1..100 的整數；被亂改就退回「跟隨角色等級」而不是產生怪等級
      override = (Number.isInteger(s.level) && s.level >= 1 && s.level <= 100) ? s.level : null;
    } catch (e) { console.warn('[crafter] 等級同步設定讀取失敗，改為跟隨角色等級:', e); override = null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(override === null ? {} : { level: override })); }
    catch (e) {
      console.warn('[crafter] 等級同步設定儲存失敗（可能是無痕模式）:', e);
      // 同其他保存點：一次性告知，別讓玩家以為指定的等級跟著他走（同 crafting-list 的 T40 教訓）
      if (!saveWarned) { saveWarned = true; deps?.toast?.('無法保存手動指定的等級（可能是無痕/私密模式），重整後會回到跟隨角色等級', 'warn'); }
    }
  }

  /** 重繪說明。呼叫端（app.js refreshSelectedGear）先 resolve 取生效 rlv 算出 maxes，再把兩者一起交回來
   *  —— 讓這裡自己再 resolve 一次就是同一份判斷跑兩遍，日後只改一邊就會前後不一致。 */
  function render(recipe, info, charLevel, maxes) {
    last = { recipe, info, charLevel, adjustable: !!maxLevelOf(recipe) };
    const box = $('level-sync');
    if (!box) return;                                    // 測試 sandbox 無此 DOM
    if (!maxLevelOf(recipe)) { box.hidden = true; return; }
    box.hidden = false;

    const inp = $('ls-level');
    // 使用者正在打字時不覆寫輸入框（每次 refreshSelectedGear 都會重繪，硬寫會把游標與半打的數字吃掉）
    if (inp && document.activeElement !== inp) inp.value = override === null ? '' : String(override);
    if (inp) inp.placeholder = charLevel ? String(charLevel) : '角色等級';
    const auto = $('ls-auto');
    if (auto) auto.hidden = override === null;

    const note = $('ls-note');
    if (!note) return;
    if (!info) {
      // 唯一會走到這裡的情況＝沒有等級可依據（未填角色等級且未手動指定）。
      // 此時**不猜**：維持配方原始資料並講明為什麼，以及去哪裡補。
      note.textContent = `尚未設定「${recipe.job}」的角色等級 → 暫用配方原始資料（Lv ${maxLevelOf(recipe)} · rlv ${recipe.rlv}）。`
        + '填角色等級、或在上面直接指定，數值才會對上遊戲。';
      return;
    }
    const src = info.manual ? `手動指定 Lv ${info.level}` : `角色等級 Lv ${info.level}`;
    const nums = maxes ? `（難度 ${maxes.max_progress} · 品質 ${maxes.max_quality} · 耐久 ${maxes.max_durability}）` : '';
    const same = info.row.id === recipe.rlv;
    note.textContent = same
      ? `已依${src} 同步 → rlv ${info.row.id}${nums}，與配方原始資料相同。`
      : `已依${src} 同步 → rlv ${info.row.id}${nums}。配方原始資料為 Lv ${info.maxLevel} · rlv ${recipe.rlv}。`;
  }

  function setOverride(v) {
    override = v;
    save();
    deps?.onChange?.();
  }

  globalThis.CraftSync = {
    init(d) {
      deps = d;
      load();
      const inp = $('ls-level');
      if (inp) inp.addEventListener('input', () => {
        const n = parseInt(inp.value, 10);
        // 清空＝回到「跟隨角色等級」（不用另設一顆按鈕當唯一出口）
        const next = inp.value.trim() === '' || !Number.isFinite(n) ? null : Math.min(100, Math.max(1, n));
        // clamp 後要**回寫輸入框**：不寫的話畫面停在 150 而實際生效的是 100，兩個數字不一致而沒有訊號。
        // （之後的重繪不會更正它——render 刻意不覆寫使用者正聚焦的欄位。同 app-gear.js 的等級 clamp 作法。）
        if (next !== null && String(next) !== inp.value.trim()) inp.value = String(next);
        setOverride(next);
      });
      const auto = $('ls-auto');
      if (auto) auto.addEventListener('click', () => {
        if (inp) inp.value = '';
        setOverride(null);
      });
    },
    setData(map) { SYNC = map || {}; },
    resolve, render,
    // 測試面 / 除錯面：純函式與內部狀態
    _minRlvId: minRlvId,
    _maxLevelOf: maxLevelOf,
    _setOverride(v) { override = v; },
    _last() { return last; },
  };
})();

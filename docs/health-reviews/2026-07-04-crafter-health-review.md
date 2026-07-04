# ffxiv-crafter 健檢報告（2026-07-04）

> 方法：`project-health-review` skill 五階段 — Scout → 機械基線 → 9 維度 Workflow fan-out（19 agents、~1.28M token）→ finding 對抗驗證（分層 skeptic）→ 雙視角評分。全 39 findings 皆經獨立 verifier 對抗查證，主迴圈再親自補驗頭條項。

## 總評：專案體質 **7.8** / 10 · 使用者友善 **7.1** / 10 — 內外皆穩、照常維護；待辦集中在「核心信任」與「首用感知」

2×2 象限落在「專案 ≥7 且使用者 ≥7」＝**內外皆穩**，但兩分都貼著 7 的線。地基（安全/正確/資料）扎實，主要缺口不是「壞掉」而是幾個**核心信任缺口**（高難度配方巨集無警語、改設定後舊巨集不失效、求解失敗訊息看不懂）+ **首載無 loading 指示** + **鍵盤無法選配方**。全部是小範圍、可逆的單檔改動。

- **未涵蓋維度**：`測試/CI` 未獨立 fan-out（併入機械基線 + quality/data 維度評估）；`memory 稽核` 因對應 memory 目錄為空而略過（回報「無 memory」）。`sec-backend` 不適用（純靜態站、無後端 API）。這三者的權重已在各視角內重新正規化。
- **0 個 finding 被 refuted**，但 verifier 下修 5 項 severity（RES-01/RES-02/perf-ux-02/perf-ux-03 medium→low、a11y-01 high→medium）+ 2 項 partial — 對抗驗證有生效，reviewer 因 CONTEXT 夠緊而少誤報（見「誤報／校正」段）。

---

## 機械基線（已驗，報告內不重跑）

| 項目 | 結果 |
|------|------|
| JS 語法 `node --check` | ✅ app.js / worker.js / pkg/crafter_wasm.js 全通過（node v24） |
| 測試套件 / lint / CI | ⚠ **無**（純 vanilla JS，repo 根無 package.json；此為現況，非隱藏測試） |
| 首載傳輸量（gzip 近似） | recipes 185KB + items 207KB + ingredients 94KB + wasm 104KB ≈ **~600KB gzip 下載** |
| 主執行緒 parse | ⚠ `loadData()` 啟動一次 `Promise.all` 抓 7 檔並主執行緒 `JSON.parse` **≈ 4.8MB 未壓縮**（recipes 3.5MB + items 1.3MB 為大宗）→ perf-ux 主軸 |
| is_expert 配方數 | 104 / 11803（corr-1 相關，親自查證屬實） |
| craft-actions ↔ lib.rs Action | 35 ↔ 35 完全對齊（無多無漏，親自查證） |

---

## 維度評分

### 專案體質視角（維護者）— 加權 **7.8** / 10

| 維度 | 分數 | confirmed | 一句話 |
|------|:---:|:---:|------|
| 正確性 — 核心公式/求解/狀態 | 7.5 | 3 | 公式與 JS↔WASM 契約嚴謹（u16 無溢位、serde 報錯非靜默截斷）；缺口在 expert 配方無警語 |
| 正確性 — 資料/對照表/DRY | 9.0 | 3 | 對照表對齊零誤差；僅未來 drift 韌性缺口（無機械護欄） |
| 安全性 — 前端/XSS/CSP/供應鏈 | 8.0 | 3 | 名稱字串全 esc、CSP 完整分域；剩轉義紀律一致性（icon/error 未 esc，非現行可利用） |
| 韌性 — 錯誤處理/WASM/降級 | 7.0 | 6 | try/catch 普遍到位；缺口在 worker 載入失敗復原 + Promise.all 全有全無 |
| 程式品質/可維護性/DRY | 8.0 | 6 | 命名清楚、無真死碼；少數 DRY 重複（配方上限公式、Rust 雙列舉） |
| 文件 — README drift + 衛生 | 8.0 | 3 | README 與實作高度一致；兩處過時 placeholder + 缺 repo CLAUDE.md |

### 使用者友善視角（FF14 製作玩家）— 加權 **7.1** / 10

| 維度 | 分數 | confirmed | 一句話 |
|------|:---:|:---:|------|
| 感知效能（perf-ux） | 7.0 | 4 | 求解 offload worker、快取策略好；缺口在首載空窗無 loading 指示 |
| UX 流程/回饋（ux-flows） | 7.5 | 6 | 引導/空狀態/防呆有心；缺口在求解失敗訊息看不懂 + 改設定後舊巨集不失效 |
| A11y / 跨裝置 | 6.5 | 5 | 行動/觸控大致到位；鍵盤族群第一步（選配方）即卡住 |

---

## 須修改項目（必做）— 真缺陷／核心信任風險

> 排序按「信任風險 + 使用者受阻」。前兩項直接命中本工具核心價值「巨集要能用」。

1. **[專案·correctness-core] 高難度(expert)配方顯示「✓ 可完成」卻無任何警語**（corr-1, medium）
   `app.js:165-167` solve-btn 僅在無 gear 時 disabled、對 is_expert 只關 adversarial；`lib.rs:129` replay 全程 `Condition::Normal`、`:155` 以 `progress>=max` 標「✓ 可完成」。104 個 expert 配方在遊戲內為**隨機製作狀態**，靜態 Normal 巨集的耐久/CP 預算無法對應 → 玩家貼進遊戲極可能中途失敗，工具卻自信顯示可完成。**核心信任風險**。

2. **[使用者·ux-flows] 求解成功後改任一設定，舊結果/巨集不失效**（ux-2, medium）
   `opt-manip/heart/qi/backload/adversarial`、`opt-target`、`solve-mode` **完全無 change listener**（親自 grep 確認）；改 HQ 素材/食物藥水只更新初始品質不碰 `#results`。玩家改完設定右側仍是舊巨集、無「已過期」提示，很可能複製到與當前設定不符的巨集 → **白做一爐**。唯獨「同配方改設定」這條沒防護（換配方 `app.js:128-130` 有清）。

3. **[使用者·ux-flows] 求解失敗直接吐求解器 Rust Debug 字串**（ux-1, medium）
   `app.js:306` 把 `lib.rs:178` 的 `format!("{:?}", e)`（英文列舉名）原封丟 toast。求解失敗的正是最需要幫助的玩家（數值/等級不足），卻看到亂碼且無「該怎麼辦」（升等/提升作業精度/開食物藥水/專家之證）。

4. **[使用者·perf-ux] 首載 ~4.8MB JSON parse 期間配方面板全空白、無 loading 指示**（perf-ux-01, medium）
   `index.html:92` #recipe-table 是空 div，`app.js:418` await loadData 後才 render。行動 4G 估 3–5 秒（靜態推斷）使用者看到空面板、無 spinner/skeleton、只有失敗才有提示 → 目標族群（行動玩家）易誤判工具壞掉離開。

5. **[使用者·a11y-compat] 配方列 `tr.onclick` 鍵盤/螢幕閱讀器不可選**（a11y-01, high→medium）
   `app.js:111,113` 配方列是純 onclick 的 `<tr>`，無 tabindex/role/keydown。核心任務第一步「選配方」鍵盤族群完全卡住（滑鼠/觸控可，故 proportionate 下修 medium，但仍是核心流程阻擋）。job-chip 與各鈕皆為真 `<button>`，唯獨最關鍵的配方列漏掉。

6. **[專案·correctness-core] 品質% 用 `Math.round` 在未滿時顯示「品質 100%」與 HQ 徽章矛盾**（corr-2, low)
   `app.js:348` `Math.round(v/m*100)`，滿品質判定另用 `>=`（:349）。quality=9999/max=10000 → 顯示「品質 100%」但無金色「·滿」、HQ 徽章卻算 98%，兩徽章矛盾誤導「要不要保證 HQ」的判斷。低成本改 `Math.floor` 即除（可與第 1、2 項的 render 工作同批）。

---

## 建議修改項目（可選）— 非缺陷改善／polish／候選

每項標 `[視角·維度] 標題 — file:line — 做法 — ROI`。

### 機械護欄（高 ROI，防核心巨集正確性 drift）
- `[專案·correctness-data]` **DATA-1** — `app.js:378` actionName 對未知技能靜默回退英文 → 巨集該行失效。**做法**：加零成本不變量檢查（lib.rs Action 變體集合 == craft-actions.json 鍵集合，現值 35=35）。**ROI 高**：低機率但一旦命中直接壞巨集。
- `[專案·quality]` **CQ-03** — `lib.rs:60-98 / 193-232` action_name 與 parse_action 兩份平行 35 列舉 → 加 `#[test]` round-trip 斷言 `parse_action(action_name(a))==Some(a)`。零資料成本、抓拼寫分歧。
- `[專案·quality]` **CQ-01** — `app.js:144-146 / 267-269` 配方三上限公式逐字重複兩處 → 抽 `recipeMaxes()` helper，防顯示上限與求解上限漂移。
- `[專案·sec-frontend]` **SEC-01** — `app.js:412` esc() 未轉義單引號（latent footgun）→ 補 `'` 進字元類 + `&#39;`（零風險、與現有雙引號用法相容）。

### 韌性補強
- `[專案·resilience]` **RES-01** — `app.js:292` worker.onerror 未 `worker=null` 重建 + 無 solver timeout → onerror 內設 `worker=null`，doSolve 貼訊後加保底 `setTimeout`(30-60s) 逾時提示。**同時補上 expert 配方 runaway 只能手動取消的自動降級**。
- `[專案·resilience]` **RES-02** — `app.js:29-37` Promise.all 全有全無，meals/medicine 失敗拖垮整站 → 非必要資料改獨立 catch 降級（FOOD/POTION 設空、下拉只有「無」）。
- `[專案·resilience/使用者·ux-flows]` **RES-05＝ux-4** — `app.js:399` clipboard 不可用同步拋 TypeError、reject handler 掛不上 → 先判 `navigator.clipboard?.writeText`，失敗 fallback `textarea.select()` + 「請按 Ctrl/⌘+C」提示。
- `[專案·resilience]` **RES-03** — `app.js:30-36` fetch 無 `r.ok` 守衛 → 加 `if(!r.ok) throw` 讓 HTTP 錯誤落入既有 catch。
- `[專案·resilience]` **RES-04** — `app.js:413` toast fallback 只 console.log，CDN 未載時玩家看不到回饋 → fallback 用最小原生提示。
- `[專案·resilience]` **RES-06** — `app.js:304-308` render 未包 try/catch，WASM 契約漂移會空白無提示 → 包一層 try/catch + toast 降級（info）。

### 安全一致性
- `[專案·sec-frontend]` **SEC-02** — `app.js:48,62` gearset localStorage 值未數字化即插入 value 屬性（self-XSS）→ render 時 `Number(v)||''` 或 loadGear 數字白名單清洗。
- `[專案·sec-frontend]` **SEC-03** — `app.js:65/111/152/182/379/352` icon 路徑與引擎 error 未 esc（一致性）→ 包 esc()，讓「資料→innerHTML 必 esc」成無例外不變量。

### 感知效能
- `[使用者·perf-ux]` **perf-ux-02** — `app.js:432,434` 搜尋/rlv 輸入無 debounce → 包 ~150-200ms debounce。
- `[使用者·perf-ux]` **perf-ux-03** — `app.js:101` 逐次 `localeCompare(...,'zh-Hant')` → 改預建 `const COLLATOR = new Intl.Collator('zh-Hant')`。
- `[使用者·perf-ux]` **perf-ux-04** — `app.js:439` WASM 預熱排在 loadData 後 → 提前/並行讓 WASM download 與資料 fetch 重疊。

### A11y／UX polish
- `[使用者·a11y-compat]` **a11y-02** — `index.html:59-62` role=tab 缺 aria-selected/controls → switchTab 同步 `aria-selected`、panel 加 role=tabpanel（改 3 行）。
- `[使用者·a11y-compat]` **a11y-03** — `app.js:320` 求解完成 aria-live 清空無播報 → render 成功時在 live region 寫「求解完成：品質 XX%、N 步」。
- `[使用者·a11y-compat]` **a11y-04** — `styles.css:109,149` HQ 框 42×26px 觸控偏小 → 高度 ≥40px 或以「全部 HQ」鈕為主路徑。
- `[使用者·a11y-compat]` **a11y-05** — `app.js:309-312` 取消後焦點落回 body → 顯式移焦到可見元素。
- `[使用者·ux-flows]` **ux-3** — `app.js:425-428` 深連結 ?recipe/?item 找不到靜默無回饋 → toast「找不到指定配方（可能不可製作）」。
- `[使用者·ux-flows]` **ux-5** — `app.js:282` 目標品質超上限靜默 clamp → 即時回填 maxQ 或提示「已達配方上限」。
- `[使用者·ux-flows]` **ux-6** — `app.js:281` NQ 模式「目標品質」欄仍可編輯但被忽略 → disable/灰化。

### 可維護性
- `[專案·quality]` **CQ-02** — `worker.js:6-7` cmd 為死欄位（worker 從不讀）→ 去掉 cmd 只送 {input}，或補 dispatch。
- `[專案·correctness-data/quality]` **DATA-2＝CQ-04** — `app.js:9-15` DOH/JOB_ICON hardcode 無權威源/AUTO-SYNC marker（jobs.json 僅 21 戰鬥職，不含製作職）→ 加 marker 或註解「刻意 local」免月稽核誤報；可加不變量 `Set(DOH)==recipes.job distinct`。
- `[專案·quality]` **CQ-05** — `lib.rs:34,36,51,52` WASM Output 有前端未消費欄位（i/action_id/final_durability/final_cp）→ 精簡或註解「保留給 simulate」。
- `[專案·quality]` **CQ-06** — `app.js`(446 行) 承載 6+ 職責、逼近 500 → 前瞻備註：下次實質擴充破 500 時按 data/gear/formula/solve/render 分層（現階段不動）。

### 文件（待 user 確認候選）
- `[專案·docs-drift]` **DOC-01** — `README.md:5` 標「（部署後填）」但已上線 → 改「https://ffxiv-crafter.pages.dev/（已上線）」。
- `[專案·docs-drift]` **DOC-02** — `README.md:42` 標「待補 LICENSE」但 LICENSE 檔已存在 → 改「（見 LICENSE）」。
- `[專案·docs-drift]` **DOC-03** — 無 repo CLAUDE.md → 候選：補一份精簡 CLAUDE.md（hqPercent 勿改／公式已驗／craft-actions DRY／繁中服正名 + 指回 spec/ADR-013），或明確標「刻意不建」免月稽核反覆提。

---

## 誤報 / 校正（對抗驗證證據）

0 個 finding 被完全 refuted，但驗證確實生效——5 項 severity 下修 + 2 項 partial：

| finding | 原 → 校正 | 校正理由 |
|---------|-----------|---------|
| RES-01 | medium → **low** (partial) | reviewer 稱「再求解仍是同一死物件」**錯誤**：`cancelSolve`(app.js:309) 無條件 `newWorker()` 重建；且 onerror 僅 module 載入失敗觸發（WASM fetch 失敗已被 worker.js:11 接住）。觸發窄。 |
| RES-02 | medium → **low** | 7 檔同一次 CF Pages 部署、同源，單檔失敗機率低。 |
| perf-ux-02 | medium → **low** | 11803 陣列 filter 實際極快、DOM 重建上限 120 列，衝擊量級不大；IME 觸發為推測。 |
| perf-ux-03 | medium → **low** (partial) | 「localeCompare 是這段最重成本」與 CONTEXT 給定「4.8MB parse 為載入主成本」矛盾，相對成本主張未驗證、誇大。 |
| a11y-01 | high → **medium** | proportionate：免費社群工具、FF14 玩家壓倒性用滑鼠/觸控，受影響僅鍵盤/AT 少數且非正確性缺口。 |

主迴圈補驗（非 agent）：`simulate()` 只存在於生成的 pkg/，app.js/worker.js 未呼叫 → 確認是**保留的 WASM 導出、非前端死碼**（多維度 verifier 一致）；104 expert 配方數屬實；ux-2 的 opt-* 無 listener 親自 grep 確認。

---

## Memory / 文件稽核

- **Memory**：對應目錄 `~/.claude/projects/D--FFXIVProject-external-ffxiv-crafter/memory/` 為**空**（無 MEMORY.md、無 feedback/reference 檔）→ 無去重/drift/升級候選。此工具的教訓目前散在程式內註解與外部 spec/ADR-013。
- **文件 drift**（待確認候選，不自動改）：DOC-01（README 部署狀態）、DOC-02（LICENSE 狀態）皆確認 drift、低嚴重度。
- **CLAUDE.md 衛生**：本 repo 無 CLAUDE.md（DOC-03）→ 建議補精簡版或明確標「刻意不建」（proportionate，小工具不強求）。

---

## 既有設計亮點（誠實列，兩視角都有）

**專案體質**
- 公式與 JS↔WASM 契約嚴謹：`max_quality=target-initial`「還需補多少」的 delta 模型與 replay 累計顯示、hqPercent 三者一致；u16 無溢位；serde 對超界值**報錯而非靜默截斷**（不會產錯巨集）。
- 安全防護扎實：所有名稱字串進 innerHTML 前皆 esc；CSP 完整分域（img/connect/frame-ancestors/base-uri/form-action）；深連結以 `+` 強制數字化；rel=noopener 齊全。找不到可利用 XSS。
- 資料層零誤差：craft-actions 35↔lib.rs 35 完全對齊、DOH 集合與 recipes.job 相等、icon_id 規則正確。
- DRY 鐵則遵守：craft-actions 繁中名/icon 來自 game_ref（build-data.py），無自建對照表。
- 錯誤處理普遍有 try/catch（loadGear/saveGear/worker/init IIFE）、selectRecipe 缺 rlv 守衛、gearFor null 降級。

**使用者友善**
- 求解 offload web worker → 主執行緒不阻塞、求解中有 spinner + aria-live + 可取消 + 「（高難度可能數秒）」預期設定。
- 引導與防呆有心：first-run-hint、無數值時 solve-btn disabled + gear-warn 明說原因並給連結、換配方清舊結果、空狀態處理、複製有成功/失敗 toast、目標品質 clamp。
- 跨裝置：viewport 允許縮放、work 兩欄 ≤760px 收單欄、表格 overflow 橫捲、圖示 loading=lazy、快取策略讓回訪走 304。

---
> 配套修復計畫見同目錄 `2026-07-04-crafter-fix-plan.md`。

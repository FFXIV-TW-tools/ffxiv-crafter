# ffxiv-crafter 修復計畫（2026-07-04）

> 依據：同目錄 `2026-07-04-crafter-health-review.md`。所有改動皆為小範圍可逆單檔（app.js / index.html / styles.css / wasm/src/lib.rs / tools/）。
> **STOP gate**：commit 可做（先知會），**push 走 CF Pages 自動部署對外可見 → 由 shawn 自己跑 `!git -C external/ffxiv-crafter push`**。

---

## 須修改（必做）— 批次化

### 批次 0：機械護欄 + 文件 drift（安全網先行 · 預期 1-2 commit）
> 先建立 drift 防護與確定性文件修正，作後續批次的安全網。全部零風險。

- **[0-1] action-set 不變量檢查（mechanize DATA-1）**
  - 動機：`actionName`(app.js:378) 對未知技能靜默回退英文 → 巨集該行失效；WASM 與 build-data 兩條獨立產線可 drift
  - 檔案：`tools/build-data.py`（尾端加斷言）或新 `tools/check-actions.py`
  - 做法：擷取 `wasm/src/lib.rs` 所有 `Action::(\w+) =>` 變體集合，斷言 == `data/craft-actions.json` 鍵集合（現值 35=35），不符即 exit 1
  - 驗證：`py -3.11 tools/check-actions.py` 綠；手動刪 craft-actions 一鍵測試紅燈
  - 依賴：無

- **[0-2] parse_action round-trip 測試（mechanize CQ-03）**
  - 動機：`action_name`/`parse_action`(lib.rs:60-98/193-232) 兩份平行 35 列舉，拼寫分歧不會編譯報錯
  - 檔案：`wasm/src/lib.rs`（`#[cfg(test)]`）
  - 做法：對所有 `Action` 變體斷言 `parse_action(action_name(a)) == Some(a)`
  - 驗證：`cd wasm && cargo test`（需 rust toolchain）
  - 依賴：無

- **[0-3] README drift 修正（DOC-01 / DOC-02）**
  - 檔案：`README.md:5`（「（部署後填）」→「https://ffxiv-crafter.pages.dev/（已上線）」）、`README.md:42`（「待補 LICENSE」→「見 LICENSE」）
  - 驗證：肉眼；可加 grep 不變量（含「部署後填」或「待補 LICENSE」即 fail）
  - 依賴：無

- **[0-4]（候選·待 shawn 確認）補精簡 repo CLAUDE.md + VERIFY 段（DOC-03）**
  - 動機：本 repo 無 CLAUDE.md，未來 LLM 拿不到工具鐵則（易誤改 hqPercent 表）
  - 做法：補 `<repo>/CLAUDE.md`，收 4 條鐵則（hqPercent 權威表勿改／公式已驗 spec §4／craft-actions DRY=game_ref／繁中服正名）+ VERIFY 段（掛 [0-1] check + node --check）+ 指回外部 spec/ADR-013；**或**判定 README 已足夠則明確標「刻意不建」
  - 依賴：0-1（VERIFY 段引用該 check）

### 批次 1：核心信任 — render / 結果狀態（app.js render 區 · 預期 1 commit）
> 直接命中「巨集要能用」的兩個信任缺口 + 一個顯示矛盾。

- **[1-1] expert 配方求解結果加不可用警語（corr-1, medium）**
  - 動機：104 個 expert 配方為隨機製作狀態，靜態 Normal 巨集無法對應，工具卻顯示無條件「✓ 可完成」
  - 檔案：`app.js` render()（result-summary 區 ~353-362）+ refreshSelectedGear（~166）
  - 做法：`selected.recipe.is_expert` 時，結果區加明顯警告條「⚠ 高難度配方為隨機製作狀態，此靜態巨集僅供參考、無法保證完成」，且 expert 不顯示無條件「✓ 可完成」金徽（改中性「試算完成」或附星號）
  - 驗證：選一個 is_expert 配方求解 → 看到警語、無綠色無條件可完成徽章
  - 依賴：無

- **[1-2] 改任一求解設定使舊結果/巨集失效（ux-2, medium）**
  - 動機：opt-*/opt-target/solve-mode/HQ 素材/食物藥水/**角色數值**改動後右側仍是舊巨集、無提示 → 複製到過時巨集白做一爐
  - 檔案：`app.js`（抽 `invalidateResults()` + 多處呼叫點）
  - 做法：抽 `invalidateResults()`（隱藏 #results、還原 placeholder「設定已變更，請重新求解」或灰化 + 收合複製鈕）。**採「集中失效」而非逐 input 綁**（計畫審修正）——從既有 handler 統一呼叫，一次涵蓋程式化改值與 gear 傳播：
    - `opt-manip/heart/qi/backload/adversarial`、`opt-target`、`solve-mode`：靜態元素，init 綁一次 change/input handler → 內呼 invalidateResults
    - **`.gear-in`（角色數值）**：`onGearInput`(app.js:75-80) 內加呼叫（審查發現：改 gear 同屬 ux-2 bug，原清單漏列）
    - **`.ing-hq-in`（HQ 素材）**：listener 須掛在 `renderIngredients`(app.js:192) 內（每次換配方 innerHTML 重建，不能只 init 一次）；且 **「全部 HQ」鈕**(app.js:194) 程式設值不觸發 input → 該 onclick 內須手動呼 invalidateResults
    - 食物/藥水/specialist（app.js:431 已綁 updateEff）：handler 內加呼叫
  - ⚠ 三者共寫 `#results-placeholder`（PH_HTML / 求解中 / 「設定已變更」）：定義文案優先序避免打架
  - 驗證：求解成功後分別改「求解選項 / 目標品質 / HQ 素材 / 全部 HQ 鈕 / 食藥 / 角色數值」六類 → 舊結果皆消失/灰化並提示重新求解
  - 依賴：無
  - mechanize：測試斷言每個 opt-* / #opt-target / .ing-hq-in / .gear-in / 全部 HQ 鈕都會觸發失效

- **[1-3] 品質% 改 Math.floor 除去假 100%（corr-2, low）**
  - 檔案：`app.js:348` `pct` 的 `Math.round` → `Math.floor`（與 hqPercent 內部一致）
  - 驗證：品質 9999/10000 → 顯示「品質 99%」非 100%、與 HQ 徽章一致
  - 依賴：無
  - mechanize：grep `Math.round(v / m * 100)` 作禁用 pattern

> 順帶同批（同 render/設定區、可一起 commit）：**ux-6**（NQ 模式 disable「目標品質」欄）、**ux-5**（超上限即時回填 maxQ 或提示）。

### 批次 2：求解回饋與復原 — solve 路徑（app.js worker 區 · 預期 1 commit）
- **[2-1] 求解失敗訊息繁中人話 + 下一步（ux-1, medium）**
  - 動機：`app.js:306` 直吐 Rust `{:?}` Debug 英文字串，最需幫助的玩家看不懂
  - 檔案：`app.js` onWorkerMsg(304-308)
  - 做法：**先枚舉** `lib.rs:178 format!("{:?}",e)` 會吐的 solver error 變體，建繁中對照表 + 行動建議（如「以目前數值無法完成此配方 — 試著提升作業精度/等級、開啟食物藥水或專家之證後再求解」）；**未映射到的留通用 fallback**（繁中泛用訊息 + 原文進 console）
  - 驗證：以偏低數值觸發求解失敗 → 看到繁中可讀訊息；未知錯誤走 fallback 不露原文
  - 依賴：無

> 順帶同批（同 solve 路徑）：
> - **RES-01（建議·low）**：onerror 內 `worker=null`，doSolve 貼訊後加保底 `setTimeout` 逾時提示。**（計畫審修正）**：① timeout 必須在 `onWorkerMsg`/`cancelSolve` 內 `clearTimeout`（否則求解成功後才彈逾時）；② 採**軟提示**（顯示「求解逾時，可重試或取消」、保留手動取消）**而非自動 terminate**（會與正常長求解衝突，UI 自己寫「高難度可能數秒」）；逾時值取遠高於最壞合理求解時間（如 60-90s）。
> - **RES-06（建議·info）**：render 呼叫外包 try/catch → 契約漂移時 toast 降級而非空白。

### 批次 3：首載感知 + 選配方可達 — load/table 路徑（app.js/index.html/styles.css · 預期 1 commit）
- **[3-1] 首載 loading 指示（perf-ux-01, medium）**
  - 動機：~4.8MB JSON parse 期間配方面板全空白、成功路徑無回饋 → 誤判壞掉
  - 檔案：`index.html:92` #recipe-table（或 #job-chips）先放佔位、`app.js` loadData 完成由 renderTable 覆蓋
  - 做法：初始放「載入配方資料中…」+ codex-spinner（沿用求解中同元件），loadData 成功後由 renderTable 覆蓋。**（計畫審修正）**：init catch(app.js:440-445) 失敗路徑須**一併清掉該佔位**（否則載入失敗時 #recipe-table 的 spinner 殘留、與失敗橫幅並存打架）
  - 驗證：DevTools throttle Slow 3G reload → 看到載入中提示而非空白；模擬 fetch 404 → 只剩失敗橫幅、無殘留轉圈
  - 依賴：無

- **[3-2] 配方列鍵盤/AT 可選（a11y-01, medium）**
  - 動機：`app.js:111,113` 配方列是純 onclick `<tr>`，鍵盤族群核心第一步卡住
  - 檔案：`app.js` renderTable(110-113) + `styles.css`（focus 樣式）
  - 做法：`<tr>` 加 `tabindex="0"` + 綁 keydown（Enter/Space → selectRecipe，**Space 須 `preventDefault` 防捲動**）+ 補 `.rt-row:focus-visible` 樣式。**不加 `role="button"`**（計畫審修正：會覆蓋 `<tr>` 隱含 row 角色、破壞表格 row/cell 與欄標題「職業/Lv/配方等級」關聯）；若要更強語意，改把名稱格內容包成真 `<button>`
  - 驗證：純鍵盤 Tab 到配方列 + Enter/Space 選取成功、Space 不捲動頁面
  - 依賴：無
  - mechanize：機械檢查 role=tab 元素須具 aria-selected（配合 a11y-02）

> 順帶同批（同 load/table 路徑）：**perf-ux-02**（搜尋/rlv debounce 150-200ms）、**perf-ux-03**（預建 `Intl.Collator('zh-Hant')`）、**perf-ux-04**（WASM 預熱提前並行）、**a11y-02**（switchTab 同步 aria-selected + panel role=tabpanel）、**a11y-03**（render 成功寫 aria-live 完成播報）。

---

## 建議修改（可選）— 輕量清單 + ROI

> 未進上面批次的 polish；按子系統分組，行有餘力再做。

**安全縱深**
- SEC-01 `app.js:412` — esc 補單引號 `/[&<>"']/` + `&#39;` — 讓 esc 成無例外通用轉義 — ROI 中（防 latent footgun，零風險）
- SEC-02 `app.js:48,62` — gearset value render 時 `Number(v)||''` — 堵 self-XSS sink — ROI 低
- SEC-03 `app.js:65/111/152/182/379/352` — icon/error 也包 esc — 轉義紀律一致 — ROI 低

**韌性**
- RES-02 `app.js:29-37` — meals/medicine 改獨立 catch 降級 — 非必要資料不拖垮整站 — ROI 中
- RES-03 `app.js:30-36` — fetch 加 `if(!r.ok) throw` — HTTP 錯誤明確降級 — ROI 中
- RES-04 `app.js:413` — toast fallback 用原生提示非 console.log — CDN 未載時仍有回饋 — ROI 低
- RES-05＝ux-4 `app.js:399` — clipboard `?.` 判存在 + `textarea.select()` fallback — 行動 webview 複製有降級 — ROI 中（核心複製動作）

**A11y / UX**
- a11y-04 `styles.css:109,149` — HQ 框高度 ≥40px 或以「全部 HQ」為主路徑 — 行動觸控 — ROI 低
- a11y-05 `app.js:309-312` — cancel/solve 後顯式移焦 — 鍵盤流暢 — ROI 低
- ux-3 `app.js:425-428` — 深連結找不到 toast 提示 — 從 marketboard 點過來不迷路 — ROI 中

**可維護性**
- CQ-01 `app.js:144-146/267-269` — 抽 `recipeMaxes()` helper — 防顯示/求解上限漂移 — ROI 中（+ grep 不變量）
- CQ-02 `worker.js:6-7` — 去死欄位 cmd 或補 dispatch — 契約自洽 — ROI 低
- DATA-2＝CQ-04 `app.js:9-15` — DOH/JOB_ICON 加 AUTO-SYNC marker 或註解「刻意 local」+ 不變量 `Set(DOH)==recipes.job distinct` — 免月稽核誤報 — ROI 低
- CQ-05 `lib.rs:34,36,51,52` — 精簡未消費 Output 欄位或註解「保留給 simulate」— ROI 低
- CQ-06 `app.js`(446 行) — 前瞻：下次破 500 時按 data/gear/formula/solve/render 分層 — **現階段不動** — ROI n/a

---

## 執行備註

- **commit 顆粒度**：批次 0-2 各一主題 commit（批次 0 可拆「機械護欄」與「文件」兩 commit）；**批次 3 拆兩 commit**（計畫審修正：a11y 一組 = 選配方鍵盤 + aria；perf 一組 = loading + debounce + collator + WASM 預熱），避免單 commit 跨多主題（對齊 git-workflow「按主題切 commit」）。訊息用繁中、scope=`crafter`（如 `fix(crafter): expert 配方巨集加不可用警語 + 改設定失效舊結果`）。**不加 Co-Authored-By 行**（shawn 偏好）。
- **精準 stage**：`git add <特定檔案>`，禁 `git add .`。
- **STOP · push**：push → CF Pages 自動部署對外可見 → 由 shawn 執行 `!git -C external/ffxiv-crafter push`（cmd.exe，Windows Credential Manager）。
- **驗證**：本 repo 無自動測試 → 改動後跑 `python -m http.server 8809` 於 repo 根 + portal svc :8774 提供 codex CDN，手動 smoke 各批次「驗證」欄。批次 0-1/0-2 的機械檢查是**新增的 VERIFY 資產**（ratchet 累積端）。
- **機械化 ratchet 收割**：0-1（action-set 不變量）、0-2（round-trip test）、1-2/1-3 的 mechanize 完成後掛進候選 CLAUDE.md 的 VERIFY 段 → 下次健檢 Phase 2 零 token 重驗。
- **待 shawn 拍板**：0-4（是否補 CLAUDE.md）、DOC-01/02（README 文字）、DATA-2（DOH 是否納 sync）皆為候選、不自動改。

---

## 獨立計畫審 gate（Phase 5）

須修改項 = 6（≥5，觸發 gate），但修法皆小範圍加法式 UI/顯示改動、**無 critical、不動資料模型/儲存/對外 API/安全信任邊界** → 屬低架構風險。已派 clean-context agent 審計畫本身（不重驗 findings）。

**gate 裁決：計畫方向、順序、範圍皆可直接執行，無 blocker。** 落地前釘死三件實作細節（已併入上面對應批次）：
1. **[1-2] invalidateResults 覆蓋面**：補 `.gear-in`（角色數值）與「全部 HQ」鈕（程式設值不觸發 input）、`.ing-hq-in` listener 掛在 renderIngredients 內、改集中失效。
2. **[3-2] 配方列 a11y**：不用 `role="button"`（破壞表格語意），改純 `tabindex="0"` + keydown + Space `preventDefault`。
3. **[RES-01] worker timeout**：須 `clearTimeout`（成功/取消時）+ 採軟提示而非自動殺 worker。

其餘小校正（2-1 錯誤 fallback、3-1 失敗清佔位、批次 3 拆 a11y/perf 兩 commit）亦已併入。

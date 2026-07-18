# CHANGELOG — ffxiv-crafter

> 記 root 級 / 跨檔改動與「為什麼」。日常配方資料重建（`build-data.py` 產 data/）不入此檔。格式：新的在上。

## 2026-07-19 — 配方瀏覽 UX 再強化（已加入清單綠底標示／道具種類副行／職業篩選方形化）＋ codex/grok 雙審修正

依 Owner 一輪回饋（分頁序／加清單無反饋／橢圓標籤／不知哪些已加入／配方名補說明）。旁路 cycle `2026-07-19-browse-ux`。code commit `5e399d78`；對抗審 `.adversarial-reviews/5e399d78-{codex,grok}.md`（codex 3 / grok 11 findings）triage 後修正。

**功能：**
- **已在清單持久標示**（核心，Owner「頁面除通知外根本沒提示、不知哪些已加入」）：配方表已在清單的列**整列換綠底**（`color-mix` success 14%）＋左緣 success 色條＋名稱旁「已加入 ×N」綠徽章。加入/移除/改數量即時同步：`CraftList` 暴露 `has/count`＋`onChange` 回呼；app.js `markListState` **in-place 更新**（不重建表→保留焦點），renderTable 初繪與 CraftList 變更皆呼叫。**為什麼**：綠底掃視是「已加入」最直接訊號，補足原本只有一閃通知。
- **道具種類副行**（Owner「配方名補說明如道具種類」）：配方名下方補繁中道具種類（`item_lookup.ui_category`，繁中正名、配方成品 100% 覆蓋 11333/11333）。`build-data.py` 加 `category` 欄（保持權威）、`items.json` surgical 重生（只讀已 commit 的 recipes/ingredients、不重抄 static-data 避免 drift；13759 items 全含 category）。
- **職業篩選方形化**（Owner「不要橢圓標籤、參照共用設置」）：pill `.codex-chip` → 方形 `.codex-btn` 分段條（選中 `--primary` 填色 / 未選 `--ghost`），保留真實職業 icon（JOB_ICON→xivapi，非 emoji）；不本地覆寫 codex-* 屬性。參照生態既有（ranking role 篩選為方形條）。
- **toast 帶配方名**：加入通知由通用文案改帶配方名。**分頁序**：角色數值移到最右（求解 / 清單 / 角色數值）。

**codex/grok 雙審 triage（反查程式碼、真的才修）：**
- 🔴 **cap 謊報**（codex 中 / grok 低）：qty 到 999 上限仍報「+1（共 999）」而資料沒變 → `add()` 早退＋warn toast，不謊報、不觸發無效 render/notify。
- 🔴 **✓ 假 affordance**（grok 高）：in-list 按鈕原改 ✓ 填色，像「已完成/點擊取消」但實際 +1 → **按鈕恆為 ＋**（動作一致），in-list 只靠綠底＋徽章；順帶移除 `data-name`（grok 質疑雙重編解碼）。
- **markListState 守衛**（grok 中）：加 `typeof CL.count !== 'function'` feature-detect（舊快取/半套 init 不炸整表互動）。
- **is-sel + rt-in 疊加**（grok 中）：加 `.rt-in.is-sel` accent 淡染＋is-sel 外框 → 選中的 in-list 列選中態不被綠底吃掉（headless 實測 bg=accent16% / outline=cyan）。
- **徽章位置**（grok 低）：移到名稱同行旁（`.rt-nmline`）。
- **駁回（反查後）**：grok「toast XSS」＝誤報（portal `FFXIVToast` 用 `textContent`、item_name 可信遊戲資料，esc 反顯字面 `&lt;`）；grok「死 codex-chip CSS」＝已無殘留（grep 零）、flex-wrap 防溢出。
- **測試固化**（codex/grok「新行為零測試」）：加 T10 清單 add/has/count＋上限誠實＋onChange 次數；**基線 40→50**。
- **app.js 502 行 >500**（codex 阻擋 / grok 中）：拆分候選正式立 **B-007**（app-browse.js）交 Owner 拍板；本輪不當場擴 scope（鐵則「列候選不當場擴大」＋避免剛驗證的 code 回歸風險）。

**驗證**：node --check／test-formulas **50 passed**／design-lint（success fallback 對齊 tokens `#7dd87d`）；瀏覽器實測綠底／徽章名稱行／按鈕保持 ＋／種類副行／篩選重建保留／選中疊加／分隔線對齊（td 底邊逐欄一致 448/495/…）皆綠。push 待 Owner。

## 2026-07-19 — B-002 app.js 職責拆分（658→488 行，<500 達標）＋ portal `.codex-btn[hidden]` 守衛

Owner 核可 B-002。**為什麼**：整合改造後 app.js 達 645 行、兩輪雙審阻擋「god-file 續膨脹、跨功能回歸風險」。
- **拆分策略**：沿用本 repo 已驗證的 `crafting-list.js` **classic-script + deps 注入** pattern（非重寫每個狀態參照、非引入 globals 碰撞風險）。抽最自包含的兩層：
  - `app-render.js`（`globalThis.CraftRender`，120 行）：hqPercent(純)/render/手法序列 chips/走查/巨集。注入 **getter**（getSelected/getItems/getActions）取 live 狀態——loadData 會重賦值 ITEMS/ACTIONS 綁定，持舊參照看不到新資料。
  - `app-solve.js`（`globalThis.CraftSolve`，98 行）：worker 生命週期/doSolve/求解計時/結果分派/取消/setSolving。worker·solveClock 為該層私有；渲染委派 CraftRender、公式/gear/switchTab 由 app.js 注入。`invalidateResults` **留 app.js**（被 gear/原料/求解輸入多處外部呼叫、求解層內部不呼叫它）。
- **未全做原 6 層**：formula/gear/data 仍在 app.js——`computeSettings` 是對抗驗證公式（AGENTS 鐵則「勿動」），機械化拆它風險高於效益，且 488 已達標。
- **test-formulas 相容**：app.js 未用 ES import（仍 classic-interop via globalThis），vm 載入手法不破；hqPercent 改從先載的 app-render.js 取；**40 passed 持平**。
- **portal 守衛**（B-006 部分，另 repo commit `cf3813d`）：`header.css` 加 `.codex-btn[hidden], .codex-chip[hidden] { display:none }` 集中守衛（display:inline-flex 蓋 UA [hidden]）；crafter 本地 interim 守衛待 CDN 上線後移除。
- **驗證**：node --check ×5 檔 syntax OK / test-formulas 40 / check-actions 35=35 / cargo test 2；瀏覽器實測 rlv710 求解 doSolve→worker→onWorkerMsg→render 端到端正確（品質條/巨集分段/複製/手法序列 icon chips/走查/狀態列）、零 console error。

## 2026-07-19 — 整合改造第二輪雙審 + 增強（複製清單／等高欄／scope 修正）

第二輪 codex+grok 雙審（span `744449ed`，報告 `.adversarial-reviews/744449ed-{codex,grok}.md`）triage ＋ Owner「優化與加強／求解器整齊美化」追加：
- 🔴 **openedFromList 頂部 tab 洩漏**（雙審，上輪未補完）：原只在返回鈕/showPicker 清 flag、**點頂部「製造清單」tab 沒清** → 集中到 `switchTab` 離開 solve 即清 flag + 收返回鈕（涵蓋所有出口）。
- 🔴 **`.codex-tab` 全域選擇器劫持**（codex 高）：switchTab/init 用 `document.querySelectorAll('.codex-tab')` 會綁到 portal 共用分頁元件 → tablist 加 `#main-tabs` 容器 id、所有查詢 scope 化。
- **`.codex-btn[hidden]` 收窄**：由覆寫共用 `.codex-btn` 改為本工具具體按鈕 ID（`#change-recipe/#cancel-btn/#solve-btn/#back-to-list[hidden]`），不碰共用根 selector（codex 阻擋）。
- **配方表事件委派**：取代每列 2N listener（篩選重繪不重綁、行動省 GC）；＋ 缺 CraftList 補 error toast（不靜默吞）。
- **mbItem/mbCraft 型別收斂**：非正整數 → `'#'`（禁 `#/item/undefined`）；T8 改測 route 契約（endsWith，env 無關）+ 壞輸入，加 T9 selectRecipe 回傳契約；**基線 37→40**。
- **增強：複製素材清單**（Owner「加強」）：清單「📋 複製清單」→ 彙總素材轉純文字（每行「名稱 ×數量」）貼遊戲/記事本採買；`copyText` 泛化成功訊息與巨集複製共用。
- **UI 整齊**（Owner「求解器整齊美化／長短高度不要混亂」）：求解兩欄 `align-items:stretch` 等高（消「左高右矮」長短混亂）、未求解時 placeholder 於等高結果欄垂直置中。
- **升級 Owner 未自改**：app.js 645 行（B-002 狀態改「待 Owner 重新拍板」）；noopener 全 repo 慣例 + portal `.codex-btn[hidden]` 全域守衛（B-006）。巢狀 a11y row+button：委派後仍記錄（設計系統無「可點列」primitive；自製 name-button 犯上輪點的另一問題，取捨標記）。
- **基線**：四閘全綠（test-formulas **40** / cargo test 2 未動 / check-actions 35=35 / node --check）+ 瀏覽器複驗（頂部 tab 洩漏、等高欄、複製清單、事件委派選配方/加入）零 console error。

## 2026-07-19 — 頁面整合 UX 改造（三頁等寬／快速加清單／marketboard 來源整合／導覽／codex 遷移）

依 Owner 反映「頁面整合很弱」五痛點（grok+codex 諮詢 → 實作 → 雙審 triage）。旁路 cycle `2026-07-19-page-integration`。

- **三分頁等寬**（痛點5）：角色數值/製造清單原各 max-width 720/880 置中、求解滿版 → 切頁內容寬度跳動。改三頁一律吃滿 `.codex-container`，內表以 `margin-inline:auto` 置中。**為什麼**：切頁 panel 邊界不跳＝整合感基礎。
- **瀏覽表快速加清單**（痛點4a）：配方表每列加 `＋` ghost icon 鈕，`stopPropagation` 只加清單不進詳情；row keydown 加 `e.target===tr` 守衛防 button 冒泡誤選。
- **返回導覽**（痛點4b）：選配方後右上「← 返回配方列表」鈕（唯一返回控件）＋「目前配方：X」誠實狀態列；showPicker 還焦。（**雙審修正**：原做「配方瀏覽›」假 nav 麵包屑、死 span 誤導可點 → 改誠實狀態文字。）
- **清單↔求解**（痛點3）：清單列「前往求解 →」明示鈕（selectRecipe 回傳成功才切頁＋移焦，**雙審修正**：原失敗仍切頁）；從清單進入才顯示「← 回製造清單」，回清單/返回瀏覽即清 `openedFromList` flag＋收鈕（**雙審嚴重修正**：原 flag 不清 → 切回 solve 殘留幽靈導覽）。
- **marketboard 來源整合**（痛點2）：DRY helper `mbItem`/`mbCraft`（item_id≠recipe id 分清）；清單素材/求解原料→`#/item`（查價・來源）、配方→`#/craft`（BOM・利潤）；晶體亦可上市場板交易故一律連（**雙審修正**：原排除晶體 → 文案/行為不一致）。named target 共用分頁、沿用不加 noopener 慣例（全 repo 一致性決策待拍板，見 B-006）。
- **美觀整合**（痛點1）：分頁→`.codex-tabs`、職業篩選→`.codex-chip`(aria-pressed)、空狀態→`.codex-empty`+CTA、詳情動作列統一 ghost 鈕群、清單摘要（種數/總次數語意分清）、首次提示加「前往角色數值」CTA。
- **順修既有 bug**：① `.codex-btn[hidden]` 守衛（`display:inline-flex` 蓋 UA `[hidden]` → change-recipe/cancel-btn 誤顯；`[hidden]` specificity 已足、不用 !important；portal 宜全域補，見 B-006）② 配方表 `.rt-name` flex 移到內層 `.rt-cellflex`（勿對 `<td>` 設 flex → 名稱欄 border-bottom 與他欄不對齊，Owner 回報的老 bug）。
- **a11y**：tablist ←→/Home/End + roving tabindex + 程式化切頁移焦；icon 鈕皆 aria-label。
- **基線**：VERIFY **四閘全綠**（node --check／test-formulas **34→37**：+T8 mbItem/mbCraft URL 契約 golden／check-actions 35=35／`cargo test` 2 passed）＋瀏覽器全流程 smoke（三頁等寬、快速加入、導覽往返、清單→求解→回清單 flag 生命週期、素材→marketboard `#/item` 端到端）零 console error。雙審報告＝`.adversarial-reviews/e256d015-{codex,grok}.md`。
- **未竟（升級 Owner）**：app.js 645 行破 500（B-002 拆分重浮檯面）；marketboard 連結 noopener 全 repo 慣例 + portal `.codex-btn[hidden]` 全域守衛（B-006）。巢狀互動 a11y（可聚焦列內含按鈕，`e.target===tr` 守衛保鍵盤正確）與配方表 per-row listener（CAP 120，可改事件委派）＝既有模式、記錄不本輪大改。

## 2026-07-16 — 求解巨集一鍵存進巨集庫（portal deeplinks cycle 波次 2 出端）

- 巨集區加「📥 存進巨集庫 ↗」：全部分段組 `[{title,lines}]` → base64url（UTF-8 先 TextEncoder，非裸 btoa）→ macro-builder `?import=`（named target 共用分頁、不加 noopener——生態互跳鐵則）。title＝「物品名 段X/Y」20 字元 Array.from 截斷；最終 URL >8KB 不出鈕（防呆，實務 ~1KB）。**為什麼**：求解完的巨集本來就要進遊戲巨集庫，過去要逐段複製貼上；收端有確認 modal、絕不自動寫入。**基線**：`test-formulas.mjs` 34 passed 持平；端到端實測（含 Owner 真實 UI 路徑＋壞 payload／取消／確認三態）過。傘狀 spec：portal `docs/specs/2026-07-16-cross-tool-deeplinks-design.md` 配對 2。

## 2026-07-16 — 配方資料換源 zh-CN 跟版 7.5 ＋ icon v2 CDN 修復（旁路 2026-07-16-data-source-sync）

- **配方資料換源 zh-CN**：data/ 全量重建 11,803→13,874 配方（+2,148 筆 7.2–7.5 新配方、rlv 720→775）。**為什麼**：上游 tnze zh-TW 資料源停更於 7.1 世代（max recipe id 36059，實測與快照零差異），zh-CN 源與國際版同步；繁中名走 item_lookup `name_tc`（權威、非機轉），與舊 zh-TW 名交叉驗證 11,603 筆重疊 99.89% 一致（13 筆差異=item_lookup OpenCC fallback 名，root fix 歸 monorepo BACKLOG B-005）。上游換源實作在 best-craft `scripts/build-static-data.py`（zh-CN 爬取＋⑦繁中化＋ingredients 補爬）。
- **舊染劑配方 30001–30200（200 筆）隨源移除＝遊戲 7.5 染劑改版**：逐色染劑配方在現行遊戲資料已刪除、改為每職業一筆「通用染劑」（38254–38261，已入列）——非資料缺漏，勿當 bug 回補。
- **icon 換 xivapi v2 asset CDN**（`app.js` `iconUrl()` + `_headers` CSP img-src）：v1 `xivapi.com` 圖庫停更、7.5 新物品 icon 全 404（實測 057489 → 404、v2 → 200）。寫法對齊 marketboard `modules/icon.js`（DRY 權威），輸入沿用 data 層 v1 路徑格式免改資料。
- **新增「製造清單」分頁**（Owner 需求，基底範圍拍板）：配方詳情「📋 加入製造清單」→ 清單分頁管理數量（次數）/ 移除 / 點名跳回求解，自動彙總素材總需求（晶體殿後對齊遊戲 BOM），localStorage 持久化＋資料改版自動剔除消失配方。**落新檔 `crafting-list.js`**（98 行 classic script，`globalThis.CraftList` 橋接——app.js 已破 500 不再加大、且保住 test-formulas 的 vm 載入手法）；彙總純函式 `aggregateMats` 進 T7 golden（測試基線 29→34）。

## 2026-07-11 — R2 複檢修復（M1 + sec/docs/UX 建議批）

依 R2 複檢報告（`docs/health-reviews/2026-07-11-R2複檢-health-review.md`，體質 7.8／使用者 7.5）修須修改 M1 + 全建議清單。

- **M1 專家之證 CP +15**（`d70d590`）：`effectiveStats` 原僅補作業/加工 +20、漏 CP +15 → CP 吃緊的專家配方（目標族群）被低估、易誤判 NoSolution/次佳；`index.html` 標籤同步補「CP +15」。**遊戲值查證**：game_ref.sqlite 只存技能/狀態（無此機制值）→ 改查 item_dict（id 10336「專家水晶」，簡中「专家水晶」，灰機 `物品:专家水晶` 佐證）+ Soul of the Crafter 專家狀態既定加成＝作業+20/加工+20/CP+15（既有 +20/+20 同源、CP+15 為其第三腳）。**為什麼**：專家配方正是本工具核心客群。
- **批次 0 — 前端純函式 golden 測試**（`d70d590`，quality A1 / BACKLOG B-004 具體化）：新增 `tools/test-formulas.mjs`（node+vm 載 app.js，假 DOM + fetch reject → 頂層 IIFE 走 catch 無害），斷言 `computeSettings`（spec §4 對抗驗證值 rlv640/工藝4048/90級→base_progress 250 當 golden）/ `hqPercent`（60 斷點抽樣含邊界 100·99/98·5/2·0·超上限·maxQ=0）/ `recipeMaxes`（floor）+ 專家之證 CP+15 金鎖 + sec A1/A2 哨兵 → **29 passed**。**為什麼**：測試基線 3→4 機械閘，公式回歸與 M1 修復固化。
- **安全縱深 sec A1/A2**（`d70d590`）：`g.level` render 前補 `Number()` 硬化（localStorage self-XSS 殘縫，前輪 gear 輸入硬化漏此顯示路徑）；`saveGear` 空 catch 補 `console.warn` + 一次性 toast（違「禁靜默吞非預期錯誤」字面）。哨兵固化於 test-formulas.mjs T6。
- **UX A1/A2/A3**（`d70d590`）：求解等待由 60s 一次性訊息改 `solveClock` interval 每秒更新耗時（求解在 worker、主執行緒空閒故不凍結）、文案「數秒→數十秒」、≥60s 升級可取消提示但不殺 worker；placeholder 方位詞中性化（手機堆疊版面「左側/→」失準）；首載 spinner 改靜態指示（主執行緒 parse 大 JSON 時 CSS 動畫凍結像當機——止血，根治歸 B-005）。
- **docs-drift**（`a6ab096`）：VERIFY 機械閘 3→4；`solveTimer`→`solveClock` 註記對齊；DRY 條括號改繫（game_ref ←build_game_ref.py、craft-actions ←build-data.py）；手動 smoke 指令由裸 `python -m http.server` 收斂為 `py -3.11 tools/serve.py`（AGENTS + README）。

## 2026-07-11 — 健檢收官 + DEVLOOP retrofit

依健檢 2026-07-04 計畫收尾剩餘項（0-2 + 全建議清單），並把本 repo retrofit 進 DEVLOOP。

- **0-2 wasm round-trip 測試**（`62cff52`）：`wasm/src/lib.rs` 加 `#[cfg(test)]` — 斷言全 35 個 Action 變體 `parse_action(action_name(a))` 對回同一變體（防兩份平行列舉拼寫分歧不編譯報錯）+ 名稱唯一檢查。順帶 CQ-05：4 個未消費 Output/Step 欄位註明「保留給 simulate」。**為什麼**：`cargo test` toolchain 先前不可用而延後，本次補齊 → 測試基線 1→3 機械閘。
- **安全縱深 SEC-01/02/03**（`3211540`）：esc 補單引號成無例外通用轉義、gear 值 render 前 `Number(v)||''` 堵 localStorage self-XSS sink、引擎 error 字串包 esc。**為什麼**：把「資料→innerHTML 必 esc」推成無例外不變量（icon 來自可信 build-data 故不包）。
- **韌性 RES-02/03/04/05**（`23d4dba`）：fetch 加 `!r.ok` 檢查、meals/medicine 獨立降級不拖垮整站、toast CDN 未載時原生 alert 後備、複製抽 `copyText` 加 execCommand fallback。**為什麼**：非必要資料 / 行動 webview / CDN 失效時仍有可見回饋。
- **a11y/ux a11y-04/05 · ux-3/5**（`99d9529`）：HQ 框觸控放大、求解後移焦、深連結找不到提示、目標品質超上限即時回填。
- **可維護性 CQ-01/02**（`5eddfe9`）：抽 `recipeMaxes()` 單一算式防上限漂移（2000 筆配方等價性驗證 0 mismatch）、worker 契約去死 `cmd` 欄。
- **DEVLOOP retrofit**：新增 `AGENTS.md`（S 級自聲明 + 鐵則 + VERIFY 基線 + 架構索引 + 開發循環）、`CLAUDE.md` 轉接化、`CHANGELOG.md`、`docs/BACKLOG.md`。**跳過**：DATA-2（待拍板）、CQ-06（app.js 拆分，現階段不動）→ 進 BACKLOG。

## 2026-07-04 — 健檢修復批次 0–3

依 `docs/health-reviews/2026-07-04-crafter-fix-plan.md` 修 6 個須修改項 + 部分建議（前序 session，本次收官前完成）。

- **批次 0 — 機械護欄 + 文件 drift**（`6b501c2`）：新增 `tools/check-actions.py`（action-set 35=35 不變量閘）、README drift 修正、補精簡 CLAUDE.md + VERIFY 段。
- **批次 1 — 核心信任**（`d3a9348`）：expert 配方巨集加不可用警語、改任一設定使舊結果失效（`invalidateResults`）、品質% 改 `Math.floor` 除假 100%、順帶 ux-6（NQ 停用目標品質欄）。
- **批次 2+3 — 求解回饋 + 首載感知 + 可達**（`ffab02d`，同 commit 因皆改 app.js 無法非互動分檔）：求解失敗訊息繁中化 + worker 復原 + 60s 逾時軟提示 + render try/catch；首載 loading 佔位、配方列鍵盤可選（tabindex+keydown）、搜尋 debounce、預建 Collator、WASM 並行預熱、tabs aria、aria-live 完成播報。

## 2026-06-22 — 專案建立

FFXIV 繁中服 DoH 製作求解器上線（純靜態站 + Rust/WASM raphael 引擎）。spec `external/ffxiv-tw-tools-portal/docs/specs/2026-06-22-craft-solver-spec.md` + ADR-013。部署 CF Pages `ffxiv-crafter.pages.dev`。

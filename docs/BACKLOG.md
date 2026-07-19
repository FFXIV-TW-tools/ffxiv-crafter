# BACKLOG — ffxiv-crafter

> 提案清單（B-NNN，append-only 編號）。狀態：待拍板 / 未排程 / 進行中 / 已完成（完成後留列標 done + commit）。**不經 Owner 核可不得自主實作**。來源標註便於回溯。

| ID | 標題 | 來源 | 狀態 | 摘要 |
|----|------|------|------|------|
| B-001 | DOH/JOB_ICON 權威源決策 | 健檢 2026-07-04（DATA-2＝CQ-04） | **待拍板** | `app.js` DOH/JOB_ICON hardcode 無 AUTO-SYNC marker（`jobs.json` 僅 21 戰鬥職、不含 8 製作職）。選項：(a) 加註解「刻意 local」免月稽核誤報、(b) 加不變量 `Set(DOH)==recipes.job distinct`、(c) 納入某 sync 腳本。**待 shawn 選向**——(a)+(b) 低成本零風險、(c) 需先有製作職權威源。 |
| B-002 | app.js 按職責分層拆分 | 健檢 2026-07-04（CQ-06） | **已完成**（2026-07-19，Owner 核可；beb2b1a 抽 app-render.js、後續抽 app-solve.js → app.js 658→**488** <500） | `app.js` 現 **543 行**、承載 6+ 職責（data 載入 / gear / 公式 / 求解編排 / render / UI），已破 500 行門檻。拆分方案：`app-data.js`（loadData/RINDEX）｜`app-gear.js`（gearsets/localStorage）｜`app-formula.js`（computeSettings/recipeMaxes/hqPercent）｜`app-solve.js`（worker 編排/invalidate）｜`app-render.js`（render/macro/render 助手）｜`app.js`（init/UI 綁定）。**觸發點**：下次實質擴充再拆（現階段不為拆而拆）；紅線 2000 行仍遠。**2026-07-19 更新**：頁面整合改造後達 **645 行**，codex（阻擋）+grok（高）雙審再次點名「god-file 續膨脹、跨功能回歸風險升」→ **Owner 需重新拍板**：續延（沿用原「不為拆而拆」）或本輪後啟動拆分（至少先抽分頁導覽 / marketboard helper / picker UI）。**→ 2026-07-19 Owner 核可執行**：沿用 crafting-list.js 已驗證的 classic-script + deps 注入 pattern（非重寫狀態參照），抽 `app-render.js`（結果渲染 120 行）＋`app-solve.js`（求解編排 98 行）＝ app.js 658→**488**（<500）。原 6 層方案未全做（formula/gear/data 仍在 app.js——computeSettings 是對抗驗證公式、動它風險高，且 488 已達標）；每塊瀏覽器實測 solve→render 端到端＋40 tests 綠。 |
| B-003 | worker 接 simulate（手動巨集沙盒） | 2026-07-11 收官提案 | 未排程 | WASM 已導出 `simulate()`（吃手動 action 序列 replay），但 UI 未接（worker 只跑 solve、已去 `cmd` dispatch 欄）。若未來要「手動編巨集 → 逐步試算」功能才做；屆時 worker 補 cmd dispatch + import simulate。**低優先**（無需求）。 |
| B-004 | JS 端自動測試評估 | 2026-07-11 收官提案 | **已完成**（`d70d590`，R2 批次0） | ~~評估把 `computeSettings`/`hqPercent`/`recipeMaxes` 抽純函式模組加 node 單測~~ → 實作免抽模組：`tools/test-formulas.mjs` 以 node+vm 直接載 app.js（假 DOM + fetch reject 讓頂層 IIFE 走 catch），斷言公式 golden（spec §4 值）+ hqPercent 斷點 + recipeMaxes floor + 專家之證 CP+15 金鎖 + sec A1/A2 哨兵 → **29 passed**，掛 VERIFY 機械閘 4。 |
| B-005 | 首載 ~4.8MB JSON 主執行緒 parse 優化 | 健檢 2026-07-04（機械基線 perf 主軸） | 未排程 | `loadData()` 一次 `Promise.all` 抓 7 檔並主執行緒 `JSON.parse` ≈ 4.8MB（recipes 3.5MB + items 1.3MB 為大宗），行動 4G 估 3–5s。批次 3 已補 loading 指示（感知），但 parse 本身仍阻塞。評估：worker 內 parse / 資料分片 / 精簡未用欄位。**價值中**（首屏體驗）；需量測實機時間定優先。 |
| B-006 | marketboard 連結 noopener 慣例 + portal `.codex-btn[hidden]` 全域守衛 | 整合改造雙審 2026-07-19（codex/grok） | **待拍板** | 兩項跨-repo 決策：(a) **noopener**：本工具/marketboard/macro-builder 深連結一律 `target="ffxiv-marketboard"` 且**刻意不加 `rel=noopener`**（named 分頁共用慣例，見 renderMacro/CHANGELOG）；codex（高）指跨子域 tabnabbing 面 → 是否全 repo 統一加 noopener（犧牲分頁重用）或維持現狀，**Owner 全生態一致決策**（勿只改單一工具連結造成不一致）。(b) **portal 守衛**：`.codex-btn`/`.codex-tab`/`.codex-chip` 缺 `[hidden]` 守衛（`display` 蓋 UA `[hidden]`），本工具已本地補 `.codex-btn[hidden]` interim → **portal `header.css` 宜全域補**（同 badge 既有鐵則），屆時刪本地。需改 portal repo（push 由 Owner）。 |
| B-007 | app.js 抽 `app-browse.js`（配方瀏覽層拆分） | 對抗審 2026-07-19（codex 阻擋 / grok 中） | **已完成**（2026-07-19，Owner 核可「有多個可拆分獨立功能可拆」）| app.js **502→454 行**（wc -l／pre-commit gate 同法，<500 達標；先前註 437 為 Measure-Object 低估）。**實作**：抽 `app-browse.js`（`globalThis.CraftBrowse`，104 行 wc）＝ `renderChips`/`renderTable`/`markListState` ＋私有 `jobFilter`（僅本層讀寫）；`selectRecipe`/`showPicker`/`refreshSelectedGear`/公式/state **留 app.js**（選擇/詳情狀態機，耦合過重不宜同批移）。沿用 classic-script + deps 注入 pattern（同 app-render/app-solve；getter 取 live RINDEX/selected，注入 selectRecipe/toast）；app.js 以**同名 proxy** 委派 → 既有呼叫點/事件綁定/CraftList onChange 零改。瀏覽器實測整條瀏覽流程（表渲染 120/職業篩選/選配方收合 picker/返回列表/已加入綠底標示）零 console error；node --check/test-formulas 50 綠。 |

---

## 已完成（保留紀錄）

- 健檢 2026-07-04 須修改項 0-1、0-3、0-4、1-1、1-2、1-3、2-1、3-1、3-2 + 建議 SEC-01/02/03、RES-01/02/03/04/05/06、a11y-02/03/04/05、ux-3/5/6、perf-ux-01/02/03/04、CQ-01/02/05、DATA-1 + 0-2 → 見 `CHANGELOG.md` 2026-07-04 / 2026-07-11 兩段。
- R2 複檢 2026-07-11 須修改 M1（專家之證 CP+15）+ 建議全批（quality A1＝B-004 done／sec A1·A2／docs A1·A2／UX A1·A2·A3）→ 見 `CHANGELOG.md` 2026-07-11 R2 段（`d70d590`／`a6ab096`）。

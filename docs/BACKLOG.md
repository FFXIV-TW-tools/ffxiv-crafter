# BACKLOG — ffxiv-crafter

> 提案清單（B-NNN，append-only 編號）。狀態：待拍板 / 未排程 / 進行中 / 已完成（完成後留列標 done + commit）。**不經 Owner 核可不得自主實作**。來源標註便於回溯。

| ID | 標題 | 來源 | 狀態 | 摘要 |
|----|------|------|------|------|
| B-001 | DOH/JOB_ICON 權威源決策 | 健檢 2026-07-04（DATA-2＝CQ-04） | **待拍板** | `app.js` DOH/JOB_ICON hardcode 無 AUTO-SYNC marker（`jobs.json` 僅 21 戰鬥職、不含 8 製作職）。選項：(a) 加註解「刻意 local」免月稽核誤報、(b) 加不變量 `Set(DOH)==recipes.job distinct`、(c) 納入某 sync 腳本。**待 shawn 選向**——(a)+(b) 低成本零風險、(c) 需先有製作職權威源。 |
| B-002 | app.js 按職責分層拆分 | 健檢 2026-07-04（CQ-06） | **現階段不動**（shawn 拍板） | `app.js` 現 **543 行**、承載 6+ 職責（data 載入 / gear / 公式 / 求解編排 / render / UI），已破 500 行門檻。拆分方案：`app-data.js`（loadData/RINDEX）｜`app-gear.js`（gearsets/localStorage）｜`app-formula.js`（computeSettings/recipeMaxes/hqPercent）｜`app-solve.js`（worker 編排/invalidate）｜`app-render.js`（render/macro/render 助手）｜`app.js`（init/UI 綁定）。**觸發點**：下次實質擴充再拆（現階段不為拆而拆）；紅線 2000 行仍遠。 |
| B-003 | worker 接 simulate（手動巨集沙盒） | 2026-07-11 收官提案 | 未排程 | WASM 已導出 `simulate()`（吃手動 action 序列 replay），但 UI 未接（worker 只跑 solve、已去 `cmd` dispatch 欄）。若未來要「手動編巨集 → 逐步試算」功能才做；屆時 worker 補 cmd dispatch + import simulate。**低優先**（無需求）。 |
| B-004 | JS 端自動測試評估 | 2026-07-11 收官提案 | 未排程 | 目前機械閘＝`check-actions.py`（Python 不變量）+ `cargo test`（Rust round-trip）+ `node --check`（語法）；**JS 前端邏輯無自動測試**（app.js 為瀏覽器 module、頂層 IIFE 依賴 DOM，難純函式化單測）。評估：把 `computeSettings`/`hqPercent`/`recipeMaxes`/`esc` 抽成可 node 匯入的純函式模組 → 加輕量 node 單測，或 headless(playwright) smoke。**ROI 待估**（小工具、手動 smoke 現足）。 |
| B-005 | 首載 ~4.8MB JSON 主執行緒 parse 優化 | 健檢 2026-07-04（機械基線 perf 主軸） | 未排程 | `loadData()` 一次 `Promise.all` 抓 7 檔並主執行緒 `JSON.parse` ≈ 4.8MB（recipes 3.5MB + items 1.3MB 為大宗），行動 4G 估 3–5s。批次 3 已補 loading 指示（感知），但 parse 本身仍阻塞。評估：worker 內 parse / 資料分片 / 精簡未用欄位。**價值中**（首屏體驗）；需量測實機時間定優先。 |

---

## 已完成（保留紀錄）

- 健檢 2026-07-04 須修改項 0-1、0-3、0-4、1-1、1-2、1-3、2-1、3-1、3-2 + 建議 SEC-01/02/03、RES-01/02/03/04/05/06、a11y-02/03/04/05、ux-3/5/6、perf-ux-01/02/03/04、CQ-01/02/05、DATA-1 + 0-2 → 見 `CHANGELOG.md` 2026-07-04 / 2026-07-11 兩段。

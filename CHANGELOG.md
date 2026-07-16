# CHANGELOG — ffxiv-crafter

> 記 root 級 / 跨檔改動與「為什麼」。日常配方資料重建（`build-data.py` 產 data/）不入此檔。格式：新的在上。

## 2026-07-16 — 配方資料換源 zh-CN 跟版 7.5 ＋ icon v2 CDN 修復（旁路 2026-07-16-data-source-sync）

- **配方資料換源 zh-CN**：data/ 全量重建 11,803→13,874 配方（+2,148 筆 7.2–7.5 新配方、rlv 720→775）。**為什麼**：上游 tnze zh-TW 資料源停更於 7.1 世代（max recipe id 36059，實測與快照零差異），zh-CN 源與國際版同步；繁中名走 item_lookup `name_tc`（權威、非機轉），與舊 zh-TW 名交叉驗證 11,603 筆重疊 99.89% 一致（13 筆差異=item_lookup OpenCC fallback 名，root fix 歸 monorepo BACKLOG B-005）。上游換源實作在 best-craft `scripts/build-static-data.py`（zh-CN 爬取＋⑦繁中化＋ingredients 補爬）。
- **舊染劑配方 30001–30200（200 筆）隨源移除＝遊戲 7.5 染劑改版**：逐色染劑配方在現行遊戲資料已刪除、改為每職業一筆「通用染劑」（38254–38261，已入列）——非資料缺漏，勿當 bug 回補。
- **icon 換 xivapi v2 asset CDN**（`app.js` `iconUrl()` + `_headers` CSP img-src）：v1 `xivapi.com` 圖庫停更、7.5 新物品 icon 全 404（實測 057489 → 404、v2 → 200）。寫法對齊 marketboard `modules/icon.js`（DRY 權威），輸入沿用 data 層 v1 路徑格式免改資料。

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

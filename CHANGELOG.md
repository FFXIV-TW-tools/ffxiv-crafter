# CHANGELOG — ffxiv-crafter

> 記 root 級 / 跨檔改動與「為什麼」。日常配方資料重建（`build-data.py` 產 data/）不入此檔。格式：新的在上。

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

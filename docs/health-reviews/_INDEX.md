# 健檢索引（ffxiv-crafter）

> 永久健檢檔案庫（`project-health-review` skill 產出）。每次健檢 prepend 最新一列。體質分=維護者視角、使用者分=終端玩家視角，雙分不合併。狀態由 shawn 手動維護（待辦/修復中/已完成）。

| 日期 | 範圍 | 體質分 | 使用者分 | 報告 | 計畫 | 狀態 |
|------|------|:---:|:---:|------|------|------|
| 2026-09-05 | R5 全維（**12 維**・雙視角＋recall 三軌；45 agents／756 tool calls／5.43M token・0 失敗——第一段 32 個 agent 撞 session 限額，重置後 `resumeFromRunId` 續跑補齊。67 findings → confirmed 55 / partial 11 / refuted 1，**23 條被 verifier 降級**；主迴圈親自複驗 10 項（2 項上調）＋突變測試 15 組（14 紅／1 綠＝M1）＋線上實測 CLS·請求量·橫向溢出＋兩支重閘（引擎差分 96 萬次施放、JS 對 Tnze golden 皆全綠）） | 7.5 | 7.5 | [報告](2026-09-05-R5全維健檢-health-review.md) | [計畫](2026-09-05-R5全維健檢-fix-plan.md) | ✅ **批次 0 十六項當輪全數完成**（3 commits `2e372cd`／`9e98fa1`／docs，未 push；測試 654→683、13 組突變全紅、真瀏覽器 smoke 8/8）；待拍板 → B-032〜B-038。**頭條＝三支哨兵在說謊**：`first-run-hint-key` 的 `\b` 是字面 0x08（defer 抓不到）／`check-actions` 印「pkg 同步」但 BUILD-STAMP 不雜湊 pkg／gate 6 觸發正則抓不到 `tools/test-formulas.mjs`。維度產值：sec-f 0／sec-b 0／core 1／data 1／resilience 0／quality 1／tests-ci 1／docs 1／build 1／design 0／perf-ux 0／ux-flows 0（其餘 confirmed 皆本輪直修或留報告） |
| 2026-08-15 | 全維健檢（11 維；31 agent＋對抗驗證 59 confirmed／10 partial／2 refuted，主迴圈補驗 6 項＋recall 抽查＋突變測試 7 組＋瀏覽器實測。**審查重點＝前輪之後的 59 個 commit 新增面**：職業任務分頁／`functions/`／交接頁／sim-diff） | 7.5 | 7.2 | [報告](2026-08-15-全維健檢-health-review.md) | [計畫](2026-08-15-全維健檢-fix-plan.md) | 批次 0 **已完成**（12 項直接修，測試 334→385）；批次 1〜5 待拍板（B-025〜B-031） |
| 2026-08-01 | 全維健檢（11 維；24 agent＋對抗驗證 65 confirmed／6 partial／0 refuted，主迴圈補驗 4 項＋recall 抽查＋突變測試；新納 build-release／design-system／memory-audit 三個從未審過的維度） | 7.6 | 7.8 | [報告](2026-08-01-全維健檢-health-review.md) | [計畫](2026-08-01-全維健檢-fix-plan.md) | 待辦（12 須修改 → B-009〜B-015；已過獨立計畫審 gate） |
| 2026-07-11 | R2 複檢（5 維） | 7.8 | 7.5 | [報告](2026-07-11-R2複檢-health-review.md) | 報告內嵌 | ✅ 已完成（M1 專家之證 CP+15 + 批次0 golden 測試 + sec/docs/UX 建議全批；B-004 done；`d70d590`／`a6ab096`） |
| 2026-07-04 | 全工具（9 維度） | 7.8 | 7.1 | [報告](2026-07-04-crafter-health-review.md) | [計畫](2026-07-04-crafter-fix-plan.md) | ✅ 已完成（批次 0-3 + 建議清單 + 0-2 全落地 2026-07-11；DATA-2/CQ-06 → BACKLOG B-001/B-002） |

# 健檢索引（ffxiv-crafter）

> 永久健檢檔案庫（`project-health-review` skill 產出）。每次健檢 prepend 最新一列。體質分=維護者視角、使用者分=終端玩家視角，雙分不合併。狀態由 shawn 手動維護（待辦/修復中/已完成）。

| 日期 | 範圍 | 體質分 | 使用者分 | 報告 | 計畫 | 狀態 |
|------|------|:---:|:---:|------|------|------|
| 2026-09-05 | R5 全維（規劃 **12 維**・雙視角；45 agents／410 tool calls／2.25M token・**32 個 agent 因 session 限額失敗** ⇒ **實際完整 fan-out 僅 5 維**＋recall 軌 C reviewer，其餘 7 維為主迴圈淺審。27 findings → confirmed 23 / partial 4 / refuted 0，**11 條被 verifier 降級**；主迴圈親自複驗 4 項（**其中 2 項上調嚴重度**）＋突變測試 15 組（14 紅／1 綠＝M1）＋線上實測 CLS·請求量·橫向溢出＋兩支重閘（引擎差分 96 萬次施放、JS 對 Tnze golden）） | 7.5 | 7.8 | [報告](2026-09-05-R5全維健檢-health-review.md) | [計畫](2026-09-05-R5全維健檢-fix-plan.md) | 待辦：批次 0 八項（M1–M8，不需拍板）＋批次 R（限額重置後 `resumeFromRunId` 補跑 7 維）；待拍板 → B-032〜B-035。**頭條＝哨兵判斷式被寫壞成永遠不成立**（`first-run-hint-key.test.mjs:47` 的 `\b` 是字面 0x08 ⇒「不得 defer」那半條是死的，而它守的是載入期 CLS）。維度產值：sec-frontend 0／sec-backend 1／correctness-core 1／quality 1／resilience 0／docs-drift 1／build-release 0（M4·M5 本輪直修） |
| 2026-08-15 | 全維健檢（11 維；31 agent＋對抗驗證 59 confirmed／10 partial／2 refuted，主迴圈補驗 6 項＋recall 抽查＋突變測試 7 組＋瀏覽器實測。**審查重點＝前輪之後的 59 個 commit 新增面**：職業任務分頁／`functions/`／交接頁／sim-diff） | 7.5 | 7.2 | [報告](2026-08-15-全維健檢-health-review.md) | [計畫](2026-08-15-全維健檢-fix-plan.md) | 批次 0 **已完成**（12 項直接修，測試 334→385）；批次 1〜5 待拍板（B-025〜B-031） |
| 2026-08-01 | 全維健檢（11 維；24 agent＋對抗驗證 65 confirmed／6 partial／0 refuted，主迴圈補驗 4 項＋recall 抽查＋突變測試；新納 build-release／design-system／memory-audit 三個從未審過的維度） | 7.6 | 7.8 | [報告](2026-08-01-全維健檢-health-review.md) | [計畫](2026-08-01-全維健檢-fix-plan.md) | 待辦（12 須修改 → B-009〜B-015；已過獨立計畫審 gate） |
| 2026-07-11 | R2 複檢（5 維） | 7.8 | 7.5 | [報告](2026-07-11-R2複檢-health-review.md) | 報告內嵌 | ✅ 已完成（M1 專家之證 CP+15 + 批次0 golden 測試 + sec/docs/UX 建議全批；B-004 done；`d70d590`／`a6ab096`） |
| 2026-07-04 | 全工具（9 維度） | 7.8 | 7.1 | [報告](2026-07-04-crafter-health-review.md) | [計畫](2026-07-04-crafter-fix-plan.md) | ✅ 已完成（批次 0-3 + 建議清單 + 0-2 全落地 2026-07-11；DATA-2/CQ-06 → BACKLOG B-001/B-002） |

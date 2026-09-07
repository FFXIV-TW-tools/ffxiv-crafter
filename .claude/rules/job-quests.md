---
paths:
  - "app-quests.js"
  - "tools/fetch-quest-qty.py"
  - "tools/job-quest-qty.json"
  - "tools/build_lib/**"
---

# 職業任務分頁（動任務資料或該分頁時載入）

> 規則本體；由來見 `docs/rules-rationale.md` 同名段與 `docs/lessons.md`。非 Claude 的 agent 動這些檔前手動讀本檔。

- 資料兩個來源：任務／交付物／職業對照與商人＝**台服解包**（權威，商人不從社群試算表補）；交付數量＝社群試算表（`tools/job-quest-qty.json`），社群名對回 item id 走 `name_tc`→`name_sc`→OpenCC t2s、**id 相符才採用**；顯示一律用解包台服名；地名縮寫用試算表首頁對照表還原。T31／T32。
- 要交 HQ 的東西**不能說「商人有賣」**；**`hq == null` 是「未知」不是「不用」**；要交 HQ＝品名後貼 `assets/hq.png`（與 marketboard 同一張，不自創符號）。T33。
- **沒有座標 ≠ 沒有商人**：通用商人常只有名字，照樣列、帶座標的排前面。
- 技能 icon 取列策略**勿改回 `ORDER BY id LIMIT 1`**：排除佔位圖 `000786` → `class_job_level` DESC → id ASC（`check-actions.py` 守）；只改技能對照用 `--actions-only`。職業專屬 icon 固定木工版＝Owner 裁示（B-008 已否決，勿再提案）。
- DOH／JOB_ICON 為 local hardcode：monorepo 的 `jobs.json` 只有戰鬥職 → 刻意 local，非漏 sync（BACKLOG B-001 待拍板）。
- 商人徽章的唯一產生點＝`CraftQuests.vendorHtml`，製造清單層消費它、不另刻（T58；素材總需求的其餘規則見 `.claude/rules/frontend-state.md`）。

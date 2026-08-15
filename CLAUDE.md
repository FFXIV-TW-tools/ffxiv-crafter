@AGENTS.md

# Claude 專屬

- 全域行為原則（Plan／強制驗證＋證據回報／context 管理歸 shawn・不因用量縮水執行／不用提問收尾／Karpathy 4 大）與模型分工（tier→型號、複審層級判定）：見 global `~/.claude/CLAUDE.md`，此處不重複。
- Phase 對照（superpowers 已於 2026-07-17 退役，勿再引用其 skill）：Brainstorm／Plan→DEVLOOP 模板 `~/.claude/process/templates/`／Build→TDD（`karpathy-guidelines`）／Verify→AGENTS.md「VERIFY」段／Review→`/code-review`（難回頭 commit 加 `adversarial-review`）。**本 repo 的 spec 落外部 portal repo**（見 AGENTS.md「開發循環」），不在此 repo 建 `docs/specs/`。
- 改 UI/CSS 前必先 Read portal repo（`external/ffxiv-tw-tools-portal`）的 `_DESIGN-SYSTEM.md`（external/CLAUDE.md 已載但 portal CLAUDE.md 不自動載）。**跨 repo 指標刻意拆成「目錄 + 檔名」兩段寫**：磁碟機代號依機器而異故不得寫死 `C:`，而寫成單一相對路徑會被 DEVLOOP R15 當成本 repo 內路徑硬驗、擋掉 commit（兄弟 repo 的檔案本來就不在本 repo 的 tree 裡）。
- Git 邊界：commit 先知會、逐主題切；**push 是 STOP**（CF Pages 自動部署對外可見）——本 repo 已註冊 fleet canonicalTest，由 Owner 跑 `bash ~/.claude/skills/process/tools/safe-push.sh --repo C:/FFXIVProject/external/ffxiv-crafter --reason "<原因>"`（絕對路徑防 `!` cwd 漂移；canonicalTest 綠才推＋JSONL 留痕，2026-07-21 裁示）。**裸 `git push` 被 hook 硬擋、不得繞**，也不要改列 `!git push` 請 Owner 代跑——那條路徑不經 hook，會少一筆 push-log。〔憑證排錯：safe-push 若 401，是 Windows Credential Manager 只在 cmd／git-bash 抓得到（WSL 抓不到），改在 git-bash 重跑。〕外部 skill 流程一律止於 commit。
- 定期審計：check-md／monthly-audit 輕量掃描可掛排程；深度 `project-health-review` 僅 Owner 手動 opt-in（重、多 agent），產出歸 `docs/health-reviews/`。

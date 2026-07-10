@AGENTS.md

# Claude 專屬

- 全域行為原則（Plan／強制驗證＋證據回報／context 管理歸 shawn・不因用量縮水執行／不用提問收尾／Karpathy 4 大）與模型分工（tier→型號、複審層級判定）：見 global `~/.claude/CLAUDE.md`，此處不重複。
- Phase→skill 對照：Brainstorm→superpowers:brainstorming／Plan→superpowers:writing-plans／Build→superpowers:test-driven-development＋executing-plans／Verify→superpowers:verification-before-completion／Review→superpowers:requesting-code-review（或 /code-review）。**本 repo 的 spec 落外部 portal repo**（見 AGENTS.md「開發循環」），不在此 repo 建 `docs/specs/`。
- 改 UI/CSS 前必先 Read `C:\FFXIVProject\external\ffxiv-tw-tools-portal\_DESIGN-SYSTEM.md`（external/CLAUDE.md 已載但 portal CLAUDE.md 不自動載）。
- Git 邊界：commit 先知會、逐主題切；**push 是 STOP**（CF Pages 自動部署對外可見，由 shawn 自跑 cmd.exe push）；外部 skill 流程一律止於 commit。
- 定期審計：check-md／monthly-audit 輕量掃描可掛排程；深度 `project-health-review` 僅 Owner 手動 opt-in（重、多 agent），產出歸 `docs/health-reviews/`。

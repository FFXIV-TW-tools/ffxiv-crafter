# CLAUDE.md — ffxiv-crafter（配方製作求解器）

FFXIV 繁中服 DoH 製作求解器（純靜態站 + Rust/WASM raphael 引擎 web worker，無後端）。
架構 / 重建 / 部署見 `README.md`；設計決策見外部 spec `external/ffxiv-tw-tools-portal/docs/specs/2026-06-22-craft-solver-spec.md` + ADR-013。

## 🔒 工具鐵則

- **`hqPercent()` 品質%→HQ% 對照表勿改**（app.js）：逐格移植自 ffxiv-crafting 7.4.5 權威遊戲表（Tnze），表的斷點/缺口是遊戲真實值、不是 bug。
- **製作公式已對抗驗證**（`computeSettings`，spec §4）：改動前先舉具體「錯誤輸入→輸出」反例，勿憑印象報「公式可能錯」。
- **DRY — craft-actions 繁中名/icon 權威 = `game_ref.sqlite`**（`tools/build-data.py` 產），禁自建技能對照表。
- **繁中服至上**：所有顯示一律繁體中文正名。
- **codex 設計系統**：button/form/token 用 portal CDN 的 `.codex-*`，勿 local 重寫；`.panel`/`.codex-tablet` 容器 padding ≥16px。

## ✅ VERIFY（改動後跑）

- `node --check app.js worker.js` — JS 語法
- `py -3.11 tools/check-actions.py` — craft-actions.json 鍵集合 == lib.rs Action 變體（防巨集失效 drift）
- 手動 smoke：`python -m http.server 8809` 於 repo 根（需 portal svc :8774 提供 codex CDN）→ 選配方 → 填角色數值 → 求解 → 複製巨集

## 📋 健檢

健檢報告與修復計畫在 `docs/health-reviews/`（`project-health-review` skill 產出、永久檔案庫，豁免一般 docs 暫存→歸檔規則）。最新：2026-07-04（體質 7.8 / 使用者 7.1）。

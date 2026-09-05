# ffxiv-crafter — 配方製作求解器

FFXIV 繁中服製作（DoH）求解器 + 模擬器。輸入配方 + 角色數值 → 算最佳製作手法 → 顯示手法序列 + 逐步走查 + 一鍵複製遊戲巨集。

**Pages URL**：<https://crafter.xivtc.com/>（已上線）

## 架構

- **求解引擎**：[raphael-rs](https://github.com/KonaeAkira/raphael-rs)（`raphael-solver` + `raphael-sim`，Apache-2.0, KonaeAkira）。同 BestCraft 用的引擎，但自寫 UI、zero Tnze code。
- **WASM 綁定**：`wasm/`（自寫 Rust 薄層，`wasm-pack` 編 → `pkg/`）。
- **公式**：配方+數值 → SolverSettings 在 `app.js` 算（FFXIV 公開公式，已對抗驗證；見 spec §4），WASM 只跑引擎。
- **UI**：codex 設計系統（portal CDN）+ vanilla JS + web worker。
- **資料**：`data/`（recipes/recipe_levels/items 來自 monorepo；craft-actions 繁中名+icon 來自 game_ref，DRY）。

> 設計＆決策：`external/ffxiv-tw-tools-portal/docs/specs/2026-06-22-craft-solver-spec.md` + ADR [[08-ADR-013]]。

## 重建資料

```bash
# 1. （前置）game_ref.sqlite 含 craft_actions：XIVDiscordBot/ 跑 py -3.11 -m scripts.build_game_ref
# 2. 產 data/（craft-actions.json + 複製 static-data）
py -3.11 tools/build-data.py
```

## 重建 WASM

```bash
powershell -ExecutionPolicy Bypass -File tools/build-wasm.ps1   # 從 repo 根執行；內含 --remap-path-prefix，勿跑裸 wasm-pack
```
需 nightly + wasm-pack + wasm32 target。`pkg/` 要 commit（CF Pages 不編 Rust）。

## 本地預覽

```bash
py -3.11 tools/serve.py            # no-cache dev server（預設 :8809，正確 .wasm/.js MIME）
# 開 http://localhost:8809/ （需 portal svc :8774 提供 codex CDN）
```

## 授權

本工具自製碼採 MIT（見 [`LICENSE`](LICENSE)）。

**散布的 `pkg/*.wasm` 是二進位衍生作品**——raphael-rs（Apache-2.0）與約 40 個 crate 被編譯進去，網站訪客即為收受者：

- **站上提供**：[`LICENSE-APACHE-2.0.txt`](LICENSE-APACHE-2.0.txt) 隨站部署（頁尾直連 `/LICENSE-APACHE-2.0.txt`），滿足 Apache-2.0 §4(a)「交付 License 副本」。
- **站上一併提供**：[`LICENSE-MIT.txt`](LICENSE-MIT.txt) 與 [`LICENSE-THIRD-PARTY.txt`](LICENSE-THIRD-PARTY.txt)（41 套件版本／授權／著作權人清單，由 `tools/build-notices.py` 自 `wasm/Cargo.lock` 產）都在 `deploy-allow.txt`、頁尾直連。⚠️ 2026-09-05 前這兩份被關在 deny 清單裡，而 `LICENSE-MIT.txt` 內文正指向一個線上 404 的檔——當時的理由「本 repo 未公開」早已不成立（repo 是 public）；判準改成離線可驗的「是否在 allow 清單」，不再掛條件式的口頭票（健檢 R5 M4）。

raphael-rs v0.26.2 以未修改原始碼編譯（故 Apache §4(b) 的「修改標示」不適用），頁尾署名 KonaeAkira。
FFXIV 遊戲資料／圖示版權屬 SQUARE ENIX。

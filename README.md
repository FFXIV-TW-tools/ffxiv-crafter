# ffxiv-crafter — 配方製作求解器

FFXIV 繁中服製作（DoH）求解器 + 模擬器。輸入配方 + 角色數值 → 算最佳製作手法 → 顯示手法序列 + 逐步走查 + 一鍵複製遊戲巨集。

**Pages URL**：<https://ffxiv-crafter.pages.dev/>（已上線）

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
cd wasm
wasm-pack build --release --target web --out-dir ../pkg
```
需 nightly + wasm-pack + wasm32 target。`pkg/` 要 commit（CF Pages 不編 Rust）。

## 本地預覽

```bash
py -3.11 tools/serve.py            # no-cache dev server（預設 :8809，正確 .wasm/.js MIME）
# 開 http://localhost:8809/ （需 portal svc :8774 提供 codex CDN）
```

## 授權

本工具自製碼採 MIT（見 LICENSE）。求解引擎 raphael-rs 為 Apache-2.0，已於頁尾署名 KonaeAkira。FFXIV 遊戲資料／圖示版權屬 SQUARE ENIX。

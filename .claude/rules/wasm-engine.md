---
paths:
  - "wasm/**"
  - "pkg/**"
  - "tools/sim-diff/**"
  - "tools/build-wasm.ps1"
  - "tools/check-actions.py"
---

# WASM 引擎與差分閘（動 Rust 綁定／`pkg/`／sim-diff 時載入）

> 規則本體；由來見 `docs/rules-rationale.md` 同名段與 `docs/lessons.md`。非 Claude 的 agent 動這些檔前手動讀本檔。`wasm/`＝自寫 Rust 薄綁定（raphael-rs, Apache-2.0），公式在 JS 端算好、WASM 只跑引擎；`pkg/`＝wasm-pack 輸出，**必須 commit**（CF Pages 不編 Rust），同步戳記＝`wasm/BUILD-STAMP.json`。

- 神速技巧耐久補償寫在 `wasm/src/lib.rs`，**勿動 raphael 原始碼**（保住「以未修改原始碼編譯」聲明）；`trained_eye_plan_is_not_padded_by_upstream_durability_bug` 轉紅＝移除 workaround。
- 技能繁中名／icon：`craft-actions.json` 鍵集合必 == `wasm/src/lib.rs` 的 Action 變體（`check-actions.py` 守）。
- 改 `wasm/`（綁定或 raphael 版本）→ **另跑引擎差分閘**（太慢不進 pre-commit）：
  ```bash
  cd tools/sim-diff && cargo run --release          # 清單外的新分歧 → exit 1
  cargo run --release --bin js-golden > golden.json && node compare-js.mjs ../.. golden.json
  ```
  已知差異寫在 `src/main.rs` 的 `ALLOWED` 且每條附理由；**清單外一律失敗，加條目前先查遊戲客戶端判誰對**；清單裡某輪沒出現＝上游可能已修，移除我方 workaround。
- 改 `wasm/src/lib.rs` 或 `Cargo.lock` → `cargo test`（host target 可跑）＋ `powershell tools\build-wasm.ps1` 重建 `pkg/`＋`BUILD-STAMP.json`（否則 `check-actions.py` 紅），`pkg/` 一起 commit；**別跑裸 `wasm-pack`**（產物會帶建置者帳號名）。
- 工具鏈**釘日期**（`wasm/rust-toolchain` 的 `nightly-YYYY-MM-DD`，B-038）：裸 `nightly` 即紅；升級＝改 channel → 重建 → `pkg/`＋戳記一起 commit（`check-actions.py` 對帳 channel）。
- 改 `wasm/Cargo.toml` 依賴 → `py -3.11 tools/build-notices.py` 重產 `LICENSE-THIRD-PARTY.txt` 一起 commit（授權義務跟著依賴變）。

---
paths:
  - "wasm/**"
  - "pkg/**"
  - "tools/sim-diff/**"
  - "tools/build-wasm.ps1"
  - "tools/check-actions.py"
  - "tools/wasm-tool-pins.json"
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
- 改 `wasm/src/**/*.rs` 或 `wasm/Cargo.lock` → `cargo test`（host target 可跑）；改前述檔案、`wasm/Cargo.toml`、`tools/build-wasm.ps1` 或 `tools/wasm-tool-pins.json` → `powershell tools\build-wasm.ps1` 真實重建 `pkg/`＋`BUILD-STAMP.json`（否則 `check-actions.py` 紅），`pkg/` 一起 commit；戳記以排序後的相對路徑＋正規化內容 hash 涵蓋所有 Rust module，增刪／改名也必須重建。**別跑裸 `wasm-pack`**（產物會帶建置者帳號名，也不會開 WebAssembly SIMD——`+simd128` 只在該腳本的 CARGO_ENCODED_RUSTFLAGS，腳本以 0x1f 分隔 flags 保住含空白路徑，建完會驗產物真的宣告了 simd128）。
- 工具鏈**釘日期**（`wasm/rust-toolchain` 的 `nightly-YYYY-MM-DD`，B-038）：裸 `nightly` 即紅；升級＝改 channel → 重建 → `pkg/`＋戳記一起 commit（`check-actions.py` 對帳 channel）。
- `tools/wasm-tool-pins.json` 是 wasm-pack／wasm-opt 版本唯一契約（目前 0.13.1／117）；升級＝先改 pin、安裝相符工具、再真實重建 `pkg/`＋戳記並一起 commit，**不得手改戳記冒充重建**。腳本只認 PATH 第一筆 Application（排除 alias／function／.ps1）；wasm-opt 若命中 PATH 但版本不符直接失敗，未命中才找 `WASM_PACK_CACHE` 或 `%LOCALAPPDATA%\.wasm-pack\wasm-opt-*\bin\wasm-opt.exe` 的相符版本。皆無時下載 [Binaryen version_117 Windows release](https://github.com/WebAssembly/binaryen/releases/tag/version_117)，把 bin 放到 PATH。已驗證 optimizer 的目錄只在建置期間前置 PATH、finally 還原，維持上游預設 `-O`；`check-actions.py` 精確對帳兩版號與 pin 檔 hash。
- 改 `wasm/Cargo.toml` 依賴 → `py -3.11 tools/build-notices.py` 重產 `LICENSE-THIRD-PARTY.txt` 一起 commit（授權義務跟著依賴變）。

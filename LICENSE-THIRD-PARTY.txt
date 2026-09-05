# 第三方授權聲明（THIRD-PARTY NOTICES）

本站散布的 `pkg/crafter_wasm_bg.wasm` 由下列開源套件編譯而成。
各套件授權全文：Apache-2.0 見 [`LICENSE-APACHE-2.0.txt`](LICENSE-APACHE-2.0.txt)、MIT 見 [`LICENSE-MIT.txt`](LICENSE-MIT.txt)；
雙授權（`MIT OR Apache-2.0`）者本專案擇一即可，兩份全文均已附上。
本工具自製碼採 MIT（見 [`LICENSE`](LICENSE)）。FFXIV 遊戲資料／圖示版權屬 SQUARE ENIX。

> 本檔由 `tools/build-notices.py` 自 `wasm/Cargo.lock` 產生（含建置期 proc-macro 套件，寧可多列不可漏列）。改依賴後重跑。

| 套件 | 版本 | 授權 | 著作權 |
|------|------|------|--------|
| `bitfield-struct` | 0.12.1 | MIT | Copyright (c) 2024 Lars Wrenger |
| `bumpalo` | 3.20.3 | MIT OR Apache-2.0 | Copyright (c) 2019 Nick Fitzgerald |
| `bytemuck` | 1.25.0 | Zlib OR Apache-2.0 OR MIT | Copyright (c) 2019 Daniel "Lokathor" Gee. |
| `cfg-if` | 1.0.4 | MIT OR Apache-2.0 | Copyright (c) 2014 Alex Crichton |
| `crossbeam-deque` | 0.8.6 | MIT OR Apache-2.0 | Copyright (c) 2019 The Crossbeam Project Developers |
| `crossbeam-epoch` | 0.9.18 | MIT OR Apache-2.0 | Copyright (c) 2019 The Crossbeam Project Developers |
| `crossbeam-utils` | 0.8.21 | MIT OR Apache-2.0 | Copyright (c) 2019 The Crossbeam Project Developers |
| `either` | 1.16.0 | MIT OR Apache-2.0 | Copyright (c) 2015 |
| `futures-core` | 0.3.32 | MIT OR Apache-2.0 | Copyright (c) 2016 Alex Crichton<br>Copyright (c) 2017 The Tokio Authors |
| `futures-task` | 0.3.32 | MIT OR Apache-2.0 | Copyright (c) 2016 Alex Crichton<br>Copyright (c) 2017 The Tokio Authors |
| `futures-util` | 0.3.32 | MIT OR Apache-2.0 | Copyright (c) 2016 Alex Crichton<br>Copyright (c) 2017 The Tokio Authors |
| `heck` | 0.5.0 | MIT OR Apache-2.0 | Copyright (c) 2015 The Rust Project Developers |
| `js-sys` | 0.3.102 | MIT OR Apache-2.0 | Copyright (c) 2014 Alex Crichton |
| `log` | 0.4.33 | MIT OR Apache-2.0 | Copyright (c) 2014 The Rust Project Developers |
| `nunny` | 0.2.2 | MIT OR Apache-2.0 | — |
| `once_cell` | 1.21.4 | MIT OR Apache-2.0 | — |
| `pin-project-lite` | 0.2.17 | Apache-2.0 OR MIT | — |
| `proc-macro2` | 1.0.106 | MIT OR Apache-2.0 | — |
| `quote` | 1.0.46 | MIT OR Apache-2.0 | — |
| `raphael-sim` | 0.0.0 | Apache-2.0 | — |
| `raphael-solver` | 0.0.0 | Apache-2.0 | — |
| `rayon` | 1.12.0 | MIT OR Apache-2.0 | Copyright (c) 2010 The Rust Project Developers |
| `rayon-core` | 1.13.0 | MIT OR Apache-2.0 | Copyright (c) 2010 The Rust Project Developers |
| `rustc-hash` | 2.1.2 | Apache-2.0 OR MIT | — |
| `rustversion` | 1.0.22 | MIT OR Apache-2.0 | — |
| `safe_arch` | 0.9.3 | Zlib OR Apache-2.0 OR MIT | Copyright (c) 2023 Daniel "Lokathor" Gee.<br>Copyright (c) 2020 Daniel "Lokathor" Gee. |
| `serde` | 1.0.228 | MIT OR Apache-2.0 | — |
| `serde-wasm-bindgen` | 0.6.5 | MIT | Copyright (c) 2019 Cloudflare, Inc. |
| `serde_core` | 1.0.228 | MIT OR Apache-2.0 | — |
| `serde_derive` | 1.0.228 | MIT OR Apache-2.0 | — |
| `slab` | 0.4.12 | MIT | Copyright (c) 2019 Carl Lerche |
| `strum` | 0.27.2 | MIT | Copyright (c) 2019 Peter Glotfelty |
| `strum_macros` | 0.27.2 | MIT | Copyright (c) 2019 Peter Glotfelty |
| `syn` | 2.0.118 | MIT OR Apache-2.0 | — |
| `unicode-ident` | 1.0.24 | (MIT OR Apache-2.0) AND Unicode-3.0 | Copyright © 1991-2023 Unicode, Inc. |
| `wasm-bindgen` | 0.2.125 | MIT OR Apache-2.0 | Copyright (c) 2014 Alex Crichton |
| `wasm-bindgen-macro` | 0.2.125 | MIT OR Apache-2.0 | Copyright (c) 2014 Alex Crichton |
| `wasm-bindgen-macro-support` | 0.2.125 | MIT OR Apache-2.0 | Copyright (c) 2014 Alex Crichton |
| `wasm-bindgen-shared` | 0.2.125 | MIT OR Apache-2.0 | Copyright (c) 2014 Alex Crichton |
| `web-time` | 1.1.0 | MIT OR Apache-2.0 | Copyright 2023 dAxpeDDa<br>Copyright (c) 2023 dAxpeDDa |
| `wide` | 0.8.3 | Zlib OR Apache-2.0 OR MIT | Copyright (c) 2020 Daniel "Lokathor" Gee. |

求解引擎 [raphael-rs](https://github.com/KonaeAkira/raphael-rs) v0.26.2（`raphael-solver` / `raphael-sim`，作者 KonaeAkira）以**未修改**的原始碼編譯連結；本專案僅另寫 WASM 薄綁定（`wasm/src/lib.rs`）與全部 UI。

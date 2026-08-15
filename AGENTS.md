# AGENTS.md — ffxiv-crafter

FFXIV 繁中服 DoH 配方製作求解器。純靜態站 + Rust/WASM raphael 引擎（web worker）。**沒有自己的資料後端**（配方資料全是 build 時產的靜態 JSON），但有兩支 CF Pages Functions：設定 API 同源代理與舊網域交接頁（見架構表 `functions/`）。輸入配方＋角色數值 → 算最佳製作手法 → 手法序列 + 逐步走查 + 一鍵複製遊戲巨集。external 公開工具，部署 Cloudflare Pages（`ffxiv-crafter.pages.dev`），FFXIV-TW-tools portal 註冊。

**規模級別：S**（DEVLOOP §5）——單一子系統（一個求解器工具）、**~3.47k 行**前端/站台手寫碼分佈 **15 檔**（app.js / app-flow.js / app-render.js / app-solve.js / app-browse.js / app-gear.js / app-recipe.js / app-quests.js / app-consumable.js / app-quality-stages.js / app-level-sync.js / crafting-list.js / worker.js / index.html / styles.css）＋ `functions/` 兩支（210 行）、單一部署目標、無 cron / 多機協作 / 即時資料管線。**故不設 ROADMAP 分解層**（直接 Plan→Build）；設計 spec 落在外部 portal repo（見下），本 repo 工件＝`CHANGELOG.md` + `docs/BACKLOG.md` + `docs/health-reviews/`。判 S 偏 M（有 Rust/WASM 一層非顯而易見），但無跨子系統協調需求 → 維持 S。

> 設計＆決策不在本 repo：spec `external/ffxiv-tw-tools-portal/docs/specs/2026-06-22-craft-solver-spec.md`（公式 §4 對抗驗證）+ ADR-013。重建 / 部署見 `README.md`。

---

## 🔒 工具鐵則（違反必阻擋）

- **`hqPercent()` 品質%→HQ% 對照表勿改**（`app.js`）：逐格移植自 ffxiv-crafting 7.4.5 權威遊戲表（Tnze），表的斷點/缺口是遊戲真實值、**不是 bug**。改前先舉具體「品質→HQ%」反例。
- **製作公式已對抗驗證**（`computeSettings`，spec §4）：改動前先舉具體「錯誤輸入→輸出」反例，勿憑印象報「公式可能錯」。u16 無溢位、serde 對超界值**報錯而非靜默截斷**（不會產錯巨集）——勿改成 clamp 吞錯。
- **DRY — craft-actions 繁中名/icon 權威＝`game_ref.sqlite`**（monorepo `build_game_ref.py` 產）：禁自建技能對照表。`data/craft-actions.json`（`tools/build-data.py` 從 game_ref 萃取）鍵集合必 == `wasm/src/lib.rs` 的 Action 變體（現值 35=35，`tools/check-actions.py` 機械守）。
- **DRY — 「哪些配方會依等級同步」權威＝`game_ref.sqlite` 的 `recipe_level_sync`**（monorepo `build_game_ref.py` 由 `Recipe.MaxAdjustableJobLevel` 解出）→ `tools/build-data.py` 產 `data/level-sync.json`。**禁自建同步配方名單，也禁用「rlv==690」之類的形狀猜測**——那是現況巧合（768 筆全是宇宙探索），改版就靜默失效。等級→生效 rlv 的換算收斂在 `app-level-sync.js` 一處（`recipe_levels.json` 是前端的資料，在 Python 端再算一次就是第二份會漂移的對照）。
- **繁中服至上**：所有顯示一律繁體中文正名（職業名 木工/鍛造/…、技能名走 game_ref、高難度=expert）。疑慮查 Lumina `ChineseSimplified.ScName` 或灰機 wiki，不自創。
- **codex 設計系統**：button/form/token 用 portal CDN 的 `.codex-*`，勿 local 重寫；`.panel`/`.codex-tablet` 容器 padding ≥16px。中性分組容器（`.filter-group`／`.cfg-card`／`.cl-card`）的**幾何走共用 `.codex-tint-panel--neutral`**、底色以 `--panel-bg` 傳參，本地只留 padding 與外距 — **不得把 background／border／border-radius 寫回本地**（值一樣所以畫面全正常，但幾何就分岔成兩份事實源，T36 守）。改 UI/CSS 前**先 Read** portal repo（`external/ffxiv-tw-tools-portal`）的 `_DESIGN-SYSTEM.md`（跨 repo 指標拆兩段寫，理由見 CLAUDE.md；磁碟機代號依機器而異，勿寫死 `C:`）。
- **共用鐵則（monorepo 全域）**：`except: pass` 禁止（失敗至少 `console.warn`）；dict 快取一律 bounded（本工具目前無無界快取，新增時遵守）；新建原始碼檔 >500 行禁止（既有檔 >500 被實質修改時觸發拆分 review 閘門）。

---

## 🏗 架構

純靜態站，三層 + 引擎。**每支模組的職責細節、私有狀態、與「為什麼這樣寫」都在該檔自己的檔頭註解**——
下表只給一句話定位與跨檔規則，不複述檔頭（2026-08-15 健檢 B-025：這張表原本是第二份事實源，
而它已經漂過兩次——`app.js` 行數與 `.crafter-qt-list` 類名都寫錯過，且新增的 `functions/` 整列漏列）。

**模組 pattern（跨 8 層一致，動任何一層前先懂這個）**：classic script 發佈 `globalThis.CraftXxx`
＋ `app.js` init 注入依賴（getter 取 live 狀態，因為 `loadData` 會重新賦值 `ITEMS`／`ACTIONS` 綁定）
＋ `app.js` 以**同名 proxy** 委派 → 拆檔時既有呼叫點零改。看到「app.js 與模組有同名函式」不是重複實作。

| 檔案 / 目錄 | 一句話職責 |
|------|------|
| `index.html` | 靜態骨架 ＋ `document.write` 注入 portal CDN bootstrap ＋ SEO/JSON-LD ＋ 舊網域交接 inline 腳本 |
| `app.js` | 前端控制器（唯一 `type=module` 入口）：資料載入／公式 `computeSettings`・`recipeMaxes`／食藥加成／分頁／init 接線 |
| `app-flow.js` | 流程引導：`flowState()` 純函式＝「現在該做什麼」的唯一真相；`setTargetMode` 也在這裡 |
| `app-render.js` | 結果渲染：`hqPercent`（純）／手法序列 chips／走查表／巨集組裝 |
| `app-solve.js` | 求解編排：worker 生命週期／`doSolve`／求解計時／世代守衛／取消 |
| `app-browse.js` | 配方瀏覽表：職業篩選 chips／每頁 60 筆分頁／已加入清單標示 |
| `app-gear.js` | 角色數值：localStorage 讀寫與型別驗證／等級 0..100 clamp／專家之證逐職勾選（上限 3） |
| `app-recipe.js` | 配方詳情狀態機：`selectRecipe`／`showPicker`／`refreshSelectedGear`／`refreshGearNote`／原料與初始品質 |
| `app-quests.js` | 職業任務分頁：11 職任務清單／完成勾選／素材遞迴展開 `expandMats`／商人徽章 |
| `app-consumable.js` | 食物／藥水自繪 listbox（原生 `<option>` 放不了 icon／品級／功效）＋本區本地保存 |
| `app-quality-stages.js` | 品質階段 → 目標品質。**兩種來源單位不同，換算只有這裡一份**：收藏品＝值×10、宇宙任務＝`ceil(滿品質×值/100)` |
| `app-level-sync.js` | 等級同步：解出生效 rlv 並寫回 `selected.rlv`（顯示與求解共用）。**等級→rlv 的對照只有這裡一份**＝取該職業等級的最小 rlv |
| `crafting-list.js` | 製造清單：清單狀態(localStorage)／素材彙總 `aggregateMats`（純函式，T7 守）／採購 CSV |
| `worker.js` | web worker：載 raphael WASM 跑 `solve`（只跑 solve，`simulate` 未接 UI） |
| `functions/` | 本 repo 唯一的伺服器端程式碼（CF Pages Functions）：`settings-api` 設定 API 同源代理（service binding 直呼，**不得改成 `fetch(URL)`**——會讓 per-IP 額度變全站共用；路徑白名單＋Origin 缺席才補，`tests/settings-api.test.mjs` 守）／`_middleware.js` 舊網域交接頁（13 站逐字複製的樣板，`tests/handoff.test.mjs` 守） |
| `styles.css` | 工具樣式，token 全來自 portal CDN（tokens.css / header.css） |
| `wasm/` | 自寫 Rust 薄綁定（raphael-rs v0.26.2，Apache-2.0）；`wasm-pack build --target web` → `pkg/`。公式在 JS 端算好、WASM 只跑引擎 |
| `pkg/` | wasm-pack 輸出 — **必須 commit 進 repo**（CF Pages 不編 Rust）。`.gitignore` 內容是 `*` 且改不動（wasm-pack 每次重產），故同步戳記放 `wasm/BUILD-STAMP.json` |
| `data/` | recipes／items／ingredients／recipe_levels／craft-actions／meals／medicine／quality-stages／level-sync／job-quests／vendors JSON（`tools/build-data.py` 產，來源＝monorepo item_dict + game_ref） |
| `assets/` | `hq.png`（遊戲內 HQ 圖，**與 marketboard 同一張**，不自畫） |
| `tools/` | `build-data.py`（產 data/）／`fetch-quest-qty.py`（社群試算表交付數量）／`check-actions.py`（三個不變量閘）／`build-wasm.ps1`（重建 pkg/ 並更新 BUILD-STAMP）／`build-notices.py`／`serve.py`（本地預覽）／`test-formulas.mjs`（前端 golden）／`sim-diff/`（兩顆引擎差分閘） |
| `_headers` | CF Pages 安全標頭（CSP 完整分域）＋快取策略（`.js`/`.css`/`pkg/`/`data/*` 一律 `must-revalidate` → **無 cachebust 腳本**，靠 ETag/304） |
| `THIRD-PARTY-NOTICES.md`／`LICENSE-*.txt` | 散布 `pkg/*.wasm` 的授權義務：Apache-2.0 §4(a) 要交付 License 副本、MIT 要附著作權宣告——頁尾只寫授權名稱不算。`LICENSE-APACHE-2.0.txt` 隨站部署、頁尾直連；**轉公開時頁尾要補 notices 連結**。notices 由 `build-notices.py` 自 `wasm/Cargo.lock` 產，**改 wasm 依賴後必須重跑並一起 commit** |
| `docs/health-reviews/` | 永久健檢檔案庫（`project-health-review` skill 產出，豁免 docs 暫存→歸檔規則） |

**資料流**：選配方 + 填角色數值 → `computeSettings`（FFXIV 公式，含食物/藥水/專家之證）→ postMessage worker
→ raphael `MacroSolver` → replay 逐步 → render 手法序列 + 巨集。
跨工具深連結：`?recipe=<id>` / `?item=<id>`（marketboard／宇宙探索跳來）＋ `?stage=1|2|3` 預選品質階段。
**`stage` 只認階段序號，刻意不收絕對品質數字**——讓外部站塞絕對值進來等於開第二條換算路徑，對面資料一舊就靜默給出達不到門檻的手法。

- **DRY — 品質階段權威＝`game_ref.sqlite` 的 `recipe_quality_stages`**（monorepo `build_game_ref.py` 由 `Recipe.CollectableMetadata` ＋判別欄 `CollectableMetadataKey` 解出）：禁自建收藏值對照表。目前只收已確證的 key 1（收藏品）與 key 7（宇宙任務）＝992 個配方；key 2/3/4/6 的 728 個配方**刻意不輸出**（未確證，見 root BACKLOG B-041），那些配方只有「滿品質」可選是預期行為、不是 bug。

## ✅ VERIFY（改動後跑，未過不算完成）
- **canonicalTest（safe-push 實跑的那一條；`process/fleet.json` 逐字對照本行）**：`node tools/test-formulas.mjs && node tests/run-all.mjs && py -3.11 tools/check-actions.py`
  > 2026-08-15 併入 `check-actions.py`（健檢 B-026，Owner 選 A）：它守的三個不變量（35 個 Action 變體 == `craft-actions.json` 鍵／`pkg/` 與 `lib.rs` 的 BUILD-STAMP 同步／sim-diff 與 wasm 釘同一個 raphael tag）**先前沒有任何自動入口會跑到**——改引擎、忘記重編、safe-push 全綠，玩家拿到的是舊引擎算的巨集，而 BUILD-STAMP（B-013）當初就是為了防這件事做的。代價＝每次推多約 1 秒；換機少了 `py -3.11` 會以「推不出去」明確失敗，不是靜默略過。
  > 2026-08-04 併入 `tests/run-all.mjs`：`tests/` 底下的測試檔先前沒有任何自動入口會跑到（跨 repo 稽核＝claude-skills `process/tools/check-orphan-tests.mjs`）。run-all 自動掃描`tests/*.test.{js,mjs}`，新增測試檔不必再記得掛進來。


<!-- B-048-HANDOFF -->
> **交接頁契約（B-048 Task 4）**——改 `functions/_middleware.js`／`_routes.json`／`tests/route-manifest.json` 後必跑：
>
> ```bash
> node tests/handoff.test.mjs
> ```
>
> ⚠️ 它**刻意不併進本 repo 既有的測試 runner**：該檔與 `functions/_middleware.js` 是 13 站逐站複製的樣板（每站只換 `OLD_HOST`／`NEW_ORIGIN` 兩個常數），檔名與介面必須跨站一致，不能為配合各站慣例改寫——改寫等於每站手動調整，正是 monorepo 交接頁一致性哨兵要防的漏抄。**既有測試基線不變。**

<!-- TEST-BASELINE cmd="node tools/test-formulas.mjs" match="(\d+) passed, \d+ failed" expect="396" label="test-formulas" -->
<!-- TEST-BASELINE cmd="py -3.11 tools/check-actions.py" match="(\d+) 個 Action 變體" expect="35" label="check-actions" -->
<!-- TEST-BASELINE cmd="cargo test" cwd="wasm" match="(\d+) passed" expect="5" label="cargo round-trip" -->
<!-- ↑ B-013：宣告值 vs 實測值的機械比對（node tools/check-test-baseline.js --repo .）。改測試數量時這裡要一起改，否則 pre-commit gate 6 會擋。 -->

> 機械閘基線 **4 項全綠，只准升不准降**：`test-formulas` **396**／`check-actions` 35 個 Action 變體／`cargo test` 5／`run-all` 2 個測試檔。宣告值與實測值由 pre-commit gate 6 對帳（見下方 `TEST-BASELINE` 標記），改測試數量時兩邊要一起改。
>
> 每一條測試當初是為了擋什麼、數字怎麼一路長上來的**逐輪流水帳搬到** [`docs/test-baseline-history.md`](docs/test-baseline-history.md)（2026-08-15，健檢 B-025）——那份歷史對「現在要怎麼做」沒有幫助，而本檔每個 session 都會被全文注入。
>

```bash
node --check *.js                       # JS 語法（用萬用字元，不列清單——手維護的清單會漏掉新模組，2026-08-15 就漏了 app-quests.js）
node tools/test-formulas.mjs            # 前端純函式 golden + 機械哨兵（T1〜T44，各條的用途寫在測試檔內；396 passed）
py -3.11 tools/check-actions.py         # 不變量：craft-actions.json 鍵 == lib.rs Action 變體（現 35=35）＋ pkg/ 同步戳記 ＋ sim-diff 與 wasm 釘同一個 raphael tag
cd wasm && cargo test                   # 不變量：parse_action ∘ action_name round-trip + 名稱唯一 + 神速技巧耐久/路徑/步數三條（5 passed）
```

- **上游 raphael 把「工匠的神速技巧」的耐久寫死 10，遊戲實際是 0**：**升版救不了**（上游 main 至今仍是 10）。我方在 `wasm/src/lib.rs` 補償且**不動 raphael 原始碼**（保住「以未修改原始碼編譯」聲明）：① `replay()` 事後補回 10 點 ② `solve_input()` 把神速技巧那條路拆成「神速技巧 ＋ 滿耐久/CP−250/只衝進展」的子問題。**上游哪天修好，`trained_eye_plan_is_not_padded_by_upstream_durability_bug` 會轉紅＝該移除 workaround。** → 判準（日文客戶端文案）與量測見 [`docs/lessons.md`](docs/lessons.md)
- **動 `wasm/`（改綁定或換 raphael 版本）→ 另跑引擎差分閘**（不進每次 commit 的 pre-commit，太慢）：
  ```bash
  cd tools/sim-diff && cargo run --release          # 約 1 分鐘，~96 萬次施放；清單外的新分歧 → exit 1
  cargo run --release --bin js-golden > golden.json && node compare-js.mjs ../.. golden.json
  ```
  兩顆**零共用程式碼**的引擎隨機走訪對打（raphael-sim vs Tnze `ffxiv-crafting`），逐步比對進展／品質／耐久／CP 與技能合法性；
  第二條把我方 JS 的 `base_progress`／`base_quality`／`hqPercent` 對 Tnze 產的 golden 對帳。
  **已知差異寫在 `src/main.rs` 的 `ALLOWED` 清單且每條附理由——清單外一律失敗，要加新條目前必須先查遊戲客戶端判誰對，不要為了讓閘變綠而加。**
  清單裡的條目某輪沒出現也會印警告（多半代表上游修好了 → 該移除我方 workaround）。
  → 為什麼要兩顆引擎對打、當初抓到什麼，見 [`docs/lessons.md`](docs/lessons.md)
- **改 `wasm/src/lib.rs`** → 跑 `cargo test`（host target 可跑，見上）；**重建 WASM 產物**一律走 `powershell tools\build-wasm.ps1`（需 nightly + wasm-pack + wasm32 target），`pkg/` 要一起 commit。**別直接跑裸 `wasm-pack`**：Rust 把 panic 的原始碼路徑編進二進位，crate 住在 `%USERPROFILE%\.cargo\` → 產物會帶建置者的 Windows 帳號名，而 `pkg/*.wasm` 是公開可下載的（瀏覽器必須抓它才能跑）。腳本用 `--remap-path-prefix` 把家目錄改寫成 `~`，並在編完驗收「產物不含建置者路徑」。
- **改 `.js` / `.css`** → **無 cachebust 步驟**（不像 ranking；index.html 靜態引用無 `?v=`，`_headers` 的 `must-revalidate` 負責重驗）。
- **手動 smoke**（改 UI / render / 求解路徑後）：`py -3.11 tools/serve.py`（no-cache dev server，預設 :8809；勿用裸 `python -m http.server`——缺 no-cache 會拿到瀏覽器快取舊版）於 repo 根 → 需 **portal svc :8774** 提供 codex CDN（`svc start portal`）→ 開 `http://localhost:8809/` → 選配方 → 填角色數值 → 求解 → 複製巨集。零 console error。
- **純文件 / 規則檔改動**：pre-commit gate 過 + 目視 diff 即足。

---

## 🛠 開發注意（踩坑 / 教訓）

> **可執行的規則全在本節**（每 session 自動載入）；「怎麼發現的、錯了會怎樣」等敘事已搬 [`docs/lessons.md`](docs/lessons.md)（2026-08-03，DEVLOOP R7 20KB 護欄）。標了「→ 敘事見」的條目，動那一區前建議一併讀。

- **技能 icon 取列策略勿改回 `ORDER BY id LIMIT 1`**：正解＝排除佔位圖 `000786` → `class_job_level` DESC → id ASC（`check-actions.py` 有不變量守）。只改技能對照用 `py -3.11 tools/build-data.py --actions-only`。**職業專屬 icon 固定木工版是 Owner 裁示的取捨，B-008 已否決勿再提案**；紅線只有「不得出現佔位刪除號圖」。→ 敘事見 [`docs/lessons.md`](docs/lessons.md)
- **食物/藥水下拉是自繪 listbox 不是 `<select>`**：**按鈕上的 Enter/Space 不要自己處理**（瀏覽器已轉成 click，兩邊都做會開了又關），keydown 只接 ↑↓。icon/品級來自 `meals.json`／`medicine.json`，由 `build-data.py --consumables-only` 補。→ 敘事見 [`docs/lessons.md`](docs/lessons.md)
- **專家之證是「角色狀態」不是求解選項**（2026-08-09 起）：住 `gearsets[職業].specialist`（角色數值分頁勾），
  **遊戲上限 3 個**由 `CraftGear.SPEC_MAX` 守（第 4 個回退＋toast，不用 disabled——那會讓鍵盤走不到也讀不到原因）。
  求解端一律讀 `gear.specialist`（`gearFor` 附上），**禁止再從 DOM 讀某個 `#specialist` 開關**。
  ⚠ 證**不跟著數值的 fallback 走**：某職沒填數值時數值取「預設」，但證仍看該職業自己那格
  （「預設」不是職業、也不佔上限）。畫面上唯一看得到它的地方是求解頁那行「套用『職業』數值 … 專家之證 ✔」。
- **要交 HQ 的東西，不能說「商人有賣」**：商人賣的是 NQ ⇒ 任務要求 HQ 時**整個商人徽章不出**
  （寫「有賣」是誤導、寫「只賣 NQ」是廢話）。`vendorHtml(itemId, needHq)`，T33 守。
  **`hq == null` 是「未知」不是「不用」**——當成不用的話畫面會叫玩家去買，他是買完站到 NPC 面前才發現交不了。
- **職業任務分頁的資料有兩個來源，責任分清楚**：任務／交付物／職業對照＝**台服解包**（權威）；
  交付數量＝**社群試算表**（`tools/job-quest-qty.json`）；**商人資訊完全走解包** `gil_shop_npc.json`
  （價格＋NPC 名/稱號/繁中地名/座標，與 marketboard 同源）——**不要再從社群試算表補商人**，留兩份就是留一份會漂移的。
  **要交 HQ ＝品名後直接貼 `assets/hq.png`**（與 marketboard 同一張圖），**不要自創符號**（✦ 之類）；
  不確定的用同一張圖淡化＋`?`（仍要標，不能默默當成不用）。
  **沒有座標 ≠ 沒有商人**——通用商人（「武具商」「雜用商人」）資料裡常只有名字，照樣要列，
  只是把帶座標的排前面；用 `if n.zone` 過濾會讓 247 件掉到 172 件而畫面說「查不到」。
  社群名對回 item id 走 `name_tc`→`name_sc`→OpenCC t2s 後 `name_sc`，**id 相符才採用**；
  顯示一律用解包的台服名。地名縮寫（「北黑」）用試算表首頁的對照表還原，不自建。T31／T32 守。
  → HQ 需求為什麼只能靠試算表的 `୭` 記號、涵蓋率數字怎麼來的，見 [`docs/lessons.md`](docs/lessons.md)
- **這一區的設定是本地保存的**（`ffxiv-crafter-consumables-v1`）：食物／藥水／兩個 HQ 勾／`<details>` 展開狀態全存。新增這一區的輸入項要一併進 `state` 並在 `init` 套回 DOM，否則會出現「畫面有值但重整就跑掉」的半套狀態。`setData` 會清掉資料改版後已不存在的保存品項（不留幽靈選擇）。
- **icon 一律走 xivapi v2 asset CDN**（2026-07-16）：v1 `xivapi.com/i/...` 圖庫停更、7.5 新 icon 404 → `app.js` `iconUrl()` 把 data 層 v1 路徑轉 v2 URL（權威寫法＝marketboard `modules/icon.js`）；新增 icon 出口勿再直拼 v1 網域，`_headers` CSP img-src 已鎖 `v2.xivapi.com`。
- **配方資料源＝tnze zh-CN（7.5 跟版）＋item_lookup 繁中化**（2026-07-16）：zh-TW 源停更 7.1 勿換回；重建流程＝best-craft `scripts/build-static-data.py`（刪 static-data 快取強制重爬）→ 本 repo `tools/build-data.py`。舊逐色染劑配方 200 筆是遊戲 7.5 改版移除（通用染劑 38254–38261 取代），勿當缺漏回補。
- **expert（高難度）配方靜態巨集僅供參考**：536 個 expert 配方在遊戲內為隨機製作狀態，靜態 Normal 巨集無法保證完成 → render 已加中性「試算完成 ⚠」+ 警語（**勿移除、勿改回無條件「✓ 可完成」金徽**）。
- **求解計時＝軟提示不殺 worker**（`solveClock` interval，每秒更新已耗時）：求解跑在 worker、主執行緒空閒故計數不凍結；≥60s 升級「可取消」提示但**不殺** worker（正常長求解仍在跑，UI 文案「可能數十秒」）；`stopSolveClock()` 掛在 onWorkerMsg / cancelSolve / onerror（別讓成功後計數殘留）。
- **「現在該做什麼」的唯一真相＝`app-flow.js` 的 `flowState()`**（2026-07-27 引導改造）：步驟軸／「下一步」文案／CTA 就緒提示／`pick-panel` 收合／`work.is-idle` 全由它一次算出，**勿在各層自己寫步驟文案或自行 toggle 這些 class**。新增會改變流程位置的事件（新分頁／新輸入）→ 呼叫 `globalThis.CraftFlow?.update?.()`（一律選擇性呼叫，測試 sandbox 缺本層不炸）。
- **首屏「等 fetch 才長內容」的區塊一律要預留高度**（CLS）：三選一 —— ①內容確定→靜態寫進 index.html（T17 守）②筆數不定→`.is-loading` 分段 `min-height`（**失敗路徑也要卸**）③佔位塊自撐（min-height == 內容 max-height）。**別再留空殼。** → 量測手法與由來見 [`docs/lessons.md`](docs/lessons.md)
- **`hidden` 設了不等於收得起來**：UA 的 `[hidden]{display:none}` 優先權最低，本地一條 `display:flex` 就蓋掉。**驗收合一律看 `getComputedStyle(el).display` 或 `getBoundingClientRect().height`，不要查 `.hidden` 屬性**；新增靠 hidden 收合的區塊要補 `[hidden]` 守衛（T21 機械掃描）。→ 實際出包經過見 [`docs/lessons.md`](docs/lessons.md)
- **宇宙探索配方的數值不是資料裡那個**：那 768 個配方存的 rlv 一律 690（Lv100 版），實際會依角色等級同步 —— 判準是 `Recipe.MaxAdjustableJobLevel`，**不是 rlv 的形狀**。修前 Lv70 玩家看到六倍難度且**全程零錯誤訊號**。→ 判準推導見 [`docs/lessons.md`](docs/lessons.md)
- **等級→rlv 的對照是「取該職業等級的最小 rlv」，不是猜的**：資料裡可調整配方存的 rlv 正好就是 Lv100 的最小 rlv（690）——代入最高等級會還原成原值。這條 identity 已用**實資料全量**釘進 T20（768 筆逐筆比對），上游改版讓對照失效會直接紅。**不要拿任務的 LevelGroup 反推等級**（該欄沒有對應的等級表，datamining 也沒有 `WKS*LevelGroup` sheet）。
- **這一區的等級是本地保存的**（`ffxiv-crafter-level-sync-v1`）：留空＝跟隨「角色數值」的等級，填數字＝手動指定並保存。輸入框在使用者聚焦時**不得被 refreshSelectedGear 覆寫**（每次重繪都會走到，硬寫會吃掉游標與半打的數字）——同理整個 `#level-sync` 是 index.html 靜態骨架，JS 只改 value/文字，不重建 DOM。
- **下拉／浮層的窄屏溢出，只有實測才算數**：定案＝窄屏（≤700px）讓 `.cfg-line` 標籤獨佔一行、控制項與選單 `width: 100%`，**不用任何魔術常數**（試過 `left:auto;right:0` 會換成左溢出、`calc(100vw - 常數)` 的偏移量本身會隨選單寬度變動）。**改這一區必重跑量測**：同源 iframe 定寬載入本站，逐一設 1400/1018/900/800/430/390/360，展開選單後驗 `left>=0`、`right<=視窗寬`。T26 只擋「已知會壞的形狀」，**CSS 文字比對驗不了 layout**。→ 兩次修錯的經過見 [`docs/lessons.md`](docs/lessons.md)
- **功能性圖示鈕與剪貼簿一律走 portal 共用元件**：複製／關閉／釘選／外連用 `window.FFXIVIcons.btnHTML(name, label, attrs)`
  （→ `.codex-icon-btn` ＋內嵌 SVG），複製動作用 `window.FFXIVClipboard.copy(text, label)`
  （本站 `copyText` 已改成「有共用就用共用、缺 CDN 才退回本地 execCommand 版」，巨集／採購清單／品名三條路徑共用同一入口）。
  **帶文字的動作鈕（`📋 加入製造清單`／`📋 複製清單`）刻意維持 emoji**——AGENTS「icon 節制」管的是身分／主操作，
  B-027 只收功能性小圖示；別「順手統一」把它們也換成 SVG（T35 有負向哨兵）。
  **禁自刻 emoji 鈕**（📋/⧉/🔗）——那正是 portal B-027 收掉的東西（emoji 當功能性圖示：字型相依、
  拿不到 currentColor、縮小後糊）。缺 CDN 時要有退場版（功能不消失），T34 守。
  ⚠ 圖示鈕沒有可讀文字 → `label` 必填（`btnHTML` 缺 label 會 throw）。
  ⚠ 鈕不能放進 `<a>` 裡（互動元素不得互套，且點鈕會連帶跳頁）：素材列因此是「容器 div ＋ 內層
  `.crafter-qt-mat__link` ＋同層的鈕」，click 處理要 `preventDefault()`。
- **hover 說明一律 `data-help`，禁原生 `title`**（設計系統鐵則；2026-07-27 已把全 repo 19 處 title 清乾淨）：新增提示走 `data-help="…"`（`｜`／`。` 分行），圖示鈕另補 `aria-label`；`window.FFXIVHelp.setup()` 在 app.js init 呼叫一次（冪等）。
- **表格一律 `table-layout: fixed` + 百分比欄寬**（配方表 `.rt` / 角色數值 `.gear-table`，2026-07-27）：欄寬與內容脫鉤才不會在篩選/換頁時跳動（📊 表格佈局穩定鐵則）。**列內可能插徽章的儲存格要預留 `min-height`**（`.rt-nmline` 22px）——否則有徽章的列比別列高一截。掃視靠斑馬紋、分隔線淡化到 55%，別再加回每列實線。
- **求解選項的說明是常駐文字不是 hover**（`.crafter-opt__desc`）：勾選類開關逐項要有一行說明；停用時**不隱藏控制**，改暗掉 + `.crafter-why` 寫出原因（`#adv-why` 高難度 / `#target-why` NQ 模式 / `#solve-btn[aria-disabled]` 缺角色數值）。
- **改任一求解輸入 → 舊巨集失效**：`invalidateResults()` 集中失效，涵蓋 opt-* / 目標品質 / solve-mode / HQ 素材 / 全部 HQ 鈕 / 食藥 / 角色數值（程式設值不觸發 input 者須手動呼叫）。新增求解輸入時記得掛。
- **轉義紀律**：動態字串（配方名 / 技能名 / 引擎 error）進 innerHTML 一律 `esc()`；**icon 路徑來自 build-data 常數 / game_ref、無注入面故不 esc**（勿當 drift 誤補）。
- **求解上限單一算式**：顯示（refreshSelectedGear）與求解（computeSettings）共用 `recipeMaxes(recipe, rlv)`，勿再內聯重算（防漂移）。
- **DOH / JOB_ICON 為 local hardcode**：`jobs.json` 僅 21 戰鬥職、不含製作職 → 刻意 local，非漏 sync（是否加 AUTO-SYNC marker / 不變量＝BACKLOG B-001 待拍板）。
- **改 `wasm/Cargo.toml` 依賴＝授權義務跟著變**（2026-07-28）：`pkg/*.wasm` 把 raphael-rs（Apache-2.0）與約 40 個 crate 編譯進去散布給網站訪客，Apache-2.0 §4(a)／MIT 都要求隨散布附上授權全文與著作權宣告 → 動依賴後跑 `py -3.11 tools/build-notices.py` 重產 `THIRD-PARTY-NOTICES.md` 一起 commit。raphael-rs 上游**無 NOTICE 檔**（已查 v0.26.2 checkout），故 §4(d) 不觸發；我們也未改其原始碼，§4(b) 修改標示不適用——若哪天 fork 改了引擎，這兩條都會啟動。
- **WASM 同步戳記**（B-013）：改 `wasm/src/lib.rs` 或 `wasm/Cargo.lock` 後，必須跑 `powershell tools\build-wasm.ps1`（會重建 `pkg/` 並更新 `wasm/BUILD-STAMP.json`），否則 `check-actions.py` 會紅並要求重建；不要直接跑裸 `wasm-pack`。
- **git 邊界**：commit 先知會、逐主題切；**push → CF Pages 自動部署對外可見 → STOP，由 shawn 自己跑** `!git -C external/ffxiv-crafter push`（cmd.exe，Windows Credential Manager）。

---

## 開發循環（DEVLOOP）

正典：`~/.claude/process/DEVLOOP.md`。本 repo 工件：`CHANGELOG.md`、`docs/BACKLOG.md`、`docs/health-reviews/`（健檢檔案庫）。**設計 spec 落外部 portal repo**（`external/ffxiv-tw-tools-portal/docs/specs/2026-06-22-craft-solver-spec.md` + ADR-013），本 repo 不另立 specs/。

### 🔒 部署面鐵則（2026-08-01，勿回退）

本 repo 的 CF Pages 部署**不是「發佈 repo 根目錄」**，而是由 `deploy-prepare.sh` 依 `deploy-allow.txt` 產出 `_site/`。CF dashboard 必須設 Build command = `sh deploy-prepare.sh`、Build output directory = `_site`。

- **為什麼**：CF Pages 無 build 步驟時把 repo 根整棵目錄當靜態資產上傳 → `AGENTS.md`／`docs/`／`tools/`／`tests/`／`worker/` 後端源碼全部變成該網域下可直接 GET 的公開檔（2026-08-01 實測 12/13 站中招）。**private repo 只保護「誰能 clone」，不保護「已部署的檔案誰能下載」**；`.gitignore`（檔是 tracked）／`_headers`（只加標頭）／`robots.txt`（只擋收錄不擋直取）都擋不到。
- **允許清單而非排除清單**：頂層出現任何未列入 `deploy-allow.txt`／`deploy-deny.txt` 的項目 → **build 直接失敗**。新增內部資產的預設值是「不發佈」，不靠任何人記得。排除清單做不到（實測當天漏了 `worker/` 106 支 .ts 與 `_tools/`／`_cache/` 141 檔）。
- **新增站台資產**（新頁面／新資料夾）→ 加進 `deploy-allow.txt`；**新增內部資產** → 加進 `deploy-deny.txt`。改完跑一次 `sh deploy-prepare.sh` 確認印出「✓ 部署輸出就緒」。
- **腳本改動禁忌**：① 只能用 POSIX 語法（CF 容器的 `sh` 是 dash，`read -r -d ''` 之類 bashism 會靜默失敗、輸出 0 檔而 build 仍「成功」⇒ **整站 404**，2026-08-01 實際發生）② 根層檔名不可無條件 `mkdir "$OUT/${f%/*}"`（會建出「叫 index.html 的目錄」⇒ `/` 404）③ 不得移除出貨前驗收閘（輸出 <3 檔／缺 index.html／內部檔混入 → 非零 exit，CF 保留前一版）。
- **部署後驗**：`curl -sI https://<repo>.pages.dev/AGENTS.md` → 回 `text/html` 正常（檔案不存在）；回 `text/markdown` = 紅燈。

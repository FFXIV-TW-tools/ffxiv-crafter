# AGENTS.md — ffxiv-crafter

FFXIV 繁中服 DoH 配方製作求解器。純靜態站 + Rust/WASM raphael 引擎（web worker），無後端。輸入配方＋角色數值 → 算最佳製作手法 → 手法序列 + 逐步走查 + 一鍵複製遊戲巨集。external 公開工具，部署 Cloudflare Pages（`ffxiv-crafter.pages.dev`），FFXIV-TW-tools portal 註冊。

**規模級別：S**（DEVLOOP §5）——單一子系統（一個求解器工具）、~2.84k 行前端/站台手寫碼分佈 14 檔（app.js / app-flow.js / app-render.js / app-solve.js / app-browse.js / app-gear.js / app-recipe.js / app-consumable.js / app-quality-stages.js / app-level-sync.js / crafting-list.js / worker.js / index.html / styles.css）、單一部署目標、無後端 / cron / 多機協作 / 資料管線。**故不設 ROADMAP 分解層**（直接 Plan→Build）；設計 spec 落在外部 portal repo（見下），本 repo 工件＝`CHANGELOG.md` + `docs/BACKLOG.md` + `docs/health-reviews/`。判 S 偏 M（有 Rust/WASM 一層非顯而易見），但無跨子系統協調需求 → 維持 S。

> 設計＆決策不在本 repo：spec `external/ffxiv-tw-tools-portal/docs/specs/2026-06-22-craft-solver-spec.md`（公式 §4 對抗驗證）+ ADR-013。重建 / 部署見 `README.md`。

---

## 🔒 工具鐵則（違反必阻擋）

- **`hqPercent()` 品質%→HQ% 對照表勿改**（`app.js`）：逐格移植自 ffxiv-crafting 7.4.5 權威遊戲表（Tnze），表的斷點/缺口是遊戲真實值、**不是 bug**。改前先舉具體「品質→HQ%」反例。
- **製作公式已對抗驗證**（`computeSettings`，spec §4）：改動前先舉具體「錯誤輸入→輸出」反例，勿憑印象報「公式可能錯」。u16 無溢位、serde 對超界值**報錯而非靜默截斷**（不會產錯巨集）——勿改成 clamp 吞錯。
- **DRY — craft-actions 繁中名/icon 權威＝`game_ref.sqlite`**（monorepo `build_game_ref.py` 產）：禁自建技能對照表。`data/craft-actions.json`（`tools/build-data.py` 從 game_ref 萃取）鍵集合必 == `wasm/src/lib.rs` 的 Action 變體（現值 35=35，`tools/check-actions.py` 機械守）。
- **DRY — 「哪些配方會依等級同步」權威＝`game_ref.sqlite` 的 `recipe_level_sync`**（monorepo `build_game_ref.py` 由 `Recipe.MaxAdjustableJobLevel` 解出）→ `tools/build-data.py` 產 `data/level-sync.json`。**禁自建同步配方名單，也禁用「rlv==690」之類的形狀猜測**——那是現況巧合（768 筆全是宇宙探索），改版就靜默失效。等級→生效 rlv 的換算收斂在 `app-level-sync.js` 一處（`recipe_levels.json` 是前端的資料，在 Python 端再算一次就是第二份會漂移的對照）。
- **繁中服至上**：所有顯示一律繁體中文正名（職業名 木工/鍛造/…、技能名走 game_ref、高難度=expert）。疑慮查 Lumina `ChineseSimplified.ScName` 或灰機 wiki，不自創。
- **codex 設計系統**：button/form/token 用 portal CDN 的 `.codex-*`，勿 local 重寫；`.panel`/`.codex-tablet` 容器 padding ≥16px。改 UI/CSS 前**先 Read** `C:\FFXIVProject\external\ffxiv-tw-tools-portal\_DESIGN-SYSTEM.md`。
- **共用鐵則（monorepo 全域）**：`except: pass` 禁止（失敗至少 `console.warn`）；dict 快取一律 bounded（本工具目前無無界快取，新增時遵守）；新建原始碼檔 >500 行禁止（既有檔 >500 被實質修改時觸發拆分 review 閘門）。

---

## 🏗 架構

純靜態站，三層 + 引擎：

| 檔案 / 目錄 | 職責 |
|------|------|
| `index.html` | 靜態骨架 + `document.write` 注入 portal CDN bootstrap（tokens/header/settings）+ SEO/JSON-LD |
| `app.js` | 前端控制器（module 入口）：資料載入 / 公式 computeSettings・recipeMaxes / 消耗品公式套用 / 分頁 / init 接線（**424 行**（wc -l，pre-commit gate 同法），B-002＋B-007＋配方詳情拆分＋引導改造後；角色數值/配方詳情/渲染/求解編排/配方瀏覽表/流程引導/食藥選單已抽出，同名 proxy 委派 CraftGear/CraftRecipe/CraftBrowse） |
| `app-flow.js` | 流程引導層（classic script `globalThis.CraftFlow`）：`flowState()` 純函式（①選配方 →②設定條件 →③求解取巨集 三步狀態＋「下一步」文案，唯一真相）／`update()` 重繪步驟軸＋pick-panel 收合＋CTA 就緒提示＋`work.is-idle`／`flowHtml()`（狀態→HTML，**index.html 的靜態初始標記即其 `flowHtml({})` 輸出**，T17 逐字守）／`setTargetMode`·`updateConsumableSummary`（停用原因與現值顯示，不需 init）。自帶 `$`（deep-link 路徑會早於 init 呼叫） |
| `app-render.js` | 結果渲染層（classic script `globalThis.CraftRender`）：hqPercent(純) / render / 手法序列 chips（**`<button data-step>`，點擊經 `linkStep()` 與走查表同序號列雙向高亮＋自動展開走查**）/ 走查表（`tr[data-step]`）/ 巨集。app.js init 注入 getter 取 live 狀態（loadData 會重賦值 ITEMS/ACTIONS 綁定） |
| `app-solve.js` | 求解編排層（classic script `globalThis.CraftSolve`）：worker 生命週期 / doSolve / 求解計時 / 結果回傳分派 / 取消 / setSolving。worker·solveClock 為該層私有；渲染委派 CraftRender、公式/gear 由 app.js 注入 |
| `app-browse.js` | 配方瀏覽層（classic script `globalThis.CraftBrowse`，B-007 拆分）：職業篩選 chips renderChips / 配方表 renderTable（**每頁 60 筆分頁**，`renderPager`；頁碼重置靠 `filterKey()` 指紋比對，**不靠呼叫端傳參**——renderTable 有 5 個外部呼叫點，漏傳就是靜默 bug）/ 已加入清單標示 markListState。私有狀態 `jobFilter`／`page`／`lastKey`；app.js init 注入依賴（getter 取 live RINDEX/selected＋selectRecipe/toast）。app.js 以同名 proxy 沿用既有呼叫點 |
| `app-gear.js` | 角色數值層（classic script `globalThis.CraftGear`）：localStorage 讀寫/型別驗證/一次性錯誤提示／職業裝備表 render／等級 0..100 clamp。私有狀態 `gearsets`／保存警告旗標；app.js init 注入 `$`／`esc`／`toast`／`iconUrl`／`DOH`／`JOB_ICON`／`afterInput`，app.js 以同名 proxy 沿用既有呼叫點 |
| `app-recipe.js` | 配方詳情層（classic script `globalThis.CraftRecipe`）：`selectRecipe`／`showPicker`／`refreshGearNote`／`refreshSelectedGear`／`renderIngredients`／`updateInitial`；app.js 保留 `RECIPES`／`RLV`／`ITEMS`／`INGREDIENTS`／`selected`／`computedInitial`，以 getter/setter 注入，並以同名 proxy 沿用既有呼叫點與測試契約 |
| `app-consumable.js` | 食物/藥水選擇層（classic script `globalThis.CraftConsumable`）：自繪 listbox（原生 `<option>` 放不了 icon／品級／功效）／依**物品品級高→低**排序／HQ 切換即時換算／**本區設定本地保存**（`ffxiv-crafter-consumables-v1`：食物・藥水・兩個 HQ・專家之證・展開狀態）。app.js 只留「選中品項→數值加成」的公式面（`applyConsumables` 走 `CraftConsumable.get()`） |
| `crafting-list.js` | 製造清單分頁：清單狀態(localStorage) / 素材彙總 `aggregateMats`（純函式，T7 golden 守）/ 分頁 render。classic script 發佈 `globalThis.CraftList`，app.js init 注入依賴（免 module 化破壞 test-formulas vm 載入） |
| `worker.js` | web worker：載 raphael WASM 跑 `solve`（只跑 solve，simulate 尚未接 UI，故無 cmd dispatch） |
| `styles.css` | 工具樣式，token 全來自 portal CDN（tokens.css / header.css） |
| `wasm/` | 自寫 Rust 薄綁定（raphael-rs v0.26.2，Apache-2.0）；`wasm-pack build --target web` → `pkg/`。公式在 JS 端算好、WASM 只跑引擎 |
| `pkg/` | wasm-pack 輸出 — **必須 commit 進 repo**（CF Pages 不編 Rust） |
| `THIRD-PARTY-NOTICES.md`／`LICENSE-APACHE-2.0.txt`／`LICENSE-MIT.txt` | 散布 `pkg/*.wasm`（二進位衍生作品）的授權義務：Apache-2.0 §4(a) 要交付 License 副本、MIT 要附著作權宣告——頁尾只寫授權名稱不算。**`LICENSE-APACHE-2.0.txt` 隨站部署、頁尾直連 `/LICENSE-APACHE-2.0.txt`**（Owner 裁示：repo 未公開前不從頁面連 GitHub，會 404）；MIT 全文與 notices 先只存 repo，**轉公開時頁尾要補 notices 連結**。**SE 版權聲明刻意不放頁尾**（2026-07-28 Owner 裁示：全站大量使用官方 icon，只在求解器頁尾補一行反而不成體系；要做就是整個 portal 生態一起處理）。notices 由 `tools/build-notices.py` 自 `wasm/Cargo.lock` 產生，**改 wasm 依賴後必須重跑並一起 commit** |
| `app-quality-stages.js` | 品質階段層（classic script `globalThis.CraftStages`）：配方的三段品質門檻 → 目標品質。**兩種來源單位不同，換算只有這裡一份**——收藏品＝值×10；宇宙任務＝`ceil(滿品質×值/100)`（進位方向有意義，floor 會差一格達不到門檻）。某檔為 0 不列該檔、整個配方無資料就收起整組欄位 |
| `app-level-sync.js` | 等級同步層（classic script `globalThis.CraftSync`）：宇宙探索配方**同一列資料掛在多個等級級距的任務上**（`WKSMissionUnit` 的 LevelGroup 1/2/3 共用同一 recipe id、`IsSynced=1`），存的 rlv 690 是「Lv100 版本」。`resolve()` 依角色等級（或手動指定，本機保存 `ffxiv-crafter-level-sync-v1`）解出生效的 recipe level 列，`refreshSelectedGear` 把它寫回 `selected.rlv` → 顯示與求解共用。**等級→rlv 的對照只有這裡一份**＝取該職業等級的最小 rlv（identity：代入最高等級會還原成配方原始 rlv，T20 全量釘住）。**不靜默換數字**：生效 rlv、三上限與配方原始值都寫在畫面上 |
| `data/` | recipes / items / ingredients / recipe_levels / craft-actions / meals / medicine / **quality-stages** / **level-sync** JSON（`tools/build-data.py` 產，來自 monorepo item_dict + game_ref） |
| `tools/` | `build-data.py`（產 data/；`--actions-only` 只重刷技能對照、`--consumables-only` 只補食藥 icon）、`check-actions.py`（action-set 與 `pkg/`／`wasm/src` 同步不變量閘）、`build-wasm.ps1`（重建 `pkg/` 並更新 `wasm/BUILD-STAMP.json`）、`build-notices.py`（第三方授權聲明）、`serve.py`（本地預覽）、`test-formulas.mjs`（前端純函式 golden 測試） |
| `_headers` | CF Pages 安全標頭（CSP 完整分域）+ 快取策略（.js/.css/pkg/ 與 `/data/*` `must-revalidate` → **無 cachebust 腳本**，靠 ETag/304） |
| `docs/health-reviews/` | 永久健檢檔案庫（`project-health-review` skill 產出，豁免 docs 暫存→歸檔規則） |

**資料流**：使用者選配方 + 填角色數值 → `computeSettings`（FFXIV 公式，含食物/藥水/專家之證）→ postMessage worker → raphael `MacroSolver` → replay 逐步 → render 手法序列 + 巨集。跨工具深連結：`?recipe=<id>` / `?item=<id>`（marketboard「求解手法」鈕、宇宙探索站的需求物跳來）＋ `?stage=1|2|3` 預選品質階段。**`stage` 只認階段序號，刻意不收絕對品質數字**——讓外部站塞絕對值進來等於開第二條換算路徑，對面資料一舊就靜默給出達不到門檻的手法。

- **DRY — 品質階段權威＝`game_ref.sqlite` 的 `recipe_quality_stages`**（monorepo `build_game_ref.py` 由 `Recipe.CollectableMetadata` ＋判別欄 `CollectableMetadataKey` 解出）：禁自建收藏值對照表。目前只收已確證的 key 1（收藏品）與 key 7（宇宙任務）＝992 個配方；key 2/3/4/6 的 728 個配方**刻意不輸出**（未確證，見 root BACKLOG B-041），那些配方只有「滿品質」可選是預期行為、不是 bug。

---

## ✅ VERIFY（改動後跑，未過不算完成）

<!-- TEST-BASELINE cmd="node tools/test-formulas.mjs" match="(\d+) passed, \d+ failed" expect="240" label="test-formulas" -->
<!-- TEST-BASELINE cmd="py -3.11 tools/check-actions.py" match="(\d+) 個 Action 變體" expect="35" label="check-actions" -->
<!-- TEST-BASELINE cmd="cargo test" cwd="wasm" match="(\d+) passed" expect="5" label="cargo round-trip" -->
<!-- ↑ B-013：宣告值 vs 實測值的機械比對（node tools/check-test-baseline.js --repo .）。改測試數量時這裡要一起改，否則 pre-commit gate 6 會擋。 -->

> 機械閘基線 **4 項全綠**（只准升不准降；2026-07-11 R2 加 test-formulas.mjs → 29 passed；2026-07-16 加 T7 製造清單彙總 → 34 passed；2026-07-19 加 T8 marketboard URL 契約 + T9 selectRecipe 回傳 → 40 passed；2026-07-19 加 T10 清單 add/has/count + 上限誠實 → 50 passed；2026-07-19 加 T11 app-browse 瀏覽層 init/chips/table/篩選/CAP/空狀態/守衛 → 60 passed；2026-07-19 加 T12 buildShoplistCsv 送端 CSV 契約（成品 yield/合併/三上限/invalidCount/多 item 升冪排序）→ 68 passed；2026-07-25 加 T13 求解世代守衛（過期結果/錯誤幀丟棄＋worker gen 回傳契約）→ 75 passed；2026-07-27 加 T14 流程引導狀態機（三態齊全／同時只一步進行中／上游變更使下游失效）→ 87 passed；2026-07-27 T11 擴充配方表分頁（每頁 60／頁碼／末頁餘數／篩選變更回第 1 頁／單頁收翻頁器）→ 96 passed；2026-07-27 外審【高】修正 T13 補「求解中改設定必須作廢飛行中求解」＋不搶焦點/不誤 toast → 101 passed；2026-07-28 加 T15 食藥選擇層（無加成品項排除／功效文字含上限／品級排序／保存往返含 HQ・專家之證・展開狀態／HQ 切換取 NQ 或 HQ／保存值失效清除）→ 113 passed；2026-07-29 加 T16 簡中搜尋（簡繁都查得到／命中仍顯示繁中／nameSc 缺失不炸）→ 117 passed；2026-07-29 加 T17 首屏 CLS 預留（index.html 靜態流程軸 == flowHtml({}) 冷啟動輸出／`is-loading` 成功與失敗路徑都卸下／載入佔位高度 == 表格 max-height）→ 122 passed；2026-08-01 加 T18 品質階段層（收藏品 ×10／宇宙任務百分比無條件進位／超滿品質 clamp／未知來源不猜換算／無分階整組隱藏／某檔為 0 不列／手打數字與下拉雙向同步／提示的階名不隨缺檔位移）→ 137 passed；2026-08-01 加 T19 求解技能預設不勾 + 選擇本機保存（index.html 無 `checked`／保存往返／非布林值不套用）→ 147 passed；2026-08-01 加 `shortfallHtml` 目標品質未達成警語（達成／超過／未設目標都不警告，未達成要寫出差額）→ 151 passed；2026-08-01 加 T20 等級同步層（基準 rlv＝該等級最小 rlv／identity 滿等不改變任何東西／未填等級不猜／手動優先於自動且收在資料上限／保存往返與非法值退回／說明必須寫出生效 rlv・三上限・配方原始值／不同步的配方整區隱藏／**實資料全量 identity**：768 個同步配方的原始 rlv == 其最高等級的基準 rlv）→ 175 passed；2026-08-02 加 T21 `[hidden]` 守衛哨兵（index.html 帶 hidden 的元素若被本地 CSS 指定非 none 的 display，必須有 `[hidden]` 守衛）→ 177 passed；2026-08-02 加 T22 effectiveStats 食藥加成 golden／修 T11 篩選變更空殼斷言 → 181 passed；2026-08-02 加 T23 專心致志／快速改革專家之證 gate 與保存語意／T24 角色等級 clamp 保留 0＝未填，清空與顯式 0 回空白、負數收斂、邊界不寫回 → 207 passed；2026-08-02 加 T25 角色數值變更成果保留／等級同步三上限重算、升級 sec-A2 全手寫 JS catch 括號配對與 loadGear 壞值回報、T26 body navbar offset／食藥窄屏 listbox 契約 → 220 passed；2026-08-02 加 T27 WASM 引擎初始化失敗分流／誠實訊息／重試重建 worker 與世代守衛 → 231 passed；2026-08-02 加 T28 求解計時 aria-live 節點固定／食藥 listbox 焦點 ring 哨兵 → 239 passed；2026-08-02 抽 app-recipe.js 時用突變測試發現「selectRecipe 是否真的作廢飛行中求解」無人守（刪掉那行 239 全綠）→ 補進 T25 → 240 passed）。

```bash
node --check app.js app-recipe.js app-gear.js app-flow.js app-render.js app-solve.js app-browse.js app-consumable.js app-quality-stages.js app-level-sync.js crafting-list.js worker.js   # JS 語法
node tools/test-formulas.mjs           # 前端純函式 golden：computeSettings（spec §4 值）/ hqPercent 斷點 / recipeMaxes + 專家之證 CP+15 + sec A1/A2 哨兵 + T7 清單彙總 + T8 mbItem/mbCraft URL 契約 + T9 selectRecipe 回傳 + T10 清單 add/has/count/上限誠實 + T11 app-browse 瀏覽層契約 + T12 buildShoplistCsv 送端契約 + T14 flowState 流程狀態機 + T15 食藥選擇層與保存 + T16 簡中搜尋 + T17 首屏 CLS 預留（239 passed）
py -3.11 tools/check-actions.py         # 不變量：craft-actions.json 鍵 == lib.rs Action 變體（現 35=35）＋ pkg/ 同步戳記 ＋ sim-diff 與 wasm 釘同一個 raphael tag
cd wasm && cargo test                   # 不變量：parse_action ∘ action_name round-trip + 名稱唯一 + 神速技巧耐久/路徑/步數三條（5 passed）
```

- **上游 raphael 把「工匠的神速技巧」的耐久寫死 10，遊戲實際是 0**（2026-08-03 差分審計；`raphael-sim/src/actions.rs` 的 `impl ActionImpl for TrainedEye`，上游 `main` 至今未修，**升版救不了**）。判準＝日文客戶端文案：**每個**會消耗耐久的技能都寫「耐久を消費して」（連預設 10 的「加工」也寫），而「匠の早業」整段沒有耐久字眼；對照組「匠の神業」(Trained Finesse, 0) 寫的是「耐久を消費せず」。英文文案只標非預設值，**不能拿來判**（我第一次就是這樣誤判要翻案）。Teamcraft `trained-eye.ts` 與 Tnze `ffxiv-crafting` 亦為 0。
  **修法刻意不動上游原始碼**（頁尾與 `THIRD-PARTY-NOTICES.md` 聲明「以未修改原始碼編譯」，一改就啟動 Apache-2.0 §4(b) 修改標示義務），兩處都收在 `wasm/src/lib.rs`：① `replay()` 用完神速技巧後把 10 點補回（不只顯示，坯料製作的「耐久不足效率減半」判定也吃這個值）② `solve_input()` 把神速技巧那條路拆成子問題（神速技巧只能第 1 步用且直接把品質補到目標 ⇒ 最佳解＝神速技巧 ＋「滿耐久、CP−250、只衝進展」的最佳解），子問題須拿掉同為「僅第 1 步可用」的堅信／閒靜。實測 rlv640 緊繃配方 **17 步→14 步**（17 步要貼兩段巨集）。**上游哪天修好了，`trained_eye_plan_is_not_padded_by_upstream_durability_bug` 會轉紅——那是移除本 workaround 的信號，不是壞事。**
- **動 `wasm/`（改綁定或換 raphael 版本）→ 另跑引擎差分閘**（不進每次 commit 的 pre-commit，太慢）：
  ```bash
  cd tools/sim-diff && cargo run --release          # 約 1 分鐘，~96 萬次施放；清單外的新分歧 → exit 1
  cargo run --release --bin js-golden > golden.json && node compare-js.mjs ../.. golden.json
  ```
  它拿 **raphael-sim（我們線上跑的）vs Tnze `ffxiv-crafting`（BestCraft 用的，零共用程式碼）** 兩顆獨立引擎隨機走訪對打，逐步比對進展／品質／耐久／CP 與技能合法性；第二條再把我方 JS 的 `base_progress`／`base_quality`／`hqPercent` 對 Tnze 產的 golden 對帳。**已知差異寫在 `src/main.rs` 的 `ALLOWED` 清單且每條附理由**——清單外一律失敗，**要加新條目前必須先查遊戲客戶端判誰對，不要為了讓閘變綠而加**。清單裡的條目某輪沒出現也會印警告（多半代表上游修好了 → 該移除我方 workaround）。兩份 Cargo.toml 的 raphael tag 必須相同，由 `check-actions.py` 機械守（版本漂開＝這張網測的不是線上那顆＝假保護，且零錯誤訊號）。
- **改 `wasm/src/lib.rs`** → 跑 `cargo test`（host target 可跑，見上）；**重建 WASM 產物**一律走 `powershell tools\build-wasm.ps1`（需 nightly + wasm-pack + wasm32 target），`pkg/` 要一起 commit。**別直接跑裸 `wasm-pack`**：Rust 把 panic 的原始碼路徑編進二進位，crate 住在 `%USERPROFILE%\.cargo\` → 產物會帶建置者的 Windows 帳號名，而 `pkg/*.wasm` 是公開可下載的（瀏覽器必須抓它才能跑）。腳本用 `--remap-path-prefix` 把家目錄改寫成 `~`，並在編完驗收「產物不含建置者路徑」。
- **改 `.js` / `.css`** → **無 cachebust 步驟**（不像 ranking；index.html 靜態引用無 `?v=`，`_headers` 的 `must-revalidate` 負責重驗）。
- **手動 smoke**（改 UI / render / 求解路徑後）：`py -3.11 tools/serve.py`（no-cache dev server，預設 :8809；勿用裸 `python -m http.server`——缺 no-cache 會拿到瀏覽器快取舊版）於 repo 根 → 需 **portal svc :8774** 提供 codex CDN（`svc start portal`）→ 開 `http://localhost:8809/` → 選配方 → 填角色數值 → 求解 → 複製巨集。零 console error。
- **純文件 / 規則檔改動**：pre-commit gate 過 + 目視 diff 即足。

---

## 🛠 開發注意（踩坑 / 教訓）

- **技能 icon 取列策略勿改回 `ORDER BY id LIMIT 1`**（2026-07-27）：CraftAction sheet 同一技能有 8 個職業版本，**外加一批 `ClassJobLevel=1` 的未使用佔位列，Icon 一律是 `000786`（灰底紅斜線「無圖示」圖）且 id 最小**。取最小 id ＝ 7 個技能拿到佔位圖、看起來像「已停用技能」且不會報錯。正解＝排除 `000786` → `class_job_level` DESC → id ASC；`check-actions.py` 已加不變量機械守。只改技能對照時用 `py -3.11 tools/build-data.py --actions-only`（免重刷 4.1MB 配方資料）。**職業專屬 icon 固定木工版**（做金工配方也顯示木工工具）＝**Owner 2026-07-27 裁示的最終取捨**：技能名稱一致、只是圖示因職業略有差異，不影響使用，不值得為此改資料模型（B-008 已否決，勿再提案）。**紅線只有一條——不得出現佔位「刪除號」圖**（`000786`），已由 `check-actions.py` 不變量機械守。
- **食物/藥水下拉是自繪 listbox，不是 `<select>`**（2026-07-28）：需求要在選項裡顯示 icon＋物品品級＋功效，`<option>` 只吃純文字 → `app-consumable.js` 自建 `role=listbox`。**按鈕上的 Enter/Space 不要自己處理**——瀏覽器本來就會把它轉成 click，兩邊都做會「開了又關」（實測踩到）；keydown 只接 ↑↓ 開選單。選項的 icon/品級來自 `data/meals.json`・`medicine.json` 的 `icon`／`level` 欄，由 `tools/build-data.py --consumables-only` 以**繁中名對 item_lookup** 補上（124/124 全中；`level` 已驗證 == `items.level_item`＝物品品級，勿另算）。
- **這一區的設定是本地保存的**（`ffxiv-crafter-consumables-v1`）：食物／藥水／兩個 HQ 勾／專家之證／`<details>` 展開狀態全存。新增這一區的輸入項要一併進 `state` 並在 `init` 套回 DOM，否則會出現「畫面有值但重整就跑掉」的半套狀態。`setData` 會清掉資料改版後已不存在的保存品項（不留幽靈選擇）。
- **icon 一律走 xivapi v2 asset CDN**（2026-07-16）：v1 `xivapi.com/i/...` 圖庫停更、7.5 新 icon 404 → `app.js` `iconUrl()` 把 data 層 v1 路徑轉 v2 URL（權威寫法＝marketboard `modules/icon.js`）；新增 icon 出口勿再直拼 v1 網域，`_headers` CSP img-src 已鎖 `v2.xivapi.com`。
- **配方資料源＝tnze zh-CN（7.5 跟版）＋item_lookup 繁中化**（2026-07-16）：zh-TW 源停更 7.1 勿換回；重建流程＝best-craft `scripts/build-static-data.py`（刪 static-data 快取強制重爬）→ 本 repo `tools/build-data.py`。舊逐色染劑配方 200 筆是遊戲 7.5 改版移除（通用染劑 38254–38261 取代），勿當缺漏回補。
- **expert（高難度）配方靜態巨集僅供參考**：536 個 expert 配方在遊戲內為隨機製作狀態，靜態 Normal 巨集無法保證完成 → render 已加中性「試算完成 ⚠」+ 警語（**勿移除、勿改回無條件「✓ 可完成」金徽**）。
- **求解計時＝軟提示不殺 worker**（`solveClock` interval，每秒更新已耗時）：求解跑在 worker、主執行緒空閒故計數不凍結；≥60s 升級「可取消」提示但**不殺** worker（正常長求解仍在跑，UI 文案「可能數十秒」）；`stopSolveClock()` 掛在 onWorkerMsg / cancelSolve / onerror（別讓成功後計數殘留）。
- **「現在該做什麼」的唯一真相＝`app-flow.js` 的 `flowState()`**（2026-07-27 引導改造）：步驟軸／「下一步」文案／CTA 就緒提示／`pick-panel` 收合／`work.is-idle` 全由它一次算出，**勿在各層自己寫步驟文案或自行 toggle 這些 class**。新增會改變流程位置的事件（新分頁／新輸入）→ 呼叫 `globalThis.CraftFlow?.update?.()`（一律選擇性呼叫，測試 sandbox 缺本層不炸）。
- **首屏「等 fetch 才長內容」的區塊一律要預留高度**（2026-07-29 CLS 修）：field CLS P75 0.225 的來源是 `#pick-panel` 空殼→實體內容 **+588px**。三種手法各有適用：①內容是**確定的**（流程軸冷啟動態）→ 直接把 `flowHtml({})` 輸出寫進 index.html，JS 同字串覆寫（T17 守漂移）；②內容**筆數不定**（chips／翻頁器）→ `#picker.is-loading` 分段 `min-height`，首次 `renderTable()` 後卸下（**失敗路徑也要卸**，否則空井留著）；③**佔位塊自撐**（`.recipe-loading` min-height 60vh == `.recipe-table` max-height），innerHTML 一換即消失，最省事。新增首屏區塊時照這三類挑一種，**別再留空殼**。量測方法＝同源 iframe 固定寬度載入本站，比對「清空成載入態 vs 實際內容」的高度差（可逐 px 掃出窄屏折行斷點；本機 window 無法被自動化縮放）。
- **`hidden` 屬性設了不等於收得起來，`el.hidden` 也驗不出來**（2026-08-02 實際出包）：UA 的 `[hidden]{display:none}` 優先權最低，本地寫一條 `.x{display:flex}` 就蓋掉它 → JS 設 `el.hidden = true` 完全沒作用、元素照樣顯示。等級同步面板就是這樣**每個配方都顯示**，而我的瀏覽器測試查的是 `el.hidden`（值確實是 `true`）所以全綠。**驗這類收合一律看 `getComputedStyle(el).display` 或 `getBoundingClientRect().height`，不要查 `.hidden` 屬性。**新增「靠 hidden 收合」的區塊時同步補 `[hidden]` 守衛——已由 T21 機械掃描守住（styles.css 現有 7 條守衛，這坑在本 repo 反覆出現）。
- **宇宙探索配方的數值不是資料裡那個**（2026-08-01 B-016）：`Recipe.MaxAdjustableJobLevel=100` 的 768 個配方（8 職 × 96）存的 rlv 一律 690＝**Lv100 版本**。判它「真的會變」而不是「固定的高階配方」的依據是 `WKSMissionUnit`：**同一個 recipe id 同時掛在 LevelGroup 1/2/3**（三個不同等級級距的任務共用一列配方）且 `IsSynced=1`；反例對照＝LevelGroup 4/5/6 用各自專屬的高 rlv（701–775）配方，那些的 `MaxAdjustableJobLevel` 就是 0。修前 Lv70 玩家看到難度 4026（實際 658，**六倍**）→ 求解回「做不到」或給一份貼進遊戲完全對不上的巨集，**全程零錯誤訊號**。
- **等級→rlv 的對照是「取該職業等級的最小 rlv」，不是猜的**：資料裡可調整配方存的 rlv 正好就是 Lv100 的最小 rlv（690）——代入最高等級會還原成原值。這條 identity 已用**實資料全量**釘進 T20（768 筆逐筆比對），上游改版讓對照失效會直接紅。**不要拿任務的 LevelGroup 反推等級**（該欄沒有對應的等級表，datamining 也沒有 `WKS*LevelGroup` sheet）。
- **這一區的等級是本地保存的**（`ffxiv-crafter-level-sync-v1`）：留空＝跟隨「角色數值」的等級，填數字＝手動指定並保存。輸入框在使用者聚焦時**不得被 refreshSelectedGear 覆寫**（每次重繪都會走到，硬寫會吃掉游標與半打的數字）——同理整個 `#level-sync` 是 index.html 靜態骨架，JS 只改 value/文字，不重建 DOM。
- **下拉／浮層的窄屏溢出，只有實測才算數**（2026-08-02 B-011 2-3）：食藥 listbox 原本 `width: max(100%, 400px)`，
在 ≤430px 手機必然溢出（固定最小寬 > 可用寬）。**健檢報告當時判「800–1018px 中間寬度會溢出」是錯的**——
實測 800/900 完全正常。修法也踩了兩次坑：加 `@media { left: auto; right: 0 }` 把右溢出換成**左**溢出
（選單比按鈕寬，右緣對齊就往左長出去），且打壞原本正常的 800/900；改用 `calc(100vw - 常數)` 去扣包裝器偏移也不行
——**那個偏移本身會隨選單寬度變動**（選單太寬→整頁水平溢出→偏移量從 97px 變成 59px，等於在追一個會動的目標）。
定案＝窄屏（≤700px）讓 `.cfg-line` 標籤獨佔一行、控制項與選單 `width: 100%`，由版面自己保證落在容器內，不用任何魔術常數。
**量測手法（改這一區必重跑）**：同源 iframe 定寬載入本站（`tmp/width-probe.html` 的形式），逐一設 1400/1018/900/800/430/390/360，
展開選單後量 `getBoundingClientRect()`，驗 `left >= 0`、`right <= 視窗寬`、末列選項完全落在視窗內。
`tools/test-formulas.mjs` 的 T26 只擋「已知會壞的形狀」（無上界最小寬／缺窄屏規則），**CSS 文字比對驗不了 layout**。
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

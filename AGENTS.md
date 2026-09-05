# AGENTS.md — ffxiv-crafter

FFXIV 繁中服 DoH 配方製作求解器。純靜態站 + Rust/WASM raphael 引擎（web worker）。**沒有自己的資料後端**（配方資料全是 build 時產的靜態 JSON），另有兩支 CF Pages Functions（見架構表 `functions/`）。輸入配方＋角色數值 → 算最佳製作手法 → 手法序列 + 逐步走查 + 一鍵複製遊戲巨集。external 公開工具，部署 Cloudflare Pages，FFXIV-TW-tools portal 註冊。

**規模級別：S**（DEVLOOP §5）——單一子系統、約 3.9k 行手寫碼、單一部署目標、無 cron／多機協作／即時資料管線。**不設 ROADMAP 分解層**（直接 Plan→Build）。判 S 偏 M（有 Rust/WASM 一層非顯而易見），但無跨子系統協調需求 → 維持 S。**檔案清單看下方架構表**（本段刻意不列，那會是第二份會漂移的名單）。

R7-exempt: 2026-11-16 依據：2026-08-16 Owner 拍板（B-025 第二輪）。已照 R7 規定的順序做完前兩步——
**移除**第二事實源、**搬移**敘事到 `docs/lessons.md`／`docs/test-baseline-history.md`、有測試守的條目降成
「規則一行＋測試編號」，36.1KB → 28.3KB。剩下的每一條都是可執行規則，再砍就是 R7 自己警告的
「為壓 byte 刪有效紅線」。唯一剩下的結構性選項是把「部署面鐵則」段（3.8KB）移出常駐層，但**13 個
external repo 的 AGENTS.md 全部內嵌該段且明文要求同步全部副本** ⇒ 那是 13 repo 的一致決定、不該單邊做，
而且做完約 24.5KB **仍未達標**。到期時重評：屆時若該段已在艦隊層集中化，本豁免即應撤銷。

> 設計＆決策不在本 repo：spec `external/ffxiv-tw-tools-portal/docs/specs/` 的 `2026-06-22-craft-solver-spec.md`（公式 §4 對抗驗證）+ ADR-013。重建 / 部署見 `README.md`。踩坑敘事＝[`docs/lessons.md`](docs/lessons.md)、測試數字沿革＝[`docs/test-baseline-history.md`](docs/test-baseline-history.md)。

---

## 🔒 工具鐵則（違反必阻擋）

- **`hqPercent()` 品質%→HQ% 對照表勿改**（`app-render.js`）：逐格移植自 ffxiv-crafting 7.4.5 權威遊戲表（Tnze），表的斷點/缺口是遊戲真實值、**不是 bug**。改前先舉具體「品質→HQ%」反例。
- **製作公式已對抗驗證**（`computeSettings`，spec §4）：改動前先舉具體「錯誤輸入→輸出」反例，勿憑印象報「公式可能錯」。u16 無溢位、serde 對超界值**報錯而非靜默截斷**——勿改成 clamp 吞錯。
- **DRY — 遊戲資料一律來自 monorepo `game_ref.sqlite`**（`build_game_ref.py` 產）→ `tools/build-data.py` 轉成 `data/*.json`。**禁自建對照表**，三處各有機械守：
  - 技能繁中名／icon：`craft-actions.json` 鍵集合必 == `wasm/src/lib.rs` 的 Action 變體（35=35，`check-actions.py`）
  - 「哪些配方會依等級同步」：`recipe_level_sync`（由 `Recipe.MaxAdjustableJobLevel` 解出）→ `level-sync.json`。**禁用「rlv==690」之類的形狀猜測**（現況巧合，改版即靜默失效）。等級→生效 rlv 的換算只在 `app-level-sync.js` 一處
  - 品質階段：`recipe_quality_stages`（由 `Recipe.CollectableMetadata` ＋ `CollectableMetadataKey` 解出）→ `quality-stages.json`。只收已確證的 key 1（收藏品）與 key 7（宇宙任務）＝992 個配方；key 2/3/4/6 的 728 個**刻意不輸出**（root BACKLOG B-041），那些配方只有「滿品質」可選是預期行為。換算只在 `app-quality-stages.js` 一處（T54 守：資料出現前端不認得的 `src` 即紅）
- **繁中服至上**：所有顯示一律繁體中文正名（職業名 木工/鍛造/…、技能名走 game_ref、高難度=expert）。疑慮查 Lumina `ChineseSimplified.ScName` 或灰機 wiki，不自創。
- **codex 設計系統**：button/form/token/table 用 portal CDN 的 `.codex-*`，勿 local 重寫；`.panel`/`.codex-tablet` 容器 padding ≥16px。**改 UI/CSS 前先 Read** portal repo（`external/ffxiv-tw-tools-portal`）的 `_DESIGN-SYSTEM.md`（跨 repo 指標拆兩段寫，理由見 CLAUDE.md；勿寫死磁碟機代號），本站已踩過的細節見下方「UI / 設計系統」。
- **共用鐵則（monorepo 全域）**：`except: pass` 禁止（失敗至少 `console.warn`）；dict 快取一律 bounded；新建原始碼檔 >500 行禁止（既有檔 >500 被實質修改時觸發拆分 review 閘門）。

---

## 🏗 架構

純靜態站，三層 + 引擎。**每支模組的職責細節、私有狀態、與「為什麼這樣寫」都在該檔自己的檔頭註解**——下表只給一句話定位，不複述檔頭（那會是第二份事實源，2026-08-15 實測已漂移兩次）。

**模組 pattern（跨層一致，動任何一層前先懂這個）**：classic script 發佈 `globalThis.CraftXxx` ＋ `app.js` init 注入依賴（getter 取 live 狀態，因為 `loadData` 會重新賦值 `ITEMS`／`ACTIONS` 綁定）＋ `app.js` 以**同名 proxy** 委派 → 拆檔時既有呼叫點零改。看到「app.js 與模組有同名函式」不是重複實作。

| 檔案 / 目錄 | 一句話職責 |
|------|------|
| `index.html` | 靜態骨架＋`document.write` 注入 portal CDN bootstrap＋SEO/JSON-LD |
| `first-run-hint.js` | **parser-blocking** 的外部 classic script：解析階段就決定首次提示顯隱（CLS）。硬約束（不得 inline／defer／async／module、key 與 `app-gear.js` 綁定）＝`tests/first-run-hint-key.test.mjs` |
| `404.html` | 未知路徑回真 404（不落 SPA fallback ⇒ 假路徑不放大成計費請求；monorepo `check-unknown-path-cost` 守） |
| `tests/` | 跨檔靜態契約（settings-api 代理／first-run-hint／select 寬度預留）；`run-all.mjs` 自動掃描且有檔數下限 |
| `app.js` | 前端控制器（唯一 `type=module` 入口）：資料載入／`computeSettings`・`recipeMaxes`／食藥加成／分頁／init 接線 |
| `app-flow.js` | 流程引導：`flowState()` 純函式＝「現在該做什麼」的唯一真相 |
| `app-render.js` | 結果渲染：`hqPercent`（純）／手法序列 chips／走查表／巨集組裝 |
| `app-solve.js` | 求解編排：worker 生命週期／`doSolve`／求解計時／世代守衛／取消 |
| `app-browse.js` | 配方瀏覽表：職業篩選 chips／每頁 60 筆分頁／已加入清單標示 |
| `app-gear.js` | 角色數值：localStorage 讀寫與型別驗證／等級 clamp／專家之證逐職勾選 |
| `app-recipe.js` | 配方詳情狀態機：選配方／原料與初始品質／**製作鏈**（返回堆疊）／**多職業切換** |
| `app-nextcraft.js` | 「用這個成品還能做什麼」：由 `ingredients.json` 倒建反查索引＋下一階配方選取視窗（**無新資料檔**）|
| `app-quests.js` | 職業任務分頁：11 職任務清單／完成勾選／素材遞迴展開／商人徽章 |
| `app-consumable.js` | 食物／藥水自繪 listbox（原生 `<option>` 放不了 icon／品級／功效）＋本區本地保存 |
| `app-quality-stages.js` | 品質階段 → 目標品質。**兩種來源單位不同，換算只有這裡一份** |
| `app-level-sync.js` | 等級同步：解出生效 rlv 並寫回 `selected.rlv`（顯示與求解共用） |
| `crafting-list.js` | 製造清單：清單狀態(localStorage)／素材彙總 `aggregateMats`（純函式）／採購 CSV |
| `worker.js` | web worker：載 raphael WASM 跑 `solve` |
| `functions/` | 本 repo 唯一的伺服器端程式碼（CF Pages Functions）：`settings-api` 設定 API 同源代理（service binding 直呼，**不得改成 `fetch(URL)`**——會讓 per-IP 額度變全站共用；路徑白名單＋Origin 缺席才補）。有 `tests/*.test.mjs` 守 |
| `styles.css` | 工具樣式，token 全來自 portal CDN |
| `wasm/` | 自寫 Rust 薄綁定（raphael-rs v0.26.2，Apache-2.0）；公式在 JS 端算好、WASM 只跑引擎 |
| `pkg/` | wasm-pack 輸出 — **必須 commit**（CF Pages 不編 Rust）。`.gitignore` 是 `*` 且改不動，故同步戳記放 `wasm/BUILD-STAMP.json` |
| `data/` | recipes／items／ingredients／recipe_levels／craft-actions／meals／medicine／quality-stages／level-sync／job-quests／vendors JSON（`tools/build-data.py` 產） |
| `assets/` | `hq.png`（遊戲內 HQ 圖，**與 marketboard 同一張**，不自畫） |
| `tools/` | `build-data.py`／`fetch-quest-qty.py`／`check-actions.py`／`build-wasm.ps1`／`build-notices.py`／`serve.py`／`test-formulas.mjs`／`sim-diff/` |
| `_headers` | CF Pages 安全標頭（CSP 完整分域）＋快取策略（一律 `must-revalidate` → **無 cachebust 腳本**，靠 ETag/304） |
| `LICENSE-THIRD-PARTY.txt`／`LICENSE-*.txt` | 散布 `pkg/*.wasm` 的授權義務（Apache-2.0 §4(a) 要交付 License 副本、MIT 要附著作權宣告；頁尾只寫授權名稱不算）。由 `build-notices.py` 自 `wasm/Cargo.lock` 產，**改 wasm 依賴後必須重跑並一起 commit** |
| `docs/health-reviews/` | 永久健檢檔案庫（豁免 docs 暫存→歸檔規則） |

**資料流**：選配方 + 填角色數值 → `computeSettings`（FFXIV 公式，含食物/藥水/專家之證）→ postMessage worker → raphael `MacroSolver` → replay 逐步 → render 手法序列 + 巨集。
跨工具深連結：`?recipe=<id>` / `?item=<id>`＋`?stage=1|2|3` 預選品質階段。**`stage` 只認階段序號，刻意不收絕對品質數字**——讓外部站塞絕對值進來等於開第二條換算路徑，對面資料一舊就靜默給出達不到門檻的手法。

---

## ✅ VERIFY（改動後跑，未過不算完成）

- **CLS：只看 localStorage 就能決定的顯隱，不要留給 `app.js`（module ⇒ defer）決定**（2026-08-23）。`#first-run-hint` 原本要等 `updateHint()` 才決定 ⇒ **首次繪製之後**才長出 80px，把流程軸與整個求解面板往下推；載入期 CLS 1366/900/390＝0.044/0.069/0.094 全來自這一發，而畫面上只是「提示晚一點才出現」。改成 `first-run-hint.js`（**parser-blocking 的外部 classic script**，掛在提示正下方）在解析階段先定案。⚠️ **第一版寫成 inline 被 T53 當場擋下，而它是對的**——inline 會擴大 CSP `unsafe-inline` 的依賴面，而那條的存在理由是「head 那兩段 bootstrap 非留不可」；外部檔走 `script-src 'self'`，時機完全一樣。⚠️ 不能改叫 `CraftGear.anyGear()`（要等 app.js 注入 deps，正是要避開的時機）⇒ key 有**兩份**，漂移哨兵＝`tests/first-run-hint-key.test.mjs`（同時鎖「不得改成 defer／async／module」——那會讓它跑在首次繪製之後，位移原樣回來而測試仍綠）。修後 0.0005/0.0011/0.0105。

**canonicalTest（safe-push 實跑的那一條；claude-skills `process/` 的 `fleet.json` 逐字對照本行）**：

```bash
node tools/test-formulas.mjs && node tests/run-all.mjs && py -3.11 tools/check-actions.py
```

<!-- TEST-BASELINE cmd="node tools/test-formulas.mjs" match="(\d+) passed, \d+ failed" expect="682" label="test-formulas" -->
<!-- TEST-BASELINE cmd="py -3.11 tools/check-actions.py" match="(\d+) 個 Action 變體" expect="35" label="check-actions" -->
<!-- TEST-BASELINE cmd="cargo test" cwd="wasm" match="(\d+) passed" expect="5" label="cargo round-trip" -->
<!-- TEST-BASELINE cmd="node tests/run-all.mjs" match="(\d+)/\d+ 測試檔通過" expect="3" label="run-all" -->
<!-- ↑ B-013：宣告值 vs 實測值的機械比對（node tools/check-test-baseline.js --repo .）。改測試數量時這裡要一起改，否則 pre-commit gate 6 會擋。 -->

> 機械閘基線 **只准升不准降**——**宣告值只寫在上方 `TEST-BASELINE` 標記**（四條：test-formulas／check-actions／cargo／run-all），這裡刻意不複述數字：散文那份曾停在 653 而標記已是 654，gate 6 只讀標記（健檢 R5 M6）。宣告值與實測值由 pre-commit gate 6 對帳。
> 逐輪沿革＝[`docs/test-baseline-history.md`](docs/test-baseline-history.md)；「為什麼這幾支被併進 canonicalTest」＝[`docs/lessons.md`](docs/lessons.md)。

```bash
node --check *.js                       # JS 語法（用萬用字元，不列清單——手維護的清單會漏掉新模組）
node tools/test-formulas.mjs            # 前端純函式 golden + 機械哨兵（T1〜T62，各條用途寫在測試檔內）
py -3.11 tools/check-actions.py         # 不變量：Action 變體對照 ＋ pkg/ 同步戳記 ＋ sim-diff 與 wasm 同一 raphael tag
cd wasm && cargo test                   # 不變量：parse_action ∘ action_name round-trip + 名稱唯一 + 神速技巧三條
```

<!-- B-048-HANDOFF -->
> **舊網址交接機制已於 2026-09-05 退役**：舊 `*.pages.dev` host 的 301 改由 Cloudflare **帳號層 Bulk Redirects** 在邊緣執行，本 repo 不再有 middleware、HTML 也不再有 inline 交接腳本（`?stay` 救援門一併結束）。
> `_routes.json` 的 include 只留 API 代理路徑（HTML 路徑不進 Pages Functions、不再計費）；交接頁測試與路由清單已隨之刪除（敘事見 `docs/lessons.md`）。
- **改 `wasm/`（改綁定或換 raphael 版本）→ 另跑引擎差分閘**（不進 pre-commit，太慢）：
  ```bash
  cd tools/sim-diff && cargo run --release          # 約 1 分鐘，~96 萬次施放；清單外的新分歧 → exit 1
  cargo run --release --bin js-golden > golden.json && node compare-js.mjs ../.. golden.json
  ```
  兩顆**零共用程式碼**的引擎隨機走訪對打（raphael-sim vs Tnze `ffxiv-crafting`）＋我方 JS 對 Tnze golden 對帳。**已知差異寫在 `src/main.rs` 的 `ALLOWED` 且每條附理由——清單外一律失敗，加新條目前必須先查遊戲客戶端判誰對，不要為了讓閘變綠而加**；清單裡的條目某輪沒出現也會印警告（多半代表上游修好了 → 該移除我方 workaround）。
- **改 `wasm/src/lib.rs` 或 `Cargo.lock`** → `cargo test`（host target 可跑）＋ `powershell tools\build-wasm.ps1` 重建 `pkg/` 並更新 `BUILD-STAMP.json`（否則 `check-actions.py` 會紅），`pkg/` 一起 commit。**別跑裸 `wasm-pack`**——產物會帶建置者的 Windows 帳號名而 `pkg/*.wasm` 是公開可下載的（`docs/lessons.md`）。
- **改 `wasm/Cargo.toml` 依賴** → `py -3.11 tools/build-notices.py` 重產 `LICENSE-THIRD-PARTY.txt` 一起 commit（授權義務跟著依賴變）。
- **改 `.js` / `.css`** → **無 cachebust 步驟**（index.html 靜態引用無 `?v=`，`_headers` 的 `must-revalidate` 負責重驗）。
- **手動 smoke**（改 UI / render / 求解路徑後）：`py -3.11 tools/serve.py`（no-cache dev server :8809；勿用裸 `python -m http.server`）＋ portal svc :8774 提供 codex CDN（`svc start portal`）→ 選配方 → 填數值 → 求解 → 複製巨集。零 console error。
- **純文件 / 規則檔改動**：pre-commit gate 過 + 目視 diff 即足。

---

## 🛠 開發注意（踩坑 / 教訓）

> **可執行的規則全在本節**（每 session 自動載入）；「怎麼發現的、錯了會怎樣」在 [`docs/lessons.md`](docs/lessons.md)。**標了測試編號的條目，敘事在該測試自己的註解裡**——動那一區前先讀測試。新增條目前先問「能否固化成測試」（DEVLOOP §4.4.1）。

### 資料與求解

- **上游 raphael 把「工匠的神速技巧」的耐久寫死 10，遊戲實際是 0**：升版救不了（上游 main 至今仍是 10）。我方在 `wasm/src/lib.rs` 補償且**不動 raphael 原始碼**（保住「以未修改原始碼編譯」聲明）。**上游哪天修好，`trained_eye_plan_is_not_padded_by_upstream_durability_bug` 會轉紅＝該移除 workaround。**
- **宇宙探索配方的 rlv 不是資料裡那個**：那 768 個配方一律存 690（Lv100 版），實際依角色等級同步；判準是 `Recipe.MaxAdjustableJobLevel`，**不是 rlv 的形狀**。等級→rlv ＝「取該職業等級的最小 rlv」（T20 用實資料 768 筆全量釘住）。**不要拿任務的 LevelGroup 反推等級**（該欄沒有對應的等級表）。
- **配方資料源＝tnze zh-CN（7.5 跟版）＋item_lookup 繁中化**：zh-TW 源停更 7.1 勿換回；重建＝best-craft `scripts/` 的 `build-static-data.py`（刪快取強制重爬）→ 本 repo `tools/build-data.py`。舊逐色染劑配方 200 筆是遊戲 7.5 移除（通用染劑 38254–38261 取代），勿當缺漏回補。
- **`build-data.py` 缺上游輸入＝exit 1**（B-030）：缺的那份不覆蓋（前一個好狀態保留），但**不得回報成功**——以前印一行 ⚠ 就照跑到底，等於「以為重建了，其實 data/ 還是舊檔」。新增上游輸入時用 `problem()` 不要用 `print`。
- **資料檔的 ratchet 只准升不准降**（T31／T32／T54）：交付數量對帳 228/290、商人 NPC 247/256、食藥 icon 全中、quality-stages 992 筆。這些的產生端全是 fail-open（查無寫 null、照樣 ✓），退步時畫面只是「多幾件標未知」⇒ **零訊號，只有資料斷言擋得住**。
- **expert（高難度）配方靜態巨集僅供參考**：536 個 expert 配方在遊戲內為隨機製作狀態 → render 用中性「試算完成 ⚠」+ 警語（**勿改回無條件「✓ 可完成」金徽**）。
- **求解上限單一算式**：顯示與求解共用 `recipeMaxes(recipe, rlv)`，勿內聯重算——配方表的「難度／品質」欄同樣走它（RINDEX 建索引時算一次），缺 rlv 列顯「—」不顯 0。
- **配方有最低能力要求就得擋**（`Recipe.RequiredCraftsmanship`／`RequiredControl`，3396／13874 個有）：遊戲內不到門檻**根本不給做**，站上原本零引用這兩欄＝使用者拿到一份進遊戲用不了的巨集。單一出口＝`app.js` 的 `statShortfall(recipe, gear)`，顯示（配方詳情「需求 作業/加工」紅字＋⚠）與擋閘（`doSolve` 擋下、寫出差多少、導去角色數值）共用。⚠ 比較基準是 **`effectiveStats`（含食物／藥水／專家之證）**——遊戲判定同樣吃 buff，拿裸裝比會誤擋。求解鈕走 `aria-disabled` 不用真 disabled（同「缺角色數值」的既有取捨）。T60／T61 守。
- **配方版本＝成品的實裝版本**（`item_lookup.items.patch`，13874 筆全有值）：`#patch-filter` 選項**由資料生成**（繁中服開服即 7.0 ⇒ <7.0 併成「7.0 以前」、之後按實際有配方的版號分，各帶筆數），寫死版號清單＝資料一更新就靜默漏配方。⚠ 版號比較一律 `parseFloat`，**不可拆 (major, minor) 整數比**——7.15 的 minor 是 15、7.5 的是 5，整數比會把 7.15 排到 7.5 後面，而下拉看起來仍「有排序」。T11 守。
- **高難度是配方屬性 `is_expert`（536 筆）不是名字**：列表掛 `.rt-expert` 徽章＋`#expert-filter` 三態（全部／只看／排除）。**新增任何篩選控件都要同時做三件事**：進 `filterKey()`（否則切篩選不回第 1 頁 → 停在不存在的頁看到空表）、進「無符合配方」判斷、在 `app.js` 掛 `change`（漏了就是「畫面有控件、按了沒反應」而 console 全乾淨）。T11 三條都有守。
- **配方表可就地增減**：每列 ＋（加一次）／−（退一次，減到 0 整筆移除）。− **恆 render、用 `hidden` 收合**——`markListState` 是 in-place 更新（保留焦點），改成「不在清單就不 render」會每次清單變動重建 DOM。兩顆都**不上 `--danger`**（同質可重加物件的列級增減走設計系統豁免）。**槽位固定＝定寬兩欄 grid**（Owner 2026-08-19）：flex 下 − 收掉時整組會重新置中、＋ 往左跳一格，剛按完加入的游標正好停在 − 上。T11 守。
- **素材總需求分三組**（可自製／採集購買／晶體）：挑配方走 `CraftRecipe.pickRecipeForItem`、商人徽章走 `CraftQuests.vendorHtml`，**不在製造清單層另刻一份**。「⚒ 加進清單」傳的是**做幾次**不是要幾個（一次產 3 個時要 4 個只需做 2 次）；`removeOne` 是 −1 不是整筆清掉。T58 守。
- **改任一求解輸入 → 舊巨集失效**：`invalidateResults()` 集中失效（opt-* / 目標品質 / solve-mode / HQ 素材 / 食藥 / 角色數值）。程式設值不觸發 input 者須手動呼叫；新增求解輸入時記得掛。
- **巨集每一段結尾都要有帶音效的 `/echo`**（Owner 2026-08-16）：中段「第 N 段完成」、末段「製作完成」。連帶**開音效時單段容量是 14 步不是 15**（遊戲上限 15 行，最後一行留給 echo）。**兩個例外**：① 剩下**剛好 15 步**的末段整段塞滿、不補 echo——為一行提示音多切一段＝玩家多存一格巨集、多按一次（只有末段會命中，中段的「第 N 段完成」不會被吃掉）；② 玩家可用 `#macro-echo` 關掉音效（偏好存 `ffxiv-crafter-macro-echo-v1`），關掉時單段回到 15 步。切換只重組巨集、**不是求解輸入**（不進 `invalidateResults()`）。T39 驗每段 ≤15 行、不漏步、段數 golden 與開關接線。

### 前端狀態與流程

- **分層 classic script 缺席一律硬失敗**：`app.js` init 對每一支 `app-*.js`／`crafting-list.js` 都要 `throw new Error('<檔名> 未載入（部署不完整）')`。用 `?.` 軟略過的話，那支檔 404 時玩家拿到「看起來正常、按下去才無聲 TypeError」的頁面。**T49 由 index.html 的 script 清單反推涵蓋率**。各層**內部**的 `globalThis.CraftXxx?.` 選擇性呼叫不在此列（給測試 sandbox 只載部分層用；stub 收在 `LAYER_STUBS()` 一處）。
- **「現在該做什麼」的唯一真相＝`app-flow.js` 的 `flowState()`**：步驟軸／「下一步」文案／CTA 提示／`pick-panel` 收合／`work.is-idle` 全由它一次算出，**勿在各層自己寫步驟文案或 toggle 這些 class**。新增會改變流程位置的事件 → `globalThis.CraftFlow?.update?.()`。
- **晶體判定只有 `app.js` 的 `isCrystal(iid, name)` 一份**：各層經 deps 注入取用，**不得自己寫那個正則**（T48 守）。
- **程式化切頁一律帶移焦**（`switchTab(name, true)`）：那幾條路徑都是「被擋下 → 去補資料」的補救動線。只有 tablist 自己的 click handler 例外（T47 掃描）。
- **製作鏈：中間材要能「先做這個 → 一鍵回來」**：可製作的素材給 `.ing-go` 入口，點下去把當前配方推進**返回堆疊**（多層，鏈可能 A←B←C）。**堆疊不在切分頁時清空**（玩家常跳去補數值再回來），只有「返回配方列表」或另選配方才算放棄。「先做這個」鈕上的次數＝**「做幾次」不是「要幾個」**（一次產 3 個時要 4 個只需做 2 次；T58 守同一條）。`craftPlan` 整鏈展開已於 2026-09-05 刪除（生產端零呼叫、鑽石依賴會重複計數，B-032）——匯出必有呼叫端由 T64 掃描守。
- **「繼續做」＝反方向的動線**（Owner 2026-08-17）：`app-nextcraft.js` 由 `ingredients.json` 倒建 itemId→配方 索引（**沒有新資料檔**），入口鈕住頂部「目前配方」那一列（不佔配方詳情高度），沒有下一階時整顆收起。**往上走不推返回堆疊**——一路往上做會堆出一長串用不到的返回點；選到的正好是堆疊最上層時等同「← 回」並彈掉（T57）。一件成品**只佔一列**（多職業合併，挑法同 `pickRecipeForItem`）、做得起的排前面。**清單最多 234 筆**（實測綠金錠）故走彈出視窗、不就地展開。
- **遮罩關閉必須「按下」也在遮罩上**：只看 `click` 的話，開窗那一發滑鼠在按鈕上按下、放開時遮罩已蓋在游標底下 ⇒ 該次 click 的 target 變成遮罩、視窗開了又立刻關掉，**玩家看到「按鈕沒反應」而 console 全乾淨**。`.click()` 測不出來（沒有 mousedown），T56 有哨兵。新開 modal 一律照這條寫。
- **同一件東西常常好幾個職業都能做**（實測 651 件）：`RECIPE_BY_ITEM` 的「取先出現者」**只用於配方表**；深連結、製作鏈、職業切換一律走 `RECIPES_BY_ITEM` ＋ `pickRecipeForItem()`（**優先挑玩家有填數值的職業**，否則他按求解只會被擋在角色數值頁）。畫面一律給切換鈕，不幫他決定死。**同職也常多張**（136 組 2〜4 張）：挑選規則＝同職取**難度最低**；數值與原料完全相同的重複列只留一顆鈕；同職多張的鈕面帶「難度／品質／耐久裡第一個有差異的數字」、三個都同就編號並在 data-help 列原料（T52）。
- **專家之證是「角色狀態」不是求解選項**：住 `gearsets[職業].specialist`，遊戲上限 3 由 `CraftGear.SPEC_MAX` 守（第 4 個回退＋toast，不用 disabled——那會讓鍵盤走不到也讀不到原因）。求解端一律讀 `gear.specialist`，**禁止再從 DOM 讀 `#specialist`**。⚠ 證**不跟著數值的 fallback 走**：某職沒填數值時數值取「預設」，但證仍看該職業自己那格。
- **求解計時＝軟提示不殺 worker**：計數跑在主執行緒故不凍結；≥60s 升級「可取消」提示但**不殺** worker。`stopSolveClock()` 掛在 onWorkerMsg / cancelSolve / onerror。
- **三處本地保存的欄位要在 `init` 套回 DOM**：食藥區（`ffxiv-crafter-consumables-v1`，含兩個 HQ 勾與 `<details>` 展開狀態）／等級同步（`ffxiv-crafter-level-sync-v1`，留空＝跟隨角色數值）／角色數值。少一步就會出現「畫面有值但重整就跑掉」的半套狀態。等級輸入框**在使用者聚焦時不得被 `refreshSelectedGear` 覆寫**（會吃掉游標與半打的數字）。
- **轉義紀律**：動態字串（配方名／技能名／引擎 error）進 innerHTML 一律 `esc()`；icon 路徑來自 build-data 常數／game_ref、無注入面故不 esc（勿當 drift 誤補）。

### UI / 設計系統

- **「內容井」（比 panel 深一階的實底＋accent 染框）只有 `.crafter-well` 一份**：配方表／配方清單／素材總需求三處共用，本地**不得再宣告 background／border／border-radius**（值一樣所以畫面全正常，事實源卻分岔——同下一條 `.codex-tint-panel--neutral` 的教訓）。內外分層是可讀性的主力：Owner 2026-08-19「看不清主次」即製造清單那兩張卡少了這層。T59 守。
- **中性分組容器的幾何走共用 `.codex-tint-panel--neutral`**、底色以 `--panel-bg` 傳參，本地只留 padding 與外距——**不得把 background／border／border-radius 寫回本地**（值一樣所以畫面全正常，但幾何就分岔成兩份事實源）。**巢狀時一律顯式寫 `--panel-bg`**：那是 CSS 自訂屬性、**會繼承**，不指定就吃到父層底色（T36）。
- **配方表高度＝當前螢幕還剩多少**（`CraftBrowse.fitHeight()`，Owner 2026-08-19：「只捲表格、不要連外層一起捲」）：可用高度＝視窗高 −表格上緣 −（`<main>` 底緣 − 表格底緣）−8。⚠ **不可拿 `document.scrollHeight` 反推**——body 有 `min-height:100vh`，內容短於一個螢幕時文件高度**恆等於視窗高、不隨內容縮**（2026-08-19 portal 補 `box-sizing` 之前更是恆為 100vh+64） ⇒ 每量一次多扣一截（實測 489→419→349，症狀是「縮放幾次後表格剩一條縫」且零錯誤訊息）。極矮視窗收在 `MIN_H`（約 6 列）＝寧可外層捲，不把表格壓成縫。T11 守冪等性與下限。
- **配方表欄數與 CSS 的 `nth-child` 百分比寬是隱性契約**：只加 `<td>` 不改 CSS ⇒ 最後一欄被擠掉而畫面只是「有點怪」（T11 對帳兩邊數量）。⚠ `<td>` 的 `height` 是**內容盒**下限，padding／border 另外加（`box-sizing` 對 table-cell 不生效）⇒ 實際列高＝宣告值 ＋9px；改列高一律以量測為準（舊值宣告 46 實際畫 55）。
- **表格一律消費共用 `.codex-table`**（`.rt`／`.wt-table`／`.gear-table`）：欄寬脫鉤用 `--fixed`、表頭釘頂用 `--sticky`。**不要自刻 sticky**——`border-collapse: collapse` 下 th 的 border-bottom 由 table 畫、不跟著 sticky 移動 ⇒ 捲動時列穿到表頭下方沒有分隔線（本站原本就中招）。本地只留視覺特化（T50）。列內可能插徽章的儲存格要預留 `min-height`，否則有徽章的列高一截。
- **功能性圖示鈕與剪貼簿走 portal 共用元件**：`window.FFXIVIcons.btnHTML(name, label, attrs)`／`window.FFXIVClipboard.copy(text, label)`；缺 CDN 時要有退場版（功能不消失，T34）。**禁自刻 emoji 鈕**（字型相依、拿不到 currentColor、縮小後糊）。⚠ `label` 必填（缺會 throw）。⚠ 鈕不能放進 `<a>` 裡（互動元素不得互套），素材列因此是「容器 div ＋ 內層連結 ＋同層的鈕」，click 要 `preventDefault()`。**帶文字的動作鈕（`📋 加入清單`）刻意維持 emoji**，別順手統一（T35 有負向哨兵）。
- **hover 說明一律 `data-help`，禁原生 `title`**：圖示鈕另補 `aria-label`；`window.FFXIVHelp.setup()` 在 init 呼叫一次（冪等）。
- **`hidden` 設了不等於收得起來**：UA 的 `[hidden]{display:none}` 優先權最低，本地一條 `display:flex` 就蓋掉。**驗收看 `getComputedStyle(el).display`，不要查 `.hidden` 屬性**；新增靠 hidden 收合的區塊要補 `[hidden]` 守衛（T21）。
- **首屏「等 fetch 才長內容」的區塊一律要預留高度**（CLS）：①內容確定→靜態寫進 index.html（T17）②筆數不定→`.is-loading` 分段 `min-height`（**失敗路徑也要卸**）③佔位塊自撐。**別再留空殼。**
- **同一列裡「唯一能縮的那一欄」不得 `min-width: 0`**：配方詳情標題列（`.ri-main`）與職業任務交付物列都中過同一招——動作鈕一多就把品名壓成一個字寬、直排。給收縮下限後，放不下的是**動作群整條換行**（`.ri-head` 本來就 flex-wrap）。T44／T55 守形狀，實際驗收看量測。
- **窄屏溢出只有實測才算數**：定案＝窄屏（≤700px 下拉／≤760px 任務交付物列）讓標籤與動作群獨佔一行，**不用任何魔術常數**（`left:auto;right:0` 會換成左溢出、`calc(100vw - 常數)` 的偏移量本身會變動）。**改這一區必重跑量測**：同源 iframe 逐一設 1400/1018/900/800/430/390/360，驗 `left>=0`、`right<=視窗寬`、品名不被壓成 0 寬。T26／T44 只擋「已知會壞的形狀」，**CSS 文字比對驗不了 layout**。
- **求解選項的說明是常駐文字不是 hover**（`.crafter-opt__desc`）：停用時**不隱藏控制**，改暗掉 + `.crafter-why` 寫出原因。
- **食物/藥水下拉是自繪 listbox 不是 `<select>`**：**按鈕上的 Enter/Space 不要自己處理**（瀏覽器已轉成 click，兩邊都做會開了又關），keydown 只接 ↑↓。
- **icon 一律走 xivapi v2 asset CDN**：v1 圖庫停更、7.5 新 icon 404 → `app.js` `iconUrl()` 轉 v2 URL（權威寫法＝marketboard `modules/` 的 `icon.js`）；`_headers` CSP img-src 已鎖 `v2.xivapi.com`。
- **CSP `unsafe-inline` 的依賴面不得擴大**：index.html 的可執行 inline script 恰為 2 段（T53）。要加第 3 段先問「能不能改成外部 `.js`」。

### 職業任務分頁

- **資料有兩個來源，責任分清楚**：任務／交付物／職業對照＝**台服解包**（權威）；交付數量＝**社群試算表**（`tools/job-quest-qty.json`）；**商人資訊完全走解包** `gil_shop_npc.json`——**不要再從社群試算表補商人**。社群名對回 item id 走 `name_tc`→`name_sc`→OpenCC t2s 後 `name_sc`，**id 相符才採用**；顯示一律用解包的台服名。地名縮寫用試算表首頁的對照表還原，不自建（T31／T32）。
- **要交 HQ 的東西，不能說「商人有賣」**：商人賣的是 NQ ⇒ 任務要求 HQ 時**整個商人徽章不出**（寫「有賣」是誤導、寫「只賣 NQ」是廢話）。**`hq == null` 是「未知」不是「不用」**——當成不用的話玩家是買完站到 NPC 面前才發現交不了。要交 HQ ＝品名後貼 `assets/hq.png`（與 marketboard 同一張），**不要自創符號**（T33）。
- **沒有座標 ≠ 沒有商人**：通用商人（「武具商」「雜用商人」）資料裡常只有名字，照樣要列，只是把帶座標的排前面；用 `if n.zone` 過濾會讓 247 件掉到 172 件而畫面說「查不到」。
- **技能 icon 取列策略勿改回 `ORDER BY id LIMIT 1`**：正解＝排除佔位圖 `000786` → `class_job_level` DESC → id ASC（`check-actions.py` 守）。只改技能對照用 `build-data.py --actions-only`。**職業專屬 icon 固定木工版是 Owner 裁示的取捨，B-008 已否決勿再提案**；紅線只有「不得出現佔位刪除號圖」。
- **DOH / JOB_ICON 為 local hardcode**：`jobs.json` 僅 21 戰鬥職、不含製作職 → 刻意 local，非漏 sync（BACKLOG B-001 待拍板）。

### Git 邊界

commit 先知會、逐主題切；**push → CF Pages 自動部署對外可見 → STOP，由 Owner 跑** `bash ~/.claude/skills/process/tools/safe-push.sh --repo C:/FFXIVProject/external/ffxiv-crafter --reason "<原因>"`（canonicalTest 綠才推＋JSONL 留痕）。**裸 `git push` 被 hook 硬擋、不得繞**，也不要改列 `!git push` 請 Owner 代跑（那條不經 hook、會少一筆 push-log）。憑證排錯：401 ＝ Windows Credential Manager 只在 cmd／git-bash 抓得到，改在 git-bash 重跑。

---

## 開發循環（DEVLOOP）

正典：`~/.claude/process/DEVLOOP.md`。本 repo 工件：`CHANGELOG.md`、`docs/BACKLOG.md`、`docs/health-reviews/`（健檢檔案庫）。**設計 spec 落外部 portal repo**（`external/ffxiv-tw-tools-portal/docs/specs/` 的 `2026-06-22-craft-solver-spec.md` + ADR-013），本 repo 不另立 specs/。

### 🔒 部署面鐵則（2026-08-01，勿回退）

本 repo 的 CF Pages 部署**不是「發佈 repo 根目錄」**，而是由 `deploy-prepare.sh` 依 `deploy-allow.txt` 產出 `_site/`。CF dashboard 必須設 Build command = `sh deploy-prepare.sh`、Build output directory = `_site`。

> 本段為 12 個 external repo 的**共用權威版本**（2026-08-15 統一）：三條原本只寫在單一 repo 的教訓（cache-bust 假紅燈／分類閘的靜默放行／產物路徑並行安全）已回填到所有副本。改本段請同步全部副本，不要只改一份。

- **為什麼**：CF Pages 無 build 步驟時把 repo 根整棵目錄當靜態資產上傳 → `AGENTS.md`／`docs/`／`tools/`／`tests/`／`worker/` 後端源碼全部變成該網域下可直接 GET 的公開檔（2026-08-01 實測 12/13 站中招）。**private repo 只保護「誰能 clone」，不保護「已部署的檔案誰能下載」**；`.gitignore`（檔是 tracked）／`_headers`（只加標頭）／`robots.txt`（只擋收錄不擋直取）都擋不到。
- **允許清單而非排除清單**：頂層出現任何未列入 `deploy-allow.txt`／`deploy-deny.txt` 的項目 → **build 直接失敗**。新增內部資產的預設值是「不發佈」，不靠任何人記得。排除清單做不到（實測當天漏了 `worker/` 106 支 .ts 與 `_tools/`／`_cache/` 141 檔）。注意（健檢 R3 D6）：分類閘另有兩條靜默放行（CF 容器 npm 產物固定 skip 清單、`git check-ignore`）——它是「逼人歸類」的提醒層；**真正的部署邊界是第 2 段複製迴圈的 allow-list 比對**，改腳本時該比對不可動、skip 清單只放建置環境產物不得用來繞分類。
- **新增站台資產**（新頁面／新資料夾）→ 加進 `deploy-allow.txt`；**新增內部資產** → 加進 `deploy-deny.txt`。改完跑一次 `sh deploy-prepare.sh` 確認印出「✓ 部署輸出就緒」。
- **腳本改動禁忌**：① 只能用 POSIX 語法（CF 容器的 `sh` 是 dash，`read -r -d ''` 之類 bashism 會靜默失敗、輸出 0 檔而 build 仍「成功」⇒ **整站 404**，2026-08-01 實際發生）② 根層檔名不可無條件 `mkdir "$OUT/${f%/*}"`（會建出「叫 index.html 的目錄」⇒ `/` 404）③ 不得移除出貨前驗收閘（輸出 <3 檔／缺 index.html／內部檔混入 → 非零 exit，CF 保留前一版）④ **產物路徑不得假設獨佔**：只要主工作樹可能被並行 session 或 cron 同時使用，固定的 `_site` 一定互踩。ranking B-117（2026-08-15）實證：只做「逐次專屬」而不加鎖**仍然兩份都 exit 1**（撞在 `rm -rf _site`），現行解＝建到 `_site.tmp.$$`、清單走 `mktemp`（repo 外）、換名段用 `mkdir "$_site.lock"` 序列化，哨兵＝`test_deploy_prepare_is_concurrency_safe`。兩次實際故障的訊息（「頂層出現未分類項目」「輸出缺 index.html」）**都指向錯的方向**，看起來像漏加允許清單 —— 本 repo 日後若接排程／並行寫入者，照 ranking 的做法改，別重新 debug 一次。
- **部署後驗**（**務必帶 cache-bust**）：`curl -sI "https://<repo>.pages.dev/AGENTS.md?cb=$(date +%s)"` → 回 `text/html` 正常（檔案不存在、走 SPA fallback）；回 `text/markdown` = 紅燈。
  - ⚠️ **不帶 cache-bust 會得到假紅燈**：舊部署（發佈 repo 根的那版）留在 CF 邊緣的物件帶 `s-maxage=604800`，命中時回 `text/markdown` 但 header 有 `CF-Cache-Status: HIT` ＋ 大 `Age`。**那是快取殘留不是外洩**，最長 7 天自癒（pages.dev 非自有 zone，dashboard 沒有 Purge Everything，收斂路徑就是等 TTL）。2026-08-01 R3 健檢實測：帶 cache-bust 的 `/AGENTS.md`、`/worker/src/index.js`、`/deploy-allow.txt` 全回 SPA fallback＝現行部署乾淨。

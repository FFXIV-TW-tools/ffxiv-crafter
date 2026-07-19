# AGENTS.md — ffxiv-crafter

FFXIV 繁中服 DoH 配方製作求解器。純靜態站 + Rust/WASM raphael 引擎（web worker），無後端。輸入配方＋角色數值 → 算最佳製作手法 → 手法序列 + 逐步走查 + 一鍵複製遊戲巨集。external 公開工具，部署 Cloudflare Pages（`ffxiv-crafter.pages.dev`），FFXIV-TW-tools portal 註冊。

**規模級別：S**（DEVLOOP §5）——單一子系統（一個求解器工具）、~1.4k 行手寫碼分佈 8 檔（app.js / app-render.js / app-solve.js / crafting-list.js / worker.js / index.html / styles.css / wasm/src/lib.rs）、單一部署目標、無後端 / cron / 多機協作 / 資料管線。**故不設 ROADMAP 分解層**（直接 Plan→Build）；設計 spec 落在外部 portal repo（見下），本 repo 工件＝`CHANGELOG.md` + `docs/BACKLOG.md` + `docs/health-reviews/`。判 S 偏 M（有 Rust/WASM 一層非顯而易見），但無跨子系統協調需求 → 維持 S。

> 設計＆決策不在本 repo：spec `external/ffxiv-tw-tools-portal/docs/specs/2026-06-22-craft-solver-spec.md`（公式 §4 對抗驗證）+ ADR-013。重建 / 部署見 `README.md`。

---

## 🔒 工具鐵則（違反必阻擋）

- **`hqPercent()` 品質%→HQ% 對照表勿改**（`app.js`）：逐格移植自 ffxiv-crafting 7.4.5 權威遊戲表（Tnze），表的斷點/缺口是遊戲真實值、**不是 bug**。改前先舉具體「品質→HQ%」反例。
- **製作公式已對抗驗證**（`computeSettings`，spec §4）：改動前先舉具體「錯誤輸入→輸出」反例，勿憑印象報「公式可能錯」。u16 無溢位、serde 對超界值**報錯而非靜默截斷**（不會產錯巨集）——勿改成 clamp 吞錯。
- **DRY — craft-actions 繁中名/icon 權威＝`game_ref.sqlite`**（monorepo `build_game_ref.py` 產）：禁自建技能對照表。`data/craft-actions.json`（`tools/build-data.py` 從 game_ref 萃取）鍵集合必 == `wasm/src/lib.rs` 的 Action 變體（現值 35=35，`tools/check-actions.py` 機械守）。
- **繁中服至上**：所有顯示一律繁體中文正名（職業名 木工/鍛造/…、技能名走 game_ref、高難度=expert）。疑慮查 Lumina `ChineseSimplified.ScName` 或灰機 wiki，不自創。
- **codex 設計系統**：button/form/token 用 portal CDN 的 `.codex-*`，勿 local 重寫；`.panel`/`.codex-tablet` 容器 padding ≥16px。改 UI/CSS 前**先 Read** `C:\FFXIVProject\external\ffxiv-tw-tools-portal\_DESIGN-SYSTEM.md`。
- **共用鐵則（monorepo 全域）**：`except: pass` 禁止（失敗至少 `console.warn`）；dict 快取一律 bounded（本工具目前無無界快取，新增時遵守）；新建原始碼檔 >500 行禁止（既有檔 >500 被實質修改時觸發拆分 review 閘門）。

---

## 🏗 架構

純靜態站，三層 + 引擎：

| 檔案 / 目錄 | 職責 |
|------|------|
| `index.html` | 靜態骨架 + `document.write` 注入 portal CDN bootstrap（tokens/header/settings）+ SEO/JSON-LD |
| `app.js` | 前端控制器（module 入口）：資料載入 / gear(localStorage) / 公式 computeSettings / 選配方 selectRecipe / 配方詳情 refreshSelectedGear / 消耗品 / 分頁 / init 接線（**454 行**（wc -l，pre-commit gate 同法），B-002＋B-007 拆分後；渲染/求解編排/配方瀏覽表已抽出，同名 proxy 委派 CraftBrowse） |
| `app-render.js` | 結果渲染層（classic script `globalThis.CraftRender`）：hqPercent(純) / render / 手法序列 chips / 走查表 / 巨集。app.js init 注入 getter 取 live 狀態（loadData 會重賦值 ITEMS/ACTIONS 綁定） |
| `app-solve.js` | 求解編排層（classic script `globalThis.CraftSolve`）：worker 生命週期 / doSolve / 求解計時 / 結果回傳分派 / 取消 / setSolving。worker·solveClock 為該層私有；渲染委派 CraftRender、公式/gear 由 app.js 注入 |
| `app-browse.js` | 配方瀏覽層（classic script `globalThis.CraftBrowse`，B-007 拆分）：職業篩選 chips renderChips / 配方表 renderTable / 已加入清單標示 markListState。私有狀態 `jobFilter`；app.js init 注入依賴（getter 取 live RINDEX/selected＋selectRecipe/toast）。app.js 以同名 proxy 沿用既有呼叫點 |
| `crafting-list.js` | 製造清單分頁：清單狀態(localStorage) / 素材彙總 `aggregateMats`（純函式，T7 golden 守）/ 分頁 render。classic script 發佈 `globalThis.CraftList`，app.js init 注入依賴（免 module 化破壞 test-formulas vm 載入） |
| `worker.js` | web worker：載 raphael WASM 跑 `solve`（只跑 solve，simulate 尚未接 UI，故無 cmd dispatch） |
| `styles.css` | 工具樣式，token 全來自 portal CDN（tokens.css / header.css） |
| `wasm/` | 自寫 Rust 薄綁定（raphael-rs v0.26.2，Apache-2.0）；`wasm-pack build --target web` → `pkg/`。公式在 JS 端算好、WASM 只跑引擎 |
| `pkg/` | wasm-pack 輸出 — **必須 commit 進 repo**（CF Pages 不編 Rust） |
| `data/` | recipes / items / ingredients / recipe_levels / craft-actions / meals / medicine JSON（`tools/build-data.py` 產，來自 monorepo item_dict + game_ref） |
| `tools/` | `build-data.py`（產 data/）、`check-actions.py`（action-set 不變量閘）、`serve.py`（本地預覽） |
| `_headers` | CF Pages 安全標頭（CSP 完整分域）+ 快取策略（.js/.css/pkg `must-revalidate` → **無 cachebust 腳本**，靠 ETag/304） |
| `docs/health-reviews/` | 永久健檢檔案庫（`project-health-review` skill 產出，豁免 docs 暫存→歸檔規則） |

**資料流**：使用者選配方 + 填角色數值 → `computeSettings`（FFXIV 公式，含食物/藥水/專家之證）→ postMessage worker → raphael `MacroSolver` → replay 逐步 → render 手法序列 + 巨集。跨工具深連結：`?recipe=<id>` / `?item=<id>`（marketboard「求解手法」鈕跳來）。

---

## ✅ VERIFY（改動後跑，未過不算完成）

> 機械閘基線 **4 項全綠**（只准升不准降；2026-07-11 R2 加 test-formulas.mjs → 29 passed；2026-07-16 加 T7 製造清單彙總 → 34 passed；2026-07-19 加 T8 marketboard URL 契約 + T9 selectRecipe 回傳 → 40 passed；2026-07-19 加 T10 清單 add/has/count + 上限誠實 → 50 passed；2026-07-19 加 T11 app-browse 瀏覽層 init/chips/table/篩選/CAP/空狀態/守衛 → 60 passed；2026-07-19 加 T12 buildShoplistCsv 送端 CSV 契約（成品 yield/合併/三上限/invalidCount/多 item 升冪排序）→ 68 passed）。

```bash
node --check app.js app-render.js app-solve.js app-browse.js crafting-list.js worker.js   # JS 語法
node tools/test-formulas.mjs           # 前端純函式 golden：computeSettings（spec §4 值）/ hqPercent 斷點 / recipeMaxes + 專家之證 CP+15 + sec A1/A2 哨兵 + T7 清單彙總 + T8 mbItem/mbCraft URL 契約 + T9 selectRecipe 回傳 + T10 清單 add/has/count/上限誠實 + T11 app-browse 瀏覽層契約 + T12 buildShoplistCsv 送端契約（68 passed）
py -3.11 tools/check-actions.py         # 不變量：craft-actions.json 鍵 == lib.rs Action 變體（現 35=35）
cd wasm && cargo test                   # 不變量：parse_action ∘ action_name round-trip + 名稱唯一（2 passed）
```

- **改 `wasm/src/lib.rs`** → 跑 `cargo test`（host target 可跑，見上）；**重建 WASM 產物**才需 nightly + wasm-pack + wasm32 target（`cd wasm && wasm-pack build --release --target web --out-dir ../pkg`），`pkg/` 要一起 commit。
- **改 `.js` / `.css`** → **無 cachebust 步驟**（不像 ranking；index.html 靜態引用無 `?v=`，`_headers` 的 `must-revalidate` 負責重驗）。
- **手動 smoke**（改 UI / render / 求解路徑後）：`py -3.11 tools/serve.py`（no-cache dev server，預設 :8809；勿用裸 `python -m http.server`——缺 no-cache 會拿到瀏覽器快取舊版）於 repo 根 → 需 **portal svc :8774** 提供 codex CDN（`svc start portal`）→ 開 `http://localhost:8809/` → 選配方 → 填角色數值 → 求解 → 複製巨集。零 console error。
- **純文件 / 規則檔改動**：pre-commit gate 過 + 目視 diff 即足。

---

## 🛠 開發注意（踩坑 / 教訓）

- **icon 一律走 xivapi v2 asset CDN**（2026-07-16）：v1 `xivapi.com/i/...` 圖庫停更、7.5 新 icon 404 → `app.js` `iconUrl()` 把 data 層 v1 路徑轉 v2 URL（權威寫法＝marketboard `modules/icon.js`）；新增 icon 出口勿再直拼 v1 網域，`_headers` CSP img-src 已鎖 `v2.xivapi.com`。
- **配方資料源＝tnze zh-CN（7.5 跟版）＋item_lookup 繁中化**（2026-07-16）：zh-TW 源停更 7.1 勿換回；重建流程＝best-craft `scripts/build-static-data.py`（刪 static-data 快取強制重爬）→ 本 repo `tools/build-data.py`。舊逐色染劑配方 200 筆是遊戲 7.5 改版移除（通用染劑 38254–38261 取代），勿當缺漏回補。
- **expert（高難度）配方靜態巨集僅供參考**：104 個 expert 配方在遊戲內為隨機製作狀態，靜態 Normal 巨集無法保證完成 → render 已加中性「試算完成 ⚠」+ 警語（**勿移除、勿改回無條件「✓ 可完成」金徽**）。
- **求解計時＝軟提示不殺 worker**（`solveClock` interval，每秒更新已耗時）：求解跑在 worker、主執行緒空閒故計數不凍結；≥60s 升級「可取消」提示但**不殺** worker（正常長求解仍在跑，UI 文案「可能數十秒」）；`stopSolveClock()` 掛在 onWorkerMsg / cancelSolve / onerror（別讓成功後計數殘留）。
- **改任一求解輸入 → 舊巨集失效**：`invalidateResults()` 集中失效，涵蓋 opt-* / 目標品質 / solve-mode / HQ 素材 / 全部 HQ 鈕 / 食藥 / 角色數值（程式設值不觸發 input 者須手動呼叫）。新增求解輸入時記得掛。
- **轉義紀律**：動態字串（配方名 / 技能名 / 引擎 error）進 innerHTML 一律 `esc()`；**icon 路徑來自 build-data 常數 / game_ref、無注入面故不 esc**（勿當 drift 誤補）。
- **求解上限單一算式**：顯示（refreshSelectedGear）與求解（computeSettings）共用 `recipeMaxes(recipe, rlv)`，勿再內聯重算（防漂移）。
- **DOH / JOB_ICON 為 local hardcode**：`jobs.json` 僅 21 戰鬥職、不含製作職 → 刻意 local，非漏 sync（是否加 AUTO-SYNC marker / 不變量＝BACKLOG B-001 待拍板）。
- **git 邊界**：commit 先知會、逐主題切；**push → CF Pages 自動部署對外可見 → STOP，由 shawn 自己跑** `!git -C external/ffxiv-crafter push`（cmd.exe，Windows Credential Manager）。

---

## 開發循環（DEVLOOP）

正典：`~/.claude/process/DEVLOOP.md`。本 repo 工件：`CHANGELOG.md`、`docs/BACKLOG.md`、`docs/health-reviews/`（健檢檔案庫）。**設計 spec 落外部 portal repo**（`external/ffxiv-tw-tools-portal/docs/specs/2026-06-22-craft-solver-spec.md` + ADR-013），本 repo 不另立 specs/。摘要（對齊 DEVLOOP v1.11；正典不可得時以此為準）：

1. 循環：Intake→Brainstorm→[Gate1 Owner 拍板 spec]→Plan→Build(TDD，適用可測行為變更；純文件走 lint/smoke)→Verify→Review→Record(changelog)→Close+Propose→[Gate2 驗收＋排序]→回 BACKLOG。
2. 小修旁路可跳 spec/plan；**Verify 與 Record 永不可跳**；資料模型／對外契約／刪除遷移／安全類**即使單檔不可旁路**。
3. 複審者能力階 ≥ 實作者；未驗證不算完成；能跑≠完成。**否定性斷言（「工具沒有 X」「抓不到」）須先窮盡落點**（資料目錄／全域 log／config／內嵌 sqlite／CLI 子命令／自帶 README），已排除的候選逐項寫進 spec 勘查段；結論不符 Owner 預期或將寫入 spec／硬編碼者，先委派 codex（實地查檔重算）＋grok（零 context 挑盲點）各驗一次再回報。**執行風險 中／高的 spec 強制雙外審閘**：Plan→Build 前、Build→Record 前各一次 codex＋grok（前閘審計畫可行性與盲點、後閘對照驗收條件核實作），結論與 triage 留痕；低風險不強制。
4. spec 放 `docs/specs/`（front-matter `status/type/cycle/date`；`draft→approved` 僅 Owner 拍板）；行文引用其他 cycle＝markdown link 指向其 spec 檔（LEDGER 自動建關聯，裸 id 不成關聯）。
5. 提案進 `docs/BACKLOG.md`（B-NNN 條目）；變更記 `CHANGELOG.md`（含為什麼）。
6. 測試基線只准升（合理下降須 Record 說明＋複審核可，不得靜默降）；教訓優先固化成測試（本 repo 先例：`check-actions.py` 不變量、`cargo test` round-trip）。
7. 不經 Owner 核可不得自主實作 backlog 項目（排序≠開工授權；Owner 標 `[go]`＝授權）。
8. 旁路（無 spec）cycle id＝`YYYY-MM-DD-<BACKLOG 編號>`，供 CHANGELOG 段標題／BACKLOG 完成式共用。
9. 除錯先根因：動手修 bug 前必先根因調查；一次一假設；同 bug 修 2 次不過升能力階、3 次不過停手質疑架構回 Owner。
10. 查歷史脈絡：先讀 `docs/LEDGER.md`（若有；生成檔勿手改）挑 cycle，**依決策實作前必開該 cycle spec 全文**並檢查更新的相關 cycle。

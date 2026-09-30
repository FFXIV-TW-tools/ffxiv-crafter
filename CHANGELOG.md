# CHANGELOG — ffxiv-crafter

> 記 root 級 / 跨檔改動與「為什麼」。日常配方資料重建（`build-data.py` 產 data/）不入此檔。格式：新的在上。

> 歷史：2026 年更早段落（2026-08-26 以前）見 [CHANGELOG-2026.md](CHANGELOG-2026.md)

## 2026-09-30 — 全方面健檢與不須拍板項直接修復（cycle: 2026-09-30-health-review）

- **改動**：修正留白品質目標警語、任務共享產量、選配資料阻擋首載、鍵盤焦點與配方按鈕語意；資料生成改先 staging 完整成功再發布；WASM 戳記補 manifest／腳本 hash，旗標改 encoded 傳遞並還原環境。同步能力不足提示、CARGO_HOME 授權來源、12px fallback、死接線及現役文件 drift。
- **理由**：只修本輪查證且不涉及政策／安全決策的缺陷，保留資料來源、引擎版本、保存 schema、對外 API 與部署邊界。
- **影響**：8須修改＋8建議項完成，3須修改與4可選項待Owner。測試刪3條無效斷言、加3條共享產量行為斷言，仍557；API／部署2/2、35Action、Rust6/6。真重建pkg hash不變，沿用09-29差分與JS golden；實際UI與隔離生成／建置驗收通過。未commit／push／部署或刷新正式資料；[報告與證據](docs/health-reviews/2026-09-30-全方面健檢-health-review.md)。

## 2026-09-29 — 引擎崩潰自動重建 worker＋不支援 SIMD 時明講（cycle: 2026-09-29-worker-recovery）

- **改動**：`worker.js` 把引擎 trap（`WebAssembly.RuntimeError`）回報為 `kind:'crash'`，`app-solve.js` 收到就換新 worker 並提示已重置；載入前先用 43 bytes 的 SIMD 模組探測，不支援就回報 `NO_WASM_SIMD`，畫面明講瀏覽器太舊與最低版本、不給重試鈕。
- **理由**：記憶體用盡那種 trap 之後同一個引擎每次都失敗，原本只叫玩家「調整設定」直到重新整理；不支援 SIMD 原本被說成網路問題。
- **影響**：一般求解失敗不重建 worker。T66 +7（550 → 557），換回舊 `app-solve.js` 時 6 條轉紅；瀏覽器實測 trap 與 `NO_WASM_SIMD` 兩路都正確回報。刪除 `tmp/solver-lab/`（Owner 授權）。

## 2026-09-29 — raphael 升 v0.28.6＋開 WebAssembly SIMD（cycle: 2026-09-29-raphael-v0286-simd）

- **改動**：`wasm/` 與 `tools/sim-diff/` 升 v0.28.6（綁定在輸出邊界把 u16 轉 u32，JS 契約不變）；`build-wasm.ps1` 加 `+simd128` 並驗產物；`build-notices.py` 改從 `Cargo.lock` 取 raphael 版本與 checkout，授權清單重產（41 → 46 套件）。神速技巧耐久繞過保留，raphael 原始碼未修改。
- **理由**：B-019 以單題單次（300／346 ms，差距在雜訊內）判「沒變快」；重量 31 情境：小題持平、重題 1.04–3.4 倍、極端 4–7 倍，舊版遇重型專家配方會記憶體滿 4 GB 崩潰。
- **影響**：WASM brotli 83.4 → 92.1 KB；瀏覽器需 Chrome 91／Firefox 89／Safari 16.4。差分閘、js-golden、canonicalTest 全綠。明細見[驗證紀錄](docs/verification/2026-09-29-raphael-v0286-simd.md)。

## 2026-09-28 — 整站改版（對齊 portal v2.0）

- **改動**：配方求解、角色數值、職業任務、製造清單四個分頁與 404 頁改用 portal v2.0 的共用元件（圖示、步驟軸、KPI、空狀態、頁籤計數）；配方搜尋加 `/` 聚焦與 Escape，求解結果可一鍵複製摘要。同輪依 Owner 指示精簡測試 16 項（563 → 550）。
- **理由**：統一各頁的視覺層級，讓流程下一步、數字摘要與空狀態更容易辨識。
- **影響**：不改製作公式、資料來源、CSV 格式、localStorage key 或跨工具同步；API／部署 2/2；窄屏 CLS 掃描最差 0.0376。明細見[驗證紀錄](docs/verification/2026-09-28-portal-v2-redesign.md)。

## 2026-09-22 — 全頁健檢與直接修復（cycle: 2026-09-22-health-review）

- **改動**：修正窄屏溢出、鍵盤焦點、裝備輸入、食品失載顯示、Worker 重試、後續製作篩選與未知技能拒絕；資料建置先驗證再寫入，失敗保留既有輸出。
- **理由**：消除已重現的錯誤狀態與靜默資料損失，不變更遊戲公式、資料來源政策或跨站信任邊界。
- **影響**：公式／前端測試 556→562（新增 7 項行為斷言、移除 1 項函式存在性斷言），API／部署 2/2，Rust 5→6（靜態斷言點 17→19，以 pre-commit gate 實測為準）；WASM 通過差分閘。後續依 Owner 決策更新名稱，保留未知任務數量與集中更新；minify 非測試用途，維持停用。證據見[完整報告](docs/health-reviews/2026-09-22-全頁健檢-health-review.md)。

## 2026-09-13 — 移除無條件成功計數

- `51-nextcraft.test.mjs` 刪除 `check(true)` 摘要；鏈深度、選取與按鈕契約的實際斷言保留。
- PowerShell：`node tools/test-formulas.mjs` 實跑 **556 passed／0 failed**（557→556）；未改其他測試入口。

## 2026-09-12 — 稽核低價值測試精準摘除

依逐段稽核判準刪除 TAUTOLOGICAL／IMPL-COUPLED 原始碼文字掃描、PADDING 與 SELF-REFERENTIAL 測試；完整移除 `tests/first-run-hint-key.test.mjs`、`tests/hooks-installed.test.mjs`、`tests/select-width-reserve.test.mjs`，並從公式／gear／browse／solve／flow／stages／UI／repo sentinel 主題移除對應 source-only 段落。保留公式 golden、實際 VM 行為、資料不變量，以及 `_headers`、部署輸出與授權清單等跨部署面哨兵。

- `test-formulas` 基線 **684 → 557 passed**（0 failed）。
- `tests/run-all` 基線 **5 → 2 測試檔**（2/2 通過）；同步降低 runner 檔數下限。

## 2026-09-08 — 凍結配方資料的建置自 best-craft 接手（monorepo B-083 ⑧ / B-073 前置）

`tools/build_lib/common.py` 的 `STATIC_SRC` 原本指著 `ffxiv-best-craft-main/public/static-data`，
recipes／recipe_levels／ingredients／meals／medicine 五支都是從那裡複製進 `data/`。**best-craft 整個
退場（monorepo B-073）後這條依賴會斷**，而斷掉的樣子是「`build-data.py` 報缺件 exit 1」——不會靜默，
但也就完全重建不了資料。故把產生端與快照都搬進本 repo：

- `tools/build-static-data.py`（自 best-craft `scripts/` 接手）＋ `tools/static-data/` 8 支 JSON（6.8 MB，
  **tracked**）。快照 tracked 而非 gitignore：上游是外部服務 tnze，`cached_json` 的設計本來就是「產出過就
  重用」，不進 git 等於把資料源託付給一台隨時會 404 的機器。`tools/` 整個在 `deploy-deny.txt` 內，不會出貨。
- 接手只改路徑（輸出改本 repo、monorepo 根與快照位置一律取自 `build_lib/common.py`，產生端與消費端共用
  同一個常數）與兩處 `except: pass` 窄化；演算法逐行沿用。**證據**：同一份快取下，本 repo 的腳本與 best-craft
  原版跑出來的 8 支 JSON **逐 byte 相同**；`data/*.json` 重建後零 diff。
- ⚠️ 重跑不是冪等的：步驟⑦ 會拿**當下**的 `item_lookup.name_tc` 重寫顯示名。實測相對 2026-07-29 那份快照已
  漂 169 個配方名／175 個物品名（monorepo 端修正了繁中名）。要不要吃這批更名是資料決策，不能當「重跑一下」
  順手做掉——本次刻意保留原快照。

## 2026-09-06 — 健檢 R5 待拍板七條全數落地（B-032〜B-038）＋三檔拆分

Owner 2026-09-05 逐條「按建議」拍板，本輪逐題各自一個 commit（細節見 `docs/health-reviews/2026-09-05-R5全維健檢-fix-plan.md` 執行結果表）：
- **B-032** 刪 `craftPlan` 死碼（鑽石依賴會重複計數）與守它的 T51；新增 **T64**：每支分層模組匯出的名字都要有生產端呼叫點——「看起來被驗證過的假護欄」比沒有更糟。
- **B-036** 一物多配方**同職多張**（136 組）：同職取難度最低、數值與原料全同的重複列去重、鈕面帶第一個有差異的數字（都同就編號＋data-help 列原料）；深連結改走同一份挑法（smoke 抓到它自刻一條而漂開）。
- **B-038** 引擎工具鏈釘 `nightly-2026-06-22`，BUILD-STAMP 記實際 rustc／wasm-pack，check-actions 對帳 channel；真實重建 pkg hash 不變。
- **B-037** monorepo gate 6 `--staged` 改由 TEST-BASELINE 反推監看路徑（「宣告什麼，監看什麼」）、gate 3 補 `.mjs`；本 repo 加 `tests/hooks-installed.test.mjs`（新 clone 零閘門從靜默變成 safe-push 前明確失敗）與 `tests/deploy-prepare.test.mjs`（部署腳本本機先跑一次）。
- **B-034** 三檔過 500 行閘門全拆：`app.js` → `app-formula.js`／`app-data.js`；`tools/build-data.py` → `tools/build_lib/`（輸出逐 byte 相同）；`styles.css` → `styles/10-base…50-tabs`（389 條規則集合相等、層疊順序＝檔名序）。**每一支都 <500 行、測試數不降、瀏覽器 smoke 選配方→求解→巨集全過。**
- **B-033** AGENTS.md 38,974 → 30,895 B：有測試守的條目降成一行＋編號、9 段敘事搬 `docs/lessons.md`；新增 **T65** 位元組哨兵（≤ 豁免當時的 31,248，超過＝搬敘事不是改數字），讓「已豁免」與「超出豁免當時的值」在機械上可分辨。
- **B-039**（gate 3 補 `.mjs` 後首次對 3290 行的 `tools/test-formulas.mjs` 亮紅線，Owner 同日拍板）：入口檔名不變、改成掃 `tools/tests/` 依檔名序跑；共用底座 `_harness.mjs`＋13 支主題檔（最大 351 行）。斷言集合 diff 為空、零順序依賴。

## 2026-09-05 — 舊網址交接機制退役（Bulk Redirects 取代 middleware 301）

舊 `*.pages.dev` host 的 301 改由 Cloudflare **帳號層 Bulk Redirects** 在邊緣執行 ⇒ 本 repo 的
`functions/_middleware.js`、HTML `<head>` 第一支 inline 交接腳本、`?stay` 資料救援門全部成了永遠跑不到的死碼，
整套移除（救援期已逾一個月，Owner 裁示結束）。`_routes.json` 的 include 只留 API 代理路徑：**每條 include 都是
一個計費攔截面**，HTML 路徑改回純靜態就不再吃 Pages Functions（帳號級免費硬牆 100k/日，2026-08-28 撞過）。
受檢對象沒了的 `tests/handoff.test.mjs` 與 `tests/route-manifest.json` 一併刪除——留著就是「全綠但守著死碼」的閘。

## 2026-09-05 — 健檢 R5 批次 0：三支說謊的哨兵 ＋ 五條「畫面對玩家說反話」的缺陷（cycle 2026-09-05-R5）

12 維健檢（報告與計畫見 `docs/health-reviews/2026-09-05-R5全維健檢-*.md`）。本筆是 16 項不需拍板的修復；
待拍板七條入 BACKLOG B-032〜B-038。測試 654 → **683**，每條新哨兵都做過「把缺陷放回去必須轉紅」的突變驗證。

**說謊的哨兵**
- `tests/first-run-hint-key.test.mjs:47`：`/(defer|async)/` 裡兩個 `` 是字面 backspace（0x08）⇒ 改成 `defer` 照樣綠。
  修回真 ``；它守的是載入期 CLS 從 0.0005 退回 0.094 那一發。
- `check-actions.py` 印「pkg/ 與 wasm/src 同步」但 `BUILD-STAMP.json` 一個位元組都沒雜湊 `pkg/`：
  戳記補 `pkg_wasm`／`pkg_js`（`build-wasm.ps1` 寫、`check-actions.py` 驗），並直接掃產物 bytes 有無帳號路徑
  （只認 `Users\`——remap 後的 `~\.cargo
egistry` 是合法殘留）。
- `tests/run-all.mjs` 0 個檔也印「0/0 通過」並 exit 0：補檔數下限 4 ＋ `TEST-BASELINE` 標記；AGENTS.md 散文
  那份基線數字（停在 653）整段拿掉，宣告值只留標記一處。

**對玩家說反話**
- 改食物／藥水後「最低能力要求」紅字與求解鈕不刷新（吃了藥已達標仍寫「還差 380」）：需求列抽成 `#recipe-req`
  由 `refreshGearNote` 就地更新——**不是**改叫 `refreshSelectedGear`（那會清 HQ 素材與目標品質）。T62 守。
- `meals.json`／`medicine.json` 一次網路抖動就把玩家保存的食藥偏好清空：載入失敗回 `null`（維持上一份），
  `[]` 才是「品項下架」。T15／T41 守。
- `opt-adversarial` 在 expert 配方被強制取消後，存檔被寫成 false、離開 expert 也不還原：偏好記錄一般化為
  `optWanted`（全部 `SOLVE_OPT_IDS`，不逐 id 列舉），`app-recipe` 離開 expert 時 `restoreOpt`。T43 擴充守。
- `isCrystal` 名稱正則把「紫水晶手鐲」「水晶燈」等 55 筆判成晶體 ⇒ 製造清單分錯組、「加進清單」被吃掉：
  改用 `items.json` 的 `category === '水晶'`。T48／T63 守。
- 首次提示的「前往角色數值 →」在 `await loadData()` 前是死鈕、面板全空：綁定與 `renderGearsets()` 移到 await 前
  （前輪 T42 修的是分頁鈕、漏了這顆）。T42 擴充守。
- `AbortSignal.timeout` 無 feature detect ⇒ 舊 Safari／WebView 整站死在 fetch 之前：退回無逾時。T63 守。

**授權與部署面**
- `THIRD-PARTY-NOTICES.md` 一直在 `deploy-deny.txt`，線上 404，而被服務的 `LICENSE-MIT.txt:4` 正指向它；
  README 寫的前提「本 repo 未公開」早已不成立。改名 **`LICENSE-THIRD-PARTY.txt`**——命中 `deploy-prepare.sh`
  既有的 `LICENSE*.txt` 例外，12 repo 共用腳本零改動；頁尾補 MIT 與第三方宣告連結。T63 守。
- `.deploy-filelist.tmp` 沒進 `.gitignore` ⇒ 非正常結束後每次 build 撞分類閘，且訊息叫人加進 allow：補 `.gitignore`
  一行（走腳本既有的 `git check-ignore` 分支）。

**其餘**：`consumersOf` 把配方數當職業數（＋N 職）／T20・T32 ratchet 門檻對齊宣告值（不留 68 筆靜默縮水空間）
／T36 中性面板清單改由 markup 反推＋涵蓋率閘／`.rt-patch` 補 `data-label="版本"`（T11 改五欄對帳）
／`v2.xivapi.com` 補 preconnect（不帶 crossorigin）／AGENTS.md：`hqPercent` 指標改 `app-render.js`、架構表補
`first-run-hint.js`／`404.html`／`tests/`、VERIFY 註解 T57→T62／`docs/lessons.md` 交接頁段標題改成與內文一致。

## 2026-09-02 — 舊網址 `*.pages.dev` 改回 HTTP 301（Google 一個月來把舊網址當本尊）

Owner 搜尋「ff14 成績單」看到的仍是 `pages.dev`、站名顯示「Cloudflare」。GSC 實查：舊 host 今天才被抓、
擷取成功、允許索引，**「Google 所選的標準網址＝受檢測網址」**——`canonical` 指向新網址被否決。
根因＝B-061（2026-08-04）為省 Functions 額度把交接改成 inline JS 跳轉後，舊 host 對爬蟲回 **200 ＋ 整頁內容**；
真人會被 JS 跳走，Googlebot 不會。canonical 是建議、301 才是指令。

- `functions/_middleware.js`：舊 host 的 HTML 導覽請求回 **301** 到新網址同路徑（GET＋Accept text/html＋
  hostname 全等＋無 `?stay` 四條件不變；`Cache-Control: no-store` 保留可回滾）。`?stay` 資料救援門照舊。
- `_routes.json`：可導覽 HTML 路徑列回 include（＝manifest `paths`）。代價＝新網域這些路徑每次開頁一次
  Functions 呼叫；2026-08-28 撞上限的幽靈 `/settings-api` 已修，不是同一個量級。
- 已知代價：還沒來過新站的舊書籤使用者不再自動帶雲端 UUID（到設定面板貼上即可）；inline 交接腳本保留為退路。
- `tests/handoff.test.mjs` ③–⑤ 改斷言 301／Location／no body／CRLF。13 站同步；跨 repo 一致性哨兵全綠。
- 上線後：GSC 對舊 host property 跑「網址變更」，讓 Google 整批搬訊號。
- 續：GSC「網址變更」驗證器抓首頁**不帶 `Accept: text/html`**，回報「找不到重新導向」⇒ 拿掉 Accept 條件、HEAD 也攔。資產早被 `_routes.json` 只列 HTML 路徑擋在 Function 外，該條件已無作用。

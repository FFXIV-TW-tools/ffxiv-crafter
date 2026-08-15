# BACKLOG — ffxiv-crafter

> 提案清單（B-NNN，append-only 編號）。**不經 Owner 核可不得自主實作**。來源標註便於回溯。
> 完成打勾保留原句、尾巴追加 `✓ 完成於 cycle <id>`；否決用刪除線並留一行原因。格式見 DEVLOOP §4.2（四軸快篩）。
> 歷史：已結案（含否決）的條目見 [BACKLOG-archive.md](BACKLOG-archive.md)（DEVLOOP §4.5 第二觸發：主檔 >40KB）——
> 純搬移、原文一字未改，本檔只保留待辦與待拍板。

- [ ] **B-023** (P2, data) 【建議 中｜延遲風險 低｜執行風險 低｜副作用 無】職業任務「交付數量」剩 62 件未知 — 數量來自社群試算表、以 item id 對帳（`name_tc`／`name_sc`／OpenCC t2s 後查 `name_sc`），現況 228/290 對到。剩下的多數是**真差異**：60 級以上任務要交「XX的材料」，試算表列的是成品「高級XX」＝另一個 item id，id 對帳正確拒絕。**要補只能找到真正的權威欄位**（解包 `Quest.CountableNum` 是 255 哨兵值、`ToDo*` 沒有數量欄），或請 Owner 逐筆補一份覆寫表。**不得改用字面模糊比對**——猜錯會讓採購量整批偏掉而畫面全正常。來源: 2026-08-09 職業任務分頁

- [ ] ~~**B-021** (P2, perf) 開頁資料改 lazy load + IndexedDB（抄 bis `app-core.js:419`）~~ — **否決 2026-08-05，前提是測錯的**。提案時說「開頁併發抓 7.3MB」，但那是 `decodedBodySize`＝**解壓後供解析的量**，不是下載量。CF 有 brotli，實測線上實際傳輸：`recipes.json` 4180KB→**196KB**、`items.json` 2190KB→**312KB**、`ingredients.json` 680KB→**99KB**，合計 ~607KB 且三支在同一輪 `Promise.all` 平行；主執行緒 `JSON.parse` 實測 **7 / 4 / 7 ＝ 18ms**。整頁 DCL 683ms、load 795ms、總傳輸 621KB。⇒ 抄 bis 那套等於為「最多一兩百毫秒的冷啟動下載」加一整套 IDB 快取＋失效＋版本比對，加在一個運作正常的載入路徑上，不划算。**唯一勉強成立的殘餘是 `ingredients.json`（99KB，只有開配方看 BOM 才需要）純延後、免 IDB——99KB 與 7ms，同樣不值得動。** ⚠️ 給後人：量頻寬要看 `transferSize` 或 `curl --compressed`，`decodedBodySize` 會讓這裡看起來大 12 倍。相關跨站盤點＝portal B-065。來源: 2026-08-05 跨站效能盤點

- [ ] ~~**B-022** (P3, perf) 加 `<link rel="modulepreload">` 展平 module 瀑布（同 market B-081 / cosmic B-025 / sightseeing B-002）~~ — **否決 2026-08-05：本站沒有 module 瀑布可展平**。實地跑生成器產出 **0 條**：前端入口 `app.js` 雖是 `type="module"` 但**零相對 import**，10 支相依（`app-flow`／`app-gear`／`app-recipe`…）全走 classic `<script>` 全域載入。先前 grep 到的 7 支 ES module 檔全在後端（`functions/`／`worker.js`／`pkg/crafter_wasm.js`）。已把試作的生成器與哨兵撤回，不留無作用的機械。

### 健檢 2026-08-01 須修改項（B-009〜B-016）

✅ **12 項全數完成**（2026-08-01〜08-02）。條目與修法記錄搬到 [`BACKLOG-archive.md`](BACKLOG-archive.md)；
本輪（2026-08-15）已逐一確認無回歸，fate 見該輪報告「前輪追蹤」。

### 差分審計 2026-08-03（B-017〜B-020）

✅ **全數結案**（神速技巧耐久補償／群星穩定自造譯名／raphael 升版評估「先不升」／sim-diff 差分閘收進 repo）。
條目搬到 [`BACKLOG-archive.md`](BACKLOG-archive.md)。

### 健檢 2026-08-15（[報告](health-reviews/2026-08-15-全維健檢-health-review.md)／[計畫](health-reviews/2026-08-15-全維健檢-fix-plan.md)）

> 批次 0 的 12 項**已於健檢當輪直接修完**（零拍板需求：行為缺陷／測試缺口／文件 drift；測試 334 → **385 passed**，
> 每項先寫會紅的測試、再修、再突變驗證，另跑瀏覽器實測）。明細見 `CHANGELOG.md` 2026-08-15 段與報告「本輪已修」。
> 以下是**需要 Owner 拍板或需要先量測**的部分，**未標 `[go]` 不得開工**。

- [ ] **B-025** (P2, docs) 【建議 高｜延遲風險 低｜執行風險 低｜副作用 無】**`AGENTS.md` 瘦身 — 40,273 bytes ＝ DEVLOOP R7 護欄的 2 倍，且每 session 全文注入**。其中單行 5.5KB 是逐輪測試流水帳（30 餘輪「→ N passed」）。2026-08-03 搬過一次只減 3.4KB、從未達標，之後又漲 29%。**⚠ 拍板搬哪些**：(A 建議) 搬走流水帳＋三段已結案的長篇踩坑敘事 → 目標 <20KB／(B) 只搬流水帳（仍超標）／(C) 申請護欄例外。留下的一律是「還會被拿來做決定」的規則＋指標（本檔已有「→ 敘事見 docs/lessons.md」慣例）。來源: 健檢 2026-08-15（docs-drift A3）

- [ ] **B-026** (P1, build) 【建議 高｜延遲風險 中｜執行風險 低｜副作用 跨 repo（fleet.json 或 monorepo hook）】**`check-actions.py` 沒有任何自動入口會跑到**。它守三個不變量（35 Action 變體／`pkg/`↔`lib.rs` BUILD-STAMP 同步／sim-diff 與 wasm 釘同一 raphael tag），但 `canonicalTest` 只有 `test-formulas` + `run-all`，monorepo pre-commit 也沒有它 ⇒ 改引擎、忘記重編、safe-push 全綠、**線上跑舊 WASM**——而 BUILD-STAMP（B-013）當初就是為了防這件事做的。**⚠ 拍板修法**：(A 建議) 加進 `canonicalTest`（改 `process/fleet.json` 一行，每次推多約 1 秒；換機缺 `py -3.11` 會以「推不出去」明確失敗）／(B) monorepo pre-commit 的條件式 gate／(C) 維持紀律（＝本 finding 本身）。來源: 健檢 2026-08-15（build-release A1＝tests A5）

- [ ] **B-027** (P3, design-system) 【建議 中｜延遲風險 低｜執行風險 中（動表格版面要看畫面）｜副作用 跨 repo】**設計系統三項延續債**：(a) `.result-summary`／`.consumables` 幾何與 2026-08-13 已遷的三個容器完全同形，卻仍本地宣告 background/border/border-radius＝該次遷移的直接遺漏（成本最低、零視覺變化）(b) `.crafter-qt-tag` 家族把 `.codex-badge` 重刻一次（同 repo 別處已在正確消費它）(c) 三張表（`.rt`／`.wt-table`／`.gear-table`）仍手刻未消費 `.codex-table`，且 `.rt` 重現了 portal 已修掉的 sticky+`border-collapse` 坑（前輪已列建議未做）。**⚠ 拍板範圍**：(A 建議) 只做 (a)／(B) (a)+(b)／(C) 全做。來源: 健檢 2026-08-15（design-system A1/A2/A3）

- [ ] **B-028** (P3, sec) 【建議 中｜延遲風險 低｜執行風險 低｜副作用 跨 repo（13 站同型代理）】**settings-api 代理收窄**：(a) 無路徑白名單 —— `/settings-api/<任意路徑>` 一律轉到上游根路徑 ⇒ 本站原點也是 `/feedback`／`/announcements`／`/settings/*` 的入口，即使本站只用得到 `/u/*` 與 `/health` (b) 無條件覆寫 `Origin` ⇒ 上游 `/feedback` 的第一道閘（Origin 白名單）經過本代理時**永遠不會觸發**；原註解要解的是「同源請求瀏覽器不帶 Origin」，改成「缺席才補」即可完全達成目的並把那道閘還回去。**今天不可利用**（真正的 capability 是 UUID，第二道 `application/json` 閘仍在），但這支是 13 站樣板來源，改不改要一次決定。**⚠ 拍板**：(A 建議) 兩項都做並同步回其他站／(B) 只做 Origin（一行、零風險）／(C) 不做。來源: 健檢 2026-08-15（sec A2）

- [ ] **B-029** (P3, ux) 【建議 中｜延遲風險 低｜執行風險 **高（前輪同型問題退回兩次）**｜副作用 無】**職業任務交付物列的窄屏溢出**。`.crafter-qt-item` 單列 flex 塞 icon＋品名＋HQ＋數量＋複製鈕＋徽章×2＋動作鈕；reviewer 判「手機必然溢出」，verifier 標 **partial（靜態推斷、未實測）**。**⚠ 第一步是量測不是改 CSS**：B-011(c) 就是照著「800–1018px 會溢出」這個錯誤前提動工，把右溢出換成左溢出又打壞兩個原本正常的寬度，退回兩次。照 AGENTS「開發注意」的手法（同源 iframe 定寬 1400/1018/900/800/430/390/360）量完再決定。來源: 健檢 2026-08-15（ux-flows A3）

- [ ] **B-030** (P3, test) 【建議 中｜延遲風險 低｜執行風險 低｜副作用 無】**資料管線的不變量缺口三項**：(a) 交付數量的對帳命中率**沒有 ratchet**，退步時零訊號（同檔的 vendors／hq 都有，唯獨 qty 沒有）(b) 食藥補 icon 以繁中名對帳且 fail-open（查無就寫 None、不失敗），且完全沒有資料不變量測試 (c) `data/quality-stages.json` 無資料不變量 ⇒ `build-data.py` 若輸出新來源，`toQuality` 靜默回 0（「未知來源不猜換算」那條防線會變成靜默少一檔）。另 `build-data.py` 對缺上游輸入 fail-open（印 ⚠ 後續跑、exit 0），屬前輪延續項。來源: 健檢 2026-08-15（correctness-data A2/A3、tests A7、build-release A3）

- [ ] **B-031** (P3, sec) 【建議 低｜延遲風險 低｜執行風險 中（跨 13 站 CSP 範本）｜副作用 跨 repo】**CSP `unsafe-inline` 的殘餘價值只有「哨兵」那一半**。移除 `unsafe-inline`（改用 index.html 三段 inline script 的 sha256，由 `deploy-prepare.sh` 產生）是**已拍板取捨的再提案**（2026-07-11／2026-08-01 兩輪都判過重報），本輪 verifier 亦降為 low：沒有提出新的可利用路徑。**唯一有增量價值的部分**＝加一支哨兵擋「新增第 4 段 inline script」，避免 `unsafe-inline` 的實際依賴面無聲擴大。要做就只做哨兵那一項；CSP 本體屬 portal 生態決策。來源: 健檢 2026-08-15（sec A1，partial）

## 已完成（保留紀錄）

- 健檢 2026-07-04 須修改項 0-1、0-3、0-4、1-1、1-2、1-3、2-1、3-1、3-2 + 建議 SEC-01/02/03、RES-01/02/03/04/05/06、a11y-02/03/04/05、ux-3/5/6、perf-ux-01/02/03/04、CQ-01/02/05、DATA-1 + 0-2 → 見 `CHANGELOG.md` 2026-07-04 / 2026-07-11 兩段。
- R2 複檢 2026-07-11 須修改 M1（專家之證 CP+15）+ 建議全批（quality A1＝B-004 done／sec A1·A2／docs A1·A2／UX A1·A2·A3）→ 見 `CHANGELOG.md` 2026-07-11 R2 段（`d70d590`／`a6ab096`）。

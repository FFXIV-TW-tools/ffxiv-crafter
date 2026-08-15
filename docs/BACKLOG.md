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

- [x] **B-025** (P2, docs) 【建議 高｜延遲風險 低｜執行風險 低｜副作用 無】**`AGENTS.md` 瘦身 — 40,273 bytes ＝ DEVLOOP R7 護欄的 2 倍，且每 session 全文注入**。其中單行 5.5KB 是逐輪測試流水帳（30 餘輪「→ N passed」）。2026-08-03 搬過一次只減 3.4KB、從未達標，之後又漲 29%。**⚠ 拍板搬哪些**：(A 建議) 搬走流水帳＋三段已結案的長篇踩坑敘事 → 目標 <20KB／(B) 只搬流水帳（仍超標）／(C) 申請護欄例外。留下的一律是「還會被拿來做決定」的規則＋指標（本檔已有「→ 敘事見 docs/lessons.md」慣例）。來源: 健檢 2026-08-15（docs-drift A3）
  - **✅ 已完成 2026-08-15（Owner：移）——但**沒有**達到 <20KB，43.2KB → **30.6KB**（−29%）**：搬走逐輪測試流水帳
    （→ `docs/test-baseline-history.md`，帶歸檔檔頭／分年段／`.rgignore`）、職業任務的 HQ 與商人推導證據（→ `docs/lessons.md`）、
    sim-diff 的長篇說明（→ 同上），並把**架構表壓成一句話職責 + 指向檔頭**（9.9KB→6.0KB）。
    架構表那一項的理由不是省 byte 而是 **DRY**：檔頭註解本來就更完整，那張表是第二份事實源，
    而本輪正好抓到它漂移兩次（`app.js` 行數、`.crafter-qt-list` 類名）外加 `functions/` 整列漏列。
    **停在 30.6KB 的原因**：剩下的 `工具鐵則`＋`開發注意` 逐條看過都是可執行規則，再砍就是 R7 自己警告的
    「為壓 byte 刪有效規則」。**要繼續降需 Owner 再拍一次**：(a) 把已有機械測試守的條目降成一行＋測試編號
    （風險：測試擋回歸、擋不住一開始就寫錯）(b) 依 R7 既有出口申請本 repo 豁免。
  - **第二輪 2026-08-16（Owner：請降，看合理性判搬移或移除）——36.1KB → 28.3KB（−22%）**，
    照 R7 規定的順序做、**沒有刪任何有效規則**：**移除**第二事實源（規模段的 15 個檔名清單／
    架構表與檔頭註解重複的敘述／「先 Read `_DESIGN-SYSTEM.md`」與中性容器規則的重複段）；
    **搬移**敘事到 `docs/lessons.md`（canonicalTest 合併理由／交接頁測試為何不併 runner／
    為何不能跑裸 `wasm-pack`／巨集提示音的由來）；有測試守的條目改成「規則一行 + 測試編號」。
  - **⚠ 仍超標 8.3KB，剩下的兩個選項都需要 Owner 拍板**（我不自決，兩者都跨出本 repo 或違反 R7 自身警告）：
    - **(A) 把「部署面鐵則」段（3.8KB）移出 AGENTS.md** → 各 repo `docs/deploy-boundary.md`，AGENTS 留一行指標。
      實測 **13 個 external repo 的 AGENTS.md 全部內嵌這一段**且明文寫「本段為共用權威版本，改請同步全部副本」
      ⇒ 只改本 repo 就是讓它與另外 12 份分岔，**這是 13 repo 的一致決定，不該單邊做**。
      做了之後約 24.5KB，仍未達標。
    - **(B) 依 R7 既有出口申請本 repo 豁免**並記一行依據。
    - 不建議的第三條：再砍 4.5KB 的現行規則。剩下的每一條都是可執行規則，R7 自己寫著
      「為壓 byte 刪有效紅線＝優化錯指標，比超線更糟」。
  - **✅ 結案 2026-08-16（Owner 選 B：申請豁免）**：AGENTS.md 開頭加
    `R7-exempt: 2026-11-16 依據：…`（格式＝`residency-governance.md` §1.5；三個月，比照白名單衛生
    「最長 3 個月後 review」）。實跑正典的 `parseR7Exempt()` 驗過：今天 `expired:false`、
    2026-11-17 起 `expired:true`。
    ⚠ **豁免只免掉「連續 2 個月稽核超標升級成違規」那一段，不會讓 `⚠ R7 …` 警示行消失**
    （那行走 `warningsOf`，刻意不受豁免影響）——護欄維持可見是刻意的，看到它不等於漏做。
    到期時的重評判準已寫進戳裡：屆時若「部署面鐵則」段已在艦隊層集中化，本豁免即應撤銷。


- [x] **B-026** (P1, build) 【建議 高｜延遲風險 中｜執行風險 低｜副作用 跨 repo（fleet.json 或 monorepo hook）】**`check-actions.py` 沒有任何自動入口會跑到**。它守三個不變量（35 Action 變體／`pkg/`↔`lib.rs` BUILD-STAMP 同步／sim-diff 與 wasm 釘同一 raphael tag），但 `canonicalTest` 只有 `test-formulas` + `run-all`，monorepo pre-commit 也沒有它 ⇒ 改引擎、忘記重編、safe-push 全綠、**線上跑舊 WASM**——而 BUILD-STAMP（B-013）當初就是為了防這件事做的。**⚠ 拍板修法**：(A 建議) 加進 `canonicalTest`（改 `process/fleet.json` 一行，每次推多約 1 秒；換機缺 `py -3.11` 會以「推不出去」明確失敗）／(B) monorepo pre-commit 的條件式 gate／(C) 維持紀律（＝本 finding 本身）。來源: 健檢 2026-08-15（build-release A1＝tests A5）
  - **✅ 已完成 2026-08-15（Owner 選 A）**：`process/fleet.json` 的 `canonicalTest` 加上 `&& py -3.11 tools/check-actions.py`，
    `AGENTS.md` 的逐字對照行同步更新並註明代價（每次推多約 1 秒；換機缺 `py -3.11` 會以「推不出去」明確失敗）。三段實跑全綠。
    ⚠️ `fleet.json` 住在 **claude-skills repo**（`~/.claude/process` 連結過去），那份改動要在該 repo 另外 commit／push。

- [x] **B-027** (P3, design-system) 【建議 中｜延遲風險 低｜執行風險 中（動表格版面要看畫面）｜副作用 跨 repo】**設計系統三項延續債**：(a) `.result-summary`／`.consumables` 幾何與 2026-08-13 已遷的三個容器完全同形，卻仍本地宣告 background/border/border-radius＝該次遷移的直接遺漏（成本最低、零視覺變化）(b) `.crafter-qt-tag` 家族把 `.codex-badge` 重刻一次（同 repo 別處已在正確消費它）(c) 三張表（`.rt`／`.wt-table`／`.gear-table`）仍手刻未消費 `.codex-table`，且 `.rt` 重現了 portal 已修掉的 sticky+`border-collapse` 坑（前輪已列建議未做）。**⚠ 拍板範圍**：(A 建議) 只做 (a)／(B) (a)+(b)／(C) 全做。來源: 健檢 2026-08-15（design-system A1/A2/A3）
  - **部分完成 2026-08-15（Owner：A 先修）**：`.result-summary` 已遷共用中性面板——它與共用版幾何逐項相同，
    瀏覽器實測 computed style（`rgb(3,6,12)`／`1px solid rgb(43,63,86)`／`8px`／`12px`）**與遷移前完全一致，零視覺變化**。
    **但 `.consumables` 沒遷、也不該算遺漏**：它是 6px（`--radius-sm`）不是共用版的 8px，巢狀在 `.cfg-card`（8px）裡
    用小一級圓角是合理的設計選擇；遷過去＝視覺會變 2px，那是設計決定不是補遷 → **留給 Owner**。
    已加負向哨兵（T36）：有人順手統一時會紅。**剩餘待拍板**：① `.consumables` 6px→8px 要不要統一
    ② DS-02 `.crafter-qt-tag` 改消費 `.codex-badge` ③ DS-01 三張表 → `.codex-table`（動版面，需看畫面）。
  - **✅ 全數結案 2026-08-16（Owner：27 結案）**：三項都已完成——(a) `.result-summary` 遷共用中性面板
    （computed style 逐項與遷移前相同、零視覺變化）＋`.consumables` 統一 8px 並顯式寫 `--panel-bg`
    （T36 釘住「巢狀會繼承父層底色」那個坑）／(b) `.crafter-qt-tag` 改消費 `.codex-badge`／
    (c) 三張表遷 `.codex-table`（`--fixed`／`--sticky`），`.rt` 原本自刻的 sticky 確實重現了 portal
    記錄的 `border-collapse: collapse` 坑（捲動時列穿到表頭下方沒有分隔線，截圖實證），共用變體用
    `separate` 解掉。T50 守。**無剩餘項。**

- [x] **B-028** (P3, sec) 【建議 中｜延遲風險 低｜執行風險 低｜副作用 跨 repo（13 站同型代理）】**settings-api 代理收窄**：(a) 無路徑白名單 —— `/settings-api/<任意路徑>` 一律轉到上游根路徑 ⇒ 本站原點也是 `/feedback`／`/announcements`／`/settings/*` 的入口，即使本站只用得到 `/u/*` 與 `/health` (b) 無條件覆寫 `Origin` ⇒ 上游 `/feedback` 的第一道閘（Origin 白名單）經過本代理時**永遠不會觸發**；原註解要解的是「同源請求瀏覽器不帶 Origin」，改成「缺席才補」即可完全達成目的並把那道閘還回去。**今天不可利用**（真正的 capability 是 UUID，第二道 `application/json` 閘仍在），但這支是 13 站樣板來源，改不改要一次決定。**⚠ 拍板**：(A 建議) 兩項都做並同步回其他站／(B) 只做 Origin（一行、零風險）／(C) 不做。來源: 健檢 2026-08-15（sec A2）
  - **✅ 已完成 2026-08-15（Owner：A 都做）——⚠ 白名單內容與提案時寫的不同**：提案（沿用 finding 措辭）寫「只用得到 `/u/*`」，
    但去查消費端才發現**那條路徑不存在**：真實面是 portal `settings-client.js` 的 `SETTINGS_BASE + '/settings/' + uuid`
    （GET pull／PUT push），而同源站的 `SETTINGS_BASE` 就是 `location.origin + '/settings-api'`。
    **照原提案寫會 404 掉每一次雲端設定同步，而畫面上只是「設定沒跟著走」＝零錯誤訊號。**
    定案＝`/^\/health$/` 與 `/^\/settings\/[^/]+$/`；路徑先正規化再比對（擋 `/settings/../feedback`）；
    清單外回 404 不回 403（不對外確認上游有沒有那條路徑）；`Origin` 改成缺席才補。
    測試補 7 條（含 PUT 正向案例——只驗 GET 的話「白名單擋掉寫入」會溜過去），兩個突變各自轉紅。
    ⚠️ **部署後要人工確認**：本機 dev server 不跑 Functions 且 localhost 不在 `SAME_ORIGIN_SETTINGS_HOSTS`，
    這條路徑**本機無法端到端驗**——推上去後在 crafter 改一個設定、重整，確認雲端同步仍正常。

- [x] **B-029** (P3, ux) 【建議 中｜延遲風險 低｜執行風險 **高（前輪同型問題退回兩次）**｜副作用 無】**職業任務交付物列的窄屏溢出**。`.crafter-qt-item` 單列 flex 塞 icon＋品名＋HQ＋數量＋複製鈕＋徽章×2＋動作鈕；reviewer 判「手機必然溢出」，verifier 標 **partial（靜態推斷、未實測）**。**⚠ 第一步是量測不是改 CSS**：B-011(c) 就是照著「800–1018px 會溢出」這個錯誤前提動工，把右溢出換成左溢出又打壞兩個原本正常的寬度，退回兩次。照 AGENTS「開發注意」的手法（同源 iframe 定寬 1400/1018/900/800/430/390/360）量完再決定。來源: 健檢 2026-08-15（ux-flows A3）
  - **✅ 已完成 2026-08-15（Owner：先量測再修）——⚠ 量測推翻了報告前提**：文件層級在 1400〜360px **任何寬度都沒有水平溢出**。
    真正的缺陷是另一件事：`.crafter-qt-item__src`（徽章＋動作鈕，實測 222px）是 `flex: 0 0 auto` 不收縮，
    品名是唯一能縮的 ⇒ 吸收全部不足。**≤390px 時品名寬度是 0**——玩家看到「圖 + ×1 + 複製鈕 + 徽章」而完全沒有品名。
    截斷從 ≤560px 開始（3/27）、460px 有 11/27、≤390px 是 27/27。
    修法＝窄屏讓 `__src` 落到第二行、品名拿回整行；斷點沿用本檔既有的 **760px**，不發明新數字。
    修後複驗 10 種寬度：截斷數全為 0、最小品名寬 48–52px，800px 以上數值與修改前逐項相同（無回歸）。T44 守形狀。

- [x] **B-030** (P3, test) 【建議 中｜延遲風險 低｜執行風險 低｜副作用 無】**資料管線的不變量缺口三項**：(a) 交付數量的對帳命中率**沒有 ratchet**，退步時零訊號（同檔的 vendors／hq 都有，唯獨 qty 沒有）(b) 食藥補 icon 以繁中名對帳且 fail-open（查無就寫 None、不失敗），且完全沒有資料不變量測試 (c) `data/quality-stages.json` 無資料不變量 ⇒ `build-data.py` 若輸出新來源，`toQuality` 靜默回 0（「未知來源不猜換算」那條防線會變成靜默少一檔）。另 `build-data.py` 對缺上游輸入 fail-open（印 ⚠ 後續跑、exit 0），屬前輪延續項。來源: 健檢 2026-08-15（correctness-data A2/A3、tests A7、build-release A3）
  - **✅ 已完成 2026-08-16**：(a) 交付數量對帳命中率 ratchet 228/290（T31）(b) 食藥資料不變量——筆數／
    icon 全中／item id／icon 路徑形狀／繁中品名（T54）(c) quality-stages 不變量，其中 `src` 字彙
    **從消費端 `toQuality` 的原始碼抽出**、要求資料 ⊆ 它（不在測試裡寫死清單，否則哨兵自己也會漂）
    ＋筆數／三檔／非負整數／由低到高（T54）(d) `build-data.py` 缺上游輸入改 **fail-closed**：
    收集全部缺件、跑完印總表並 exit 1；**刻意不在缺件當下中止**——既有的「缺的那份不覆蓋」保留了
    前一個好狀態，要改的只有「回報成功」。端到端實測（scratch 副本缺兩檔 → 印 2 項 + exit 1，
    正常路徑仍 exit 0）＋三個資料突變各自轉紅。

- [x] **B-031** (P3, sec) 【建議 低｜延遲風險 低｜執行風險 中（跨 13 站 CSP 範本）｜副作用 跨 repo】**CSP `unsafe-inline` 的殘餘價值只有「哨兵」那一半**。移除 `unsafe-inline`（改用 index.html 三段 inline script 的 sha256，由 `deploy-prepare.sh` 產生）是**已拍板取捨的再提案**（2026-07-11／2026-08-01 兩輪都判過重報），本輪 verifier 亦降為 low：沒有提出新的可利用路徑。**唯一有增量價值的部分**＝加一支哨兵擋「新增第 4 段 inline script」，避免 `unsafe-inline` 的實際依賴面無聲擴大。要做就只做哨兵那一項；CSP 本體屬 portal 生態決策。來源: 健檢 2026-08-15（sec A1，partial）
  - **✅ 已完成 2026-08-16（只做哨兵那一半）**：T53 釘住「index.html 的可執行 inline script 恰為 2 段」
    （有 `src` 的走 host 白名單、`ld+json` 不是可執行碼，兩者都不算）＋一條「`unsafe-inline` 仍在」
    的前提斷言（哪天 CSP 收緊了會提醒回來重估本哨兵）。**CSP 本體不動**——移除 `unsafe-inline` 是
    兩輪判過重報的已拍板取捨，本輪 verifier 亦降 low、無新的可利用路徑。失敗訊息直接寫出建議
    （能改成外部 `.js` 就改；真的非 inline 不可就更新預期值並註明用途）。突變（附加一段 inline）轉紅。

## 已完成（保留紀錄）

- 健檢 2026-07-04 須修改項 0-1、0-3、0-4、1-1、1-2、1-3、2-1、3-1、3-2 + 建議 SEC-01/02/03、RES-01/02/03/04/05/06、a11y-02/03/04/05、ux-3/5/6、perf-ux-01/02/03/04、CQ-01/02/05、DATA-1 + 0-2 → 見 `CHANGELOG.md` 2026-07-04 / 2026-07-11 兩段。
- R2 複檢 2026-07-11 須修改 M1（專家之證 CP+15）+ 建議全批（quality A1＝B-004 done／sec A1·A2／docs A1·A2／UX A1·A2·A3）→ 見 `CHANGELOG.md` 2026-07-11 R2 段（`d70d590`／`a6ab096`）。

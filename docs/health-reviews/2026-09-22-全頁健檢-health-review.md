---
cycle: 2026-09-22-health-review
status: completed
devloop: 2
---

# 全頁健檢與改善

日期：2026-09-22（台灣）。首輪完成健檢、直接修復與驗證；Owner 同日追加四項決策，執行結果記於第 5 節。

## 1. 要求項目與完成狀態

| Owner 要求 | 結果 |
|---|---|
| 完整健檢分析 | 已涵蓋頁面流程、窄屏與鍵盤操作、狀態一致性、輸入邊界、資料產生器、WASM、API／部署邊界與既有決策；未將未驗證的架構疑慮寫成漏洞 |
| 不需拍板的項目直接修正 | 已修復下節已重現問題，完成自動驗證及實際頁面操作 |
| 需拍板項目詳細列出與建議 | 第 5 節列四項，含選項、推薦、代價、未做後果及後續驗收 |

未 commit、push 或部署。首輪健檢未重建正式資料；後續 D2 名稱更新依 Owner 明確授權另行處理，不與首輪證據混用。保留原有 R5 fix-plan，不改寫過去決策。本輪不是外部 CLI sealed panel，也沒有執行自動全維評分，故不提供可與歷次分數比較的數字。

## 2. 覆蓋與證據邊界

| 面向 | 本輪檢查／驗證 | 界線 |
|---|---|---|
| 求解與配方 | 選配方、品質階段、有效能力門檻、食品切換、實際 Worker 求解、巨集複製、後續製作候選 | 未於遊戲客戶端執行巨集 |
| 裝備與保存 | 36 欄位可及名稱、整數／上界、載入非法舊值、清单數量與 reload 保存 | 不清洗或刪除使用者舊設定 |
| UI／互動 | 實際窄屏畫面、鍵盤選配方後焦點、固定頁首遮擋、求解／清單／職業任務寬度 | 寬度掃描部分使用同源、去 script 的已填入 DOM 副本；不是所有寬度都重新跑整個 app |
| 韌性 | 必要 JSON 失載、食品失載、Worker constructor／postMessage 同步錯誤、免 reload 重試 | 不宣稱涵蓋所有網路或瀏覽器錯誤 |
| 資料 | 配方、rlv、材料、物品參照、技能列、任務數量與商店輸入、CSV 結構、靜態快照失敗路径 | 來源政策、名稱版本與未知任務數量不擅自變更 |
| 引擎／公式 | Rust 回歸、WASM 重建、Action／戳記對帳、引擎與 JS golden 差分 | 保留既有明示允許差異；不改遊戲公式／HQ 對照表 |
| 安全／部署 | CF service binding、路徑／Origin／ETag／no-store 契約、實跑部署 allow-list、CSP 與共享 script 信任範圍 | 未操作 CF 帳號、正式雲端保存、跨站帳號交接；不是完整滲透測試 |
| 效能／維護 | 現有載入與模組模式、窄屏 intrinsic sizing、來源／產物一致性、既有健檢與 backlog 決策 | 不以解碼後 JSON 大小當傳输量，也未產出正式 RUM／Lighthouse 基線 |

執行方式：Main 實作／核驗與原生 subagent 分工。Main 可觀測模型為 `openai-codex/gpt-6-astra`；三個 scout 可觀測為 `openai-codex/gpt-5.6-luna`，兩個建置修復 agent 配置為 Luna:max。實際 effort／帳號層級未能獨立觀測，不作已證實聲明。

## 3. 已直接修復

### 3.1 窄屏與鍵盤操作

- **問題**：食品／品質階段撐開求解卡片；製作清單的材料 grid 最小欄寬及動作區撐出窄屏。一般配方的品質階段元素帶 `hidden`，仍被 CSS 顯示。選配方後焦點落回 BODY，鍵盤使用者失去位置。
- **修正**：`styles/30-recipe.css` 尊重 `[hidden]`、使用 `minmax(0, 1fr)`，並提供頁首捲動預留；`styles/50-tabs.css` 限制動作區與材料欄最小寬度。`index.html`／`app-recipe.js` 讓選配方後焦點進入設定標題，不再觸發第二次不必要捲動。未另造 codex 元件。
- **證據**：360px viewport 下求解卡原寬 414px，修後 document client／scroll width 均 350px；清單原 scroll width 374px，修後 350px。求解與清單於 360／390／430／560／760／900／1400 寬度副本量測均無整頁橫向溢出；職業任務九個寬度亦通過。裝備表保留刻意的容器內捲動。
- **互動**：一般配方 1008 階段 computed display 由 `flex` 變成 `none`；配方 36199 第 2 階段仍顯示 8940。鍵盤選取後 `activeElement` 為 `config-title`；設定標題 top 81.28px，高於頁首 bottom 48px，未被遮擋。

### 3.2 裝備數值與可及名稱

- **問題**：36 個輸入沒有各自的可及名稱；保存的超界等級或小數能力值可被當成有效裝備。
- **修正**：`app-gear.js` 以「職業：欄位」命名；數值必須為整數，等級最高 100，能力值最高 65535；沿用既有有效裝備的正數要求。HTML 上界、step、`aria-invalid` 與 custom validity 一致。舊非法值保留可見，但不作為有效裝備使用；未在載入時重寫 storage。
- **證據**：保存木工等級 150 後 reload，欄位仍顯示 150 且 `aria-invalid=true`，`gearFor` 回 null；CP 600.5／65536 同樣拒絕，正常值恢復後可求解。36 欄位皆有區別名稱。

### 3.3 食品失載不再顯示假效果

- **問題**：食品資料失載時，實際 `get()` 為 null、按鈕為「無」，但 label／摘要仍帶保存的椒麻鰻魚，誤導使用者以為有加成。
- **修正**：`app-consumable.js` 的 label 只使用本次資料中成功解析的選項；失載不刪除保存偏好。
- **證據**：真瀏覽器攔截 meals 請求，修後 `get=null`、label 空、摘要「未使用」，storage 仍保留原食品；恢復資料後 reload，食品與標籤自動復原。正常食品切換仍會使舊求解結果失效。

### 3.4 Worker 同步失敗與可恢復狀態

- **問題**：`new Worker()` 拋錯被錯歸類為資料載入失敗並中斷初始化；`postMessage()` 同步拋錯也缺少一致的失敗恢復出口。
- **修正**：`app-solve.js` 集中清除 Worker、停止計時、退出 solving、顯示錯誤與重試；涵蓋 constructor 與 postMessage 拋錯，並避免 abort 後覆蓋新建 Worker 的錯誤狀態。
- **證據**：兩種故障分別實際注入。修後無假資料失載區，求解鈕可見、取消鈕隱藏、重試可見；恢復原生 Worker／postMessage 後，不 reload 即可重新求得 2 步結果。

### 3.5 後續製作與正式選配方規則一致

- **問題**：「只看我能做」只檢查裝備存在，未套用配方最低能力；同物品多配方候選也可能偏離既有同職最低難度策略。
- **修正**：`app-nextcraft.js` 改用 `canCraftRecipe(recipe)`，由 `app.js` 以 `gearFor`、有效食品／專家數值與 `statShortfall` 注入；`app-recipe.js` 的 `pickRecipeForItem` 接受限定候選集合。先限於真正使用該材料且符合條件的候選，再走既有 canonical picker；所有呼叫端同步遷移，沒有相容別名。
- **證據**：配方 5637 的产物 44001 可用於 35830「舊日王國寬刃劍」，後者需要作業精度 4740。實際作業精度 4000 時，「只看我能做」不列出它；關掉篩選顯示「數值不足」，選取後求解亦為 `aria-disabled=true`。候選集行為測試確認只從 20／22 挑選 22，不越界選 21，材料數量仍為 3。

### 3.6 WASM 不再靜默丟棄未知技能

- **問題**：`simulate` 以 `filter_map` 丟掉無法解析的技能；輸入含錯字時，回傳的是另一條技能序列的模擬結果。
- **修正**：`wasm/src/lib.rs` 改為解析 `Result`，未知技能帶步驟索引報錯；保留既有錯誤出口及合法序列演算法。已按專案釘定工具鏈重建 `pkg/` 與 BUILD-STAMP，未變更依賴。
- **證據**：實際 WASM 修前「未知技能＋BasicSynthesis」與只送合法技能得到相同完成結果；修後拋出 `Unknown action at step 1`，合法序列仍成功。Rust 新增對應回歸，差分閘通過。

### 3.7 資料產生器先驗證，失敗不假成功或覆蓋對應好資料

- **問題**：可讀但空／缺參照的快照、缺物品列、缺一般技能列、缺任務數量／商店輸入及錯配 CSV，可造成殘缺或假資料寫入。來源抓取的空頁與坏快取也可能被當成成功。
- **修正位置**：`tools/build_lib/{common,items,actions,quests}.py`、`tools/build-data.py`、`tools/build-static-data.py`。
- **修正內容**：驗證配方 bundle 非空、ID 正整數且唯一、rlv／材料參照與材料數量；五份靜態輸入先檢查再複製。缺引用物品／一般技能／必要任務輸入時回報問題並停止依賴階段。CSV 檢查欄數、header 與 Instruction／Arg 成對後綴。抓取端拒絕空或中斷頁、缺 rlv／材料、無效 craft_type／坏快取；整體驗證前不寫回快取，連線以 finally 關閉。合法空 meals／medicine 列表仍接受。
- **證據**：以舊版重現物品／技能／商店輸出覆蓋 sentinel、CSV 錯配被接受；修後對應失敗保留 sentinel，合法 fixture 仍可產生。空 HTTP／中段空頁／缺 rlv／壞快取／空 craft_type／缺材料均 fail closed。這不是整套多檔建置的交易式原子承諾。
- **真實 smoke**：正式來源讀入，但 OUT 指向臨時目錄，成功產生 11 份 JSON；recipes／recipe_levels／ingredients／craft-actions 與現有出貨檔逐 byte 一致。產生 13759 items、992 品質階段、768 等級同步、11 職業 217 任務；290 個交付項中 228 已知數量、62 未知。正式資料未覆寫。

## 4. 驗證結果與限制

### 4.1 自動驗證

下列命令均為本輪實跑；沒有因報告整理而重跑。Windows 命令以 PowerShell 環境表述；`tests/run-all.mjs` 內部另啟動 POSIX sh 執行部署腳本。

| 命令／場景 | 結果 |
|---|---|
| PowerShell：`node tools/test-formulas.mjs` | exit 0；562 passed、0 failed。原 556，新加 7 行為斷言、刪除 1 個僅檢查函式存在的斷言 |
| PowerShell：`node tests/run-all.mjs` | exit 0；2/2 測試檔；真實部署輸出成功，35 個 allow-list 項目，內部資產未混入 |
| PowerShell：逐檔 `node --check <root-js-file>` | 17 個 root JS 全部 exit 0 |
| PowerShell（cwd `wasm`）：`cargo test` | exit 0；6 passed、0 failed；靜態斷言點 17→19（pre-commit gate 實測；初稿誤記 18） |
| PowerShell：`tools/build-wasm.ps1` | 成功；WASM 287551 bytes；nightly-2026-06-22、rustc 1.98.0-nightly（91fe22da）、wasm-pack 0.13.1 |
| PowerShell：`py -3.11 tools/check-actions.py` | exit 0；35 Action 一致；pkg／lib／lock hash 及 raphael v0.26.2 對帳通過 |
| PowerShell（cwd `tools/sim-diff`）：`cargo run --release` | exit 0；958495 次技能施放，3367 個狀態差異全為既有 ALLOW，沒有新增差異 |
| PowerShell（cwd `tools/sim-diff`）：`node compare-js.mjs ../.. ../../tmp/health-20260922/golden.json` | exit 0；3328 公式、97 HQ cells 零差異；4 個上游缺口沿用明示排除 |
| 一次性 `data-proof.py`／`static-proof.py` | 故障拒絕、sentinel 保留與合法輸入場景通過；腳本於完成後移除，不加入永久測試負擔 |
| 一次性 `generator-smoke.py` | 真實來源、隔離輸出，11 JSON 成功產生；正式資料不變 |
| 只讀資料關聯檢查 | 出貨與靜態快照各 13874 配方通過；未發現重複 ID、缺 rlv、缺材料或物品參照 |
| 真實 CSV 結構 | Quest 5327 列／1526 欄、ClassJobCategory 206 列／48 欄，通過新讀取器 |

### 4.2 真瀏覽器 smoke

本機 `tools/serve.py` 與既有 portal 開發服务供應頁面／codex；沒有對正式服務作寫入。

1. 配方 1008、Lv100／作業 4000／加工 4000／CP600，含既有食品設定：真 Worker 得到 2 步、100% HQ；重建 WASM 後再驗一次。
2. 剪貼簿實際包含 `/ac` 工匠的神速技巧、精密製作、CRLF 與末尾「製作完成」音效 echo。
3. 食品鍵盤切換使舊結果失效；配方 1008 清單數量 2，reload 後材料仍為楓木原木 6、風之碎晶 2。
4. 必要 recipes.json 中斷：可見載入錯誤、loading 移除、表格為空，沒有假成功。
5. 前述 Worker 兩種故障皆能免 reload 恢復；食品故障、舊非法裝備、後續製作門檻、階段顯示與焦點均看實際頁面。

**已知驗證噪音／未驗證面**：

- 本機 portal 公告請求有 CORS 失敗，故不宣稱「全站零 console error」；本輪修復流程可完成。未改跨 repo 公告設定。
- 舊 VM golden harness 載入 app-solve 時有缺 init 警告；3328／97 的實際比較仍成功。故障注入測試也會刻意產生 warning。
- 一次完整 app iframe 嘗試 timeout，以及移除原生 Worker 所屬 iframe 後的 fixture 失效，不列為成功證據；改用存活 frame／穩定頁面完成重试驗證。
- 沒有真實遊戲執行、正式 CF 部署、帳號交接或雲端同步寫入驗收；也沒有證明整個供應鏈不存在漏洞。

### 4.3 原始紀錄留存

以下原始輸出存於本機 `~/.claude/devloop-state/verify-logs/2026-09-22-health-review/`，不納入出貨或跨機同步；其餘場景的命令／結果由上表與本報告保存，不冒稱另有完整原始 log。

| 檔案 | SHA-256 |
|---|---|
| `final-formulas.log` | `bf5f58200a6cdc8072eb4425cc3991b1c2e8477459720cdae15290cc9965d4c5` |
| `final-api-deploy.log` | `db8f88a50c2fe9b2d114bce3a950b9d2524177fdf4623ab688a524a043744417` |
| `final-syntax.log` | `680e080909f9e65fc6753970629c9aaa6bd1033e134da40fd65153548758a313` |

## 5. Owner 決策與原提案

Owner 同日決策：D1 先不動（亦允許對照既有 Excel 核實，本輪選擇維持未知、不猜值）；D2 接受最新名稱修正；D3 維持集中更新；D4 僅在確認為測試用途時退役。下列保留原選項與風險，避免將未採用方向誤讀為待辦。

**落地狀態**：四項已依決策處理；D2 最新差異與更新後驗證見 §8，其餘三項保留現況。

### D1. 62 個職業任務交付數量未知（既有 B-023）

**確證**：本輪真實產生器 smoke 中，290 個交付項有 62 個缺可靠數量，延續既有未知狀態。不是 62 個任務，也不是已證明數量皆錯。

**執行決定**：先不動，保留既有數量來源及未知值；本輪未另行比對 Excel，也未填入推測數量。

- **選項 A／推薦預設**：維持「未知」，不猜 1、不做模糊配對。資料可信度最高，代價是玩家仍需對照遊戲確認。
- **選項 B**：授權專題補齊，有來源的遊戲／任務證據逐筆對應現有數量補充輸入，再由既有產生器輸出；不另造平行資料權威。可提升完整性，但需要可靠材料、核對與持續維護。
- **不推薦**：以文字相似度或固定數量自動填滿。這會把缺資料變成看似可信的錯誤採買量。
- **判斷方向**：若目前重點是求解可靠性，選 A；若「任務一站完成」是下一個明確產品目標，選 B。
- **選 B 驗收**：每筆具 item／quest 對應與可追溯來源，已知舊值不被無關改寫；重新統計未知数並驗證材料加總，無證據者仍保留未知。
- **優先序**：中；延遲風險低（不猜數量），執行風險在資料誤配。

### D2. 正式資料名稱採最新修正，還是維持凍結快照

**證據**：既有 CHANGELOG 的 2026-09-08 紀錄指出，當時相對舊快照已有 169 配方名／175 物品名差異。這是歷史實測值，**不是本輪重新計算的最新差異數**。產生器會讀取當下 monorepo `item_lookup.name_tc`。

- **選項 A**：繼續凍結；可重現，沒有突然改名，但延後繁中正名修正。
- **選項 B／推薦方向**：另開一次明確的資料更新，列當前名稱／ID／配方內容差異，審核後整批接受；沿用既有 game_ref 與快照產生流程。將「資料新版」與「程式健檢」分開，避免追查混淆。
- **不推薦**：本輪順手重跑正式輸出，或每次建置自動接受最新外部資料。那等同未經決策改變出貨內容。
- **驗收**：產出本次真實 diff，而非沿用 169／175；核對 ID／材料／數量／rlv 是否也改變，別把結構變動偽裝成改名；抽驗受影響名稱與 UI 搜尋，保存核准快照。
- **優先序**：中；延遲風險為名稱滯後，執行風險為無意接受非名稱資料變動。

### D3. 共用 portal script：即時集中更新或固定版本＋完整性驗證

**確證／非漏洞聲明**：`index.html` 載入共享、未版本化且未附 SRI 的 portal scripts；CSP 限定來源，但來源允許不等於內容固定。没有證明 CDN 已遭竄改或可被外部任意寫入。

**執行決定**：Owner 選擇集中更新；保留目前共享 scripts 與 CSP，不加入版本固定、SRI 或跨 repo 發佈流程。

- **選項 A**：維持共享信任根。portal 修正可即時惠及各工具，維運簡單；同一信任根失陷時影響也跨站擴散。
- **選項 B／推薦硬化方向**：跨 repo 統一不可變版本路徑、release manifest、相容性／回退策略，再配合 SRI。先處理身份／設定 SDK 等高影響腳本，不在 crafter 單方面鎖死仍會原地更新的 URL。
- **代價**：版本固定後不再自動取得中央修正；需協調升版，SRI 與內容不同步會讓頁面拒載。只補 hash 而不建立不可變發佈流程，反而容易造成事故。
- **驗收**：正確版本正常載入、內容不符被拒、前一版可回退、各工具版本相容；驗證 CSP／CORS 與 cache 行為，不以寫入屬性當安全證明。
- **優先序**：中，屬艦隊層安全治理，非本頁緊急阻斷。
- **相關但未新增要求**：UUID query 交接可能进入目的端 log，JS 可讀的 `.xivtc.com` cookie 使 sibling 站台共享能力信任；屬 portal 擁有的既有架構，本輪未做 exploit 驗證，也不把它們包裝成 crafter 已確認的認證繞過。

### D4. 未啟用的 minify 分支要保留、退役，或正式啟用

**確證**：`deploy-prepare.sh` 可選分支會執行 `npx --yes esbuild@0.28.1`；版本已精確指定，但不是 repo lockfile integrity 鎖定。當前沒有 `.deploy-minify`，所以這不是本次部署路徑上正在發生的 registry 下載。

**用途核實與處理**：`0.28.1` 是 esbuild 工具版本，供正式部署的可選 JS 壓縮流程使用（縮短區域變數、移除註解、不產 source map），不是測試版本。只有存在 `.deploy-minify` 才會執行，目前標記不存在。Owner 的「測試用才退役」條件不成立，因此保留且繼續停用，未改腳本或下載依賴。

- **選項 A／本輪推薦**：保持停用，不為假想收益增加供應鏈與建置變數。
- **選項 B**：若艦隊確認不需要，另行授權統一退役共用分支；避免單 repo 漂移。會失去之後直接開旗標壓縮的能力。
- **選項 C**：若有已量測的壓縮需求，先用受鎖定且可核驗 integrity 的工具依賴、隔離建置與回退，再啟用。需要維護工具升級，不能把固定版本等同完整供應鏈保證。
- **驗收**：停用時不接觸此依賴；啟用時可重現輸出、依賴不可靜默替換、失敗保留前一份好產物，且仍受 allow-list 出貨閘守護。
- **優先序**：低；未啟用時延遲風險低。本輪未啟用、未做 registry 攻擊測試。

## 6. 排除、沿用與沒有順手做的項目

- **已駁回發現**：「build-data 發生 problem 仍 exit 0」不成立；既有 `__main__` finalizer 已會非零退出。本輪修的是前面的寫入與依賴停止時機，不重造退出機制。
- **非已證實缺陷**：来源前三項抽查是抽樣策略，不足以推論現有資料錯誤；是否改成完整同源比對屬另一次新鮮度政策決策。
- **不重開已決策項**：B-021 IndexedDB／lazy load、B-022 modulepreload、B-006 noopener、B-031 unsafe-inline，以及 B-003 模擬 UI。解碼約 7MB 不能拿來推翻歷史約 607KB Brotli 的傳輸論據。
- **安全查核限制**：靜態審查未見新 secret 暴露不等於全域無 secret；API 本地 UUID 格式、encoded slash、Function response headers 的額外硬化沒有取得足夠漏洞證據，不以猜測改變代理契約。既有上游驗證與 service binding 保留。
- **維持權威來源**：技能繁中名、HQ 對照、製作公式、等級同步、品質階段資料來源不變；沒有用 UI special case 補掉資料錯誤。
- **交付範圍**：本輪修復工作目錄、更新本報告／CHANGELOG／索引及必要測試基線。部署仍由 Owner 依專案 safe-push 規則執行。

## 7. DEVLOOP Record

候選版本為未提交的工作目錄，不虛構 commit。首輪修復來源與 WASM 的逐檔清單留在封存根目錄；加入核准的四份名稱資料後，完整清單為 `name-refresh/source-manifest.json`，其 SHA-256 即下列 revision。首輪證據見 §4，名稱更新後的重驗見 §8。

```devloop-record
{
  "v": 1,
  "cycle": "2026-09-22-health-review",
  "revision": "working-tree/source-manifest-sha256:3359e6f87175226cb369c98bf008b84d1229e322b8b488ac06250614300a8d04",
  "controls": {
    "design": false,
    "plan": false,
    "assurance": [],
    "isolation": "none"
  },
  "basis": {
    "design": "直接修復恢復既有契約；四項政策已由 Owner 決定。後續名稱更新沿用既有來源與產生器，配方／物品 ID、schema、材料及能力值均不變。",
    "plan": "本輪不部署、不變更資料來源；名稱在隔離輸出生成、逐欄比對後僅套用四份產物，不需跨服務切換。",
    "assurance": "無不可逆操作、安全信任邊界或合法 consumer 不相容。名稱由既有權威重新產生，非使用者資料遷移；未改保存的設定／清單、ID 或資料 schema，原檔另行封存可逐檔還原。刪除的 typeof 斷言非唯一行為覆蓋。Owner 未指定獨立複審。",
    "isolation": "既有工作目錄、未建 branch/worktree；首輪不同檔案分工整合後驗證。名稱更新先在臨時目錄重建並檢查，套用前核對原檔 hash 未被並行改寫。既有 R5 計畫保留，沒有發佈操作。"
  },
  "reviews": [],
  "verify": {
    "commands": [
      "PowerShell: node tools/test-formulas.mjs",
      "PowerShell: node tests/run-all.mjs",
      "PowerShell: node --check (17 root JS files, individually)",
      "PowerShell (cwd wasm): cargo test",
      "PowerShell: tools/build-wasm.ps1",
      "PowerShell: py -3.11 tools/check-actions.py",
      "PowerShell (cwd tools/sim-diff): cargo run --release",
      "PowerShell (cwd tools/sim-diff): node compare-js.mjs ../.. ../../tmp/health-20260922/golden.json",
      "Python isolated generator smoke and fault-injection scripts; real browser scenarios in section 4"
    ],
    "result": "pass",
    "evidence": [
      {
        "path": "CHANGELOG.md",
        "sha256": "4c98f89b81fd84225f90133061d4db8bf157bb90a20e1b0455028fc407835d3c"
      }
    ]
  }
}
```

## 8. Owner 核准後：名稱更新結果

同日依 D2 核准，沿用既有 `build-static-data.py` 與 `build-data.py`，先將快照與輸出指向隔離目錄重建，再核對逐欄差異；只有下列四份名稱產物套回正式工作目錄。原始快照與完整差異封存在本機驗證目錄的 `name-refresh/`，未提交或部署。

| 檔案 | 實際差異 |
|---|---|
| `tools/static-data/recipes.json` | 172 筆 `item_name` 修正 |
| `tools/static-data/items.json` | 178 筆 `name` 修正 |
| `data/recipes.json` | 同步上述 172 筆配方名稱 |
| `data/items.json` | 3 筆繁中 `name`、13 筆簡中搜尋別名 `name_sc` 修正 |

178 與 3 是不同快照的差異數，不能相加當作不同物品總數；出貨 items 原本已包含大部分舊有正名。此次最新數量取代先前歷史 169／175 的估計，不表示新增配方。

- 全部仍為 13874 配方、13759 物品；沒有新增／刪除 ID，沒有材料、數量、rlv、能力值或 schema 變動。其餘生成資料內容均與原資料相同，未套入無關檔案。
- 第一輪差異閘只允許 `name`，因此對 `name_sc` 停止套用（exit 1）；核對 16 個欄位差異後確認皆為繁中名稱／簡中搜尋別名，再以明示名稱欄位清單驗證並套用。不是忽略結構差異或把失敗記成成功。
- 任務數量維持 228 已知、62 未知；本輪沒有核對 Excel 或更動數量來源。
- 更新後 PowerShell 實跑 `node tools/test-formulas.mjs`：exit 0、562 passed／0 failed；`node tests/run-all.mjs`：exit 0、2/2。Rust／WASM／Action 來源未變，沿用 §4 的有效證據，不重跑引擎重閘。
- 真瀏覽器：搜尋「顯貴打底褲」得到配方 1396，選取後設定卡正確顯示新名；搜尋「慰劳用的烹调工具」得到繁中顯示的「慰勞用的烹調工具」與「慰勞用的烹調工具零件」，截圖確認。沒有雲端寫入。

本機封存：`~/.claude/devloop-state/verify-logs/2026-09-22-health-review/name-refresh/`。

| 證據 | SHA-256 |
|---|---|
| `diff.json`（全量逐欄差異） | `ff046bf0cc6c55b82e1f038ab3747064cc29b4736da77c5cdc845e3ddbe2fe17` |
| `formulas.log` | `3269d81b4b72f4bb43365d56b993860a7f7ac8378b1614d78da125ebef925a12` |
| `api-deploy.log` | `ab11a94db63b933a03ab7fb015ea1542ef03c8f5468dac4714625b4ebac7f9d4` |

# ffxiv-crafter 健檢報告（2026-09-05・R5）

## 總評：專案體質 **7.5** / 10 · 使用者友善 **7.5** / 10 — 「地基穩，但守地基的哨兵有三支在說謊」

> **涵蓋率**：12 維雙視角 fan-out **全數完成**（45 agents／756 tool calls／5.43M subagent token・0 失敗），
> 含 recall 三軌。⚠️ 過程分兩段：第一段 45 個 agent 中 32 個撞到 session 限額（`resets 2pm`），
> 當時以 5 維＋主迴圈淺審先出了一版（commit `01e48af`）；限額重置後以 `resumeFromRunId` 續跑，
> 已完成的 13 個 agent 走快取、其餘 32 個補齊。本檔為**補齊後的最終版**，第一版的淺審分數已全數由
> 完整迴圈取代。67 findings → confirmed 55 / partial 11 / refuted 1；主迴圈親自複驗 **10 項**
> （2 項上調嚴重度）；另做突變測試 15 組（14 紅／1 綠）＋線上實測＋兩支重閘。

**較上輪**（2026-08-15，11 維）：體質 7.5 → **7.5**（本輪 12 維：sec 拆成前後端各一維，其餘相同，
**可比但非精確持平**）／使用者 7.2 → **7.5**。使用者分的上升有實測支撐（CLS 最差 0.0395、
首訪傳輸 768.5 KB、DCL 441ms、計費請求 0、零 console error、12 個寬度零橫向溢出），
前輪點名的三件（成果默默遺失、假警告、載入期間死按鈕）**前兩件查證零回退，第三件以新形狀復發**
（首次使用提示的「前往角色數值 →」在載入期是死鈕，見 ux A1）。

**本輪最重要的訊號**：前輪頭條是「哨兵的檔案清單是手維護的、會漏」。本輪它以**三種更難發現的形式**再現——

1. **判斷式本身被寫壞成永遠不成立**：`tests/first-run-hint-key.test.mjs:47` 的 `/\b(defer|async)\b/`
   裡兩個 `\b` 是**字面 backspace 位元組（0x08）**。實測把 script 改成 `defer`，哨兵印「✓ …且為
   parser-blocking」並 exit 0；改成 `module` 才紅。三個禁止值裡最可能被誤改的那一個正好抓不到，
   而它守的是載入期 CLS 從 0.0005 退回 0.094。全 repo 文字檔只有這一處中招。
2. **哨兵驗的東西不是它宣稱的東西**：`check-actions.py` 印「✓ pkg/ 與 wasm/src 同步」，但
   `BUILD-STAMP.json` 只雜湊 `lib.rs` 與 `Cargo.lock`、**一個位元組都沒雜湊 `pkg/`**——
   「改了引擎、重建了、忘了把 `pkg/` 一起 commit」全綠，玩家拿到舊引擎算的巨集。
3. **哨兵的觸發器抓不到它要守的檔**：pre-commit gate 6 的 `--staged` 觸發正則只認 `tests?/`、
   `*.test.*`、`AGENTS.md`；本 repo 的 654 條測試住在 `tools/test-formulas.mjs`，**三條都不匹配**
   ⇒ 「悄悄刪掉幾條 T 案例」的 commit 剛好不會觸發 ratchet。同時 `tests/run-all.mjs` 沒有檔數下限：
   0 個檔也印「0/0 測試檔通過」並 exit 0。

三者的共同點：**畫面上都是綠的**。這也是為什麼本輪把 tests-ci 壓在 6.5——不是測試少，是有三處
「有測試」的感覺是假的。

---

## 機械基線（本輪實跑，全綠）

| 項目 | 結果 |
|---|---|
| `node --check` × 15 支手寫 JS | ✅ |
| `node tools/test-formulas.mjs` | ✅ **654 passed, 0 failed** |
| `node tests/run-all.mjs` | ✅ **4/4** |
| `py -3.11 tools/check-actions.py` | ✅ 三個不變量（35==35／BUILD-STAMP／sim-diff 釘 raphael v0.26.2）——**但見上：第二個不變量驗的不是它宣稱的東西** |
| `cd wasm && cargo test` | ✅ 5 passed（含上游耐久 bug 的絆線仍紅＝workaround 仍需要） |
| `check-test-baseline --repo .` | ✅ 3 個標記相符（654／35／5） |
| `sh deploy-prepare.sh` | ✅ 連跑 3 次皆 44 檔（與 marketboard 不同，本 repo 在 Windows 上不間歇） |
| **`tools/sim-diff` 引擎差分**（~96 萬次施放） | ✅ 無清單外新分歧；`ALLOWED` 每條仍出現 |
| **JS 對 Tnze golden** | ✅ `base_progress`/`base_quality` 3328 組分歧 0；`hqPercent` 97 格分歧 0 |
| 依賴 | ✅ 零 npm 依賴；Rust 釘 raphael-rs v0.26.2（**但 `rust-toolchain` 是裸 `nightly`**，見 build A5） |
| monorepo 跨 repo 哨兵（crafter 部分） | ✅ 11 支全綠 |
| `check-devloop-artifacts --repo .` | ✅ 合格，**但每次都印 `⚠ R7 常駐層 AGENTS.md 36.0KB > 20KB`**（見 docs M10） |

### 線上實測（playwright-core，2026-09-05）

| 量測 | 結果 |
|---|---|
| CLS（41 個寬度，載入＋互動，取最差） | **0.0395 @560px（載入 0.0000）**；`/404` 全 0 |
| 首訪 | 78 requests；解壓後 7.73 MB、**實際傳輸 768.5 KB**；render-blocking **23.1 KB**；DCL **441ms**／load 481ms |
| 計費請求（Pages Functions） | **0** |
| 回訪 | 傳輸 **12.9 KB**（全 304）；解壓後仍 7.66 MB（＝B-021 已否決事項，非新發現） |
| console | **零 error** |
| 橫向溢出（12 寬度 1920→320） | **零文件級溢出** |

**已排除的假象**：14 支 same-origin script 各出現兩次＝portal `version-check.js` 開機 HEAD 記 ETag（刻意設計）；
`fat-cat` 溢出＝portal 共用吉祥物；`"docs` 怪目錄＝git 對非 ASCII 檔名加引號。

---

## 維度評分

### 專案體質視角

| 維度 | 分數 | confirmed | 本輪進 BACKLOG | 一句話 |
|---|:---:|:---:|:---:|---|
| sec-frontend | **8.5** | 3（low×2＋info） | 0 | 40 處注入點逐一比對 `esc()` 零真實破口；扣分只在 `iconUrl()` 白名單零測試 |
| sec-backend | **8.5** | 3 | 0（M12 歸戶 build） | 184 行後端小而紮實；最重的一條是 301 把首頁挪進帳號級額度 |
| correctness-core | **7.5** | 4 | 1（B-032） | 三條 medium 全是「改了 A 沒連動 B」；`craftPlan` 死碼帶錯誤演算法 |
| correctness-data | **7.5** | 6 | 1（B-036） | 資料管線 fail-closed 實查成立；但 `isCrystal` 名稱正則誤判 55 筆、「一物多配方」模型與 136 組實資料不符 |
| resilience | **7.5** | 5 | 0 | 三條失敗路徑收得住；扣分在食藥載入失敗被當品項下架而清偏好、`AbortSignal.timeout` 無退場 |
| quality | **7.5** | 7 | 1（B-034） | 12 層模組 pattern 一致；三檔跨 500 行閘門無紀錄 |
| **tests-ci** | **6.5** | 8 | 1（B-037） | **本輪最低**：三支哨兵謊報（見總評）＋ hooksPath 在 `.git/config` 指 repo 外絕對路徑、新 clone 零閘門 |
| docs-drift | **6.5** | 7 | 1（B-033） | AGENTS.md 已長回 36.9KB 而 R7 警告每次都在印；鐵則把 `hqPercent` 指到拆檔前的 `app.js`；README「本 repo 未公開」與事實相反 |
| build-release | **7.0** | 8 | 1（B-038） | 部署面 fail-closed 有效；扣分在 BUILD-STAMP 不雜湊產物、授權檔線上 404、`.deploy-filelist.tmp` 自鎖、裸 nightly |
| design-system | **7.5** | 8 | 0 | 零 local 重刻 `.codex-*` 基礎元件；扣分在 T36 清單手維護漏 `.consumables`、`.rt-patch` 堆疊後無名、左緣色條兩套畫法 |

### 使用者友善視角

| 維度 | 分數 | confirmed | 本輪進 BACKLOG | 一句話 |
|---|:---:|:---:|:---:|---|
| perf-ux | **8.0** | 5 | 0 | 線上量測全面良好；扣分只在 `v2.xivapi.com` 漏 preconnect（5 姊妹 repo 有 4 個已加）、手機配方表 240px 死規則 |
| ux-flows | **7.0** | 6 | 0 | 三件「畫面對玩家說了與事實相反的話」：吃了藥仍寫「還差 380」；食藥偏好被靜默清空；首次提示鈕在載入期是死鈕且指向空面板 |

**權重**（沿用前輪）：體質＝安全 0.25／正確性 0.30／韌性 0.15／品質 0.10／測試 0.10／文件 0.10
＋build-release 0.10／design-system 0.10，正規化 → **7.5**。使用者＝perf-ux 0.50／ux-flows 0.50 → **7.5**。

> **跨維度合併**：BUILD-STAMP 不雜湊產物同時被 build A1 與 tests A3 報出（同一缺陷，歸戶 build）；
> `craftPlan` 同時被 correctness-core A3 與軌 C A2 報出（歸戶 core）；settings-api 編碼穿越同時被 sec 兩維報出；
> AGENTS.md 基線數字漂移同時被主迴圈與軌 C A3 報出（歸戶 docs）；授權檔未發佈同時被軌 C A1、build A3、docs A2 報出（歸戶 build）。

---

## 須修改（依嚴重度；**拍板欄＝「不需」者本輪直接修**）

| # | 維度 | 嚴重度 | 項目 | 拍板 |
|---|---|:---:|---|:---:|
| M1 | tests-ci | **medium（頭條）** | `first-run-hint-key` 哨兵的 `\b` 是字面 0x08 ⇒「不得 defer／async」半條是死的 | 不需 |
| M2 | core／ux | medium | 改食藥後「最低能力要求」紅字與求解鈕不刷新（已達標仍寫「還差 380」） | 不需 |
| M3 | resilience／ux | medium | `meals`／`medicine` 載入失敗被當品項下架，清空玩家偏好 | 不需 |
| M4 | build | medium | `THIRD-PARTY-NOTICES.md` 在 deny ⇒ 線上 404，而 `LICENSE-MIT.txt:4` 指向它；README:46「本 repo 未公開」與事實相反 | 不需 |
| M5 | build | medium | `.deploy-filelist.tmp` 自鎖，且錯誤訊息叫人把暫存檔加進 allow | 不需 |
| M6 | docs／tests | medium | AGENTS.md:86 散文 653 vs 標記 654；`run-all` 無 TEST-BASELINE 標記且無檔數下限（0/0 也綠） | 不需 |
| M7 | core | medium | `opt-adversarial` 偏好被 expert 配方吃掉（存檔與離開 expert 時都不還原） | 不需 |
| M8 | resilience | medium | `AbortSignal.timeout` 無 feature detect ⇒ 舊瀏覽器整站死在永遠無效的「請重新整理」 | 不需 |
| M9 | core | medium | `craftPlan` 死碼＋鑽石依賴重複計數（W 應 4 算成 6），T51 全樹狀避開 | **需**（B-032） |
| M10 | docs | medium | AGENTS.md 36,911 B；R7 豁免立論被證偽；gate 5 每次印警告卻不分「已豁免／超出豁免值」 | **需**（B-033） |
| M11 | quality | medium | `app.js` 547／`styles.css` 787／`build-data.py` 509 跨 500 行閘門無紀錄 | **需**（B-034） |
| M12 | sec-b／resilience | medium | 301 把 `/` 綁進 13 站共用 Functions 日額度、首頁無降級；`index.html:17-20` 成本註解已與事實矛盾 | **需**（B-035） |
| **M14** | correctness-data | medium | `isCrystal` 名稱正則把「紫水晶手鐲」「水晶燈」等 55 筆 id≥20 物品判成晶體 ⇒ 製造清單分錯組、「加進清單」入口被吃掉；`items.json` 本有 `category:"水晶"` 欄可用 | 不需 |
| **M15** | correctness-data | medium | 「一物多配方」模型假設每職一張，實測 **136 組（成品,職業）有 2〜4 張**（例：統一規格的金屬板 3 職 12 張、難度差近 6 倍）⇒ 職業切換列出現多顆同名不可分辨的鈕 | **需**（B-036） |
| **M16** | build／tests | medium | BUILD-STAMP 只雜湊 `lib.rs`＋`Cargo.lock`、不雜湊 `pkg/` ⇒「忘了一起 commit pkg/」全綠；「別跑裸 wasm-pack」零機械防護 | 不需 |
| **M17** | tests-ci | medium | gate 6 觸發正則永遠匹配不到 `tools/test-formulas.mjs`；`wasm/` 改動也不會觸發 cargo test；hooksPath 不進 git、新 clone 零閘門 | **需**（B-037，跨 repo hook） |
| **M18** | ux-flows | medium | 首次提示的「前往角色數值 →」在 `await loadData()` 前是死鈕（綁定在 `app.js:513`），且 `renderGearsets()` 也在 `await` 之後 ⇒ 面板此時全空 | 不需 |
| **M19** | correctness-data | low→修 | T20／T32 ratchet 門檻（>=700／>=247）低於宣告現況（768／247）⇒ 最多 68 筆 level-sync 可靜默消失 | 不需 |
| **M20** | design | medium | T36 中性面板哨兵的消費端清單手維護，漏掉唯一巢狀的 `.consumables`；手機堆疊版 `.rt-patch` 無 `data-label`（裸數字「2.35」） | 不需 |
| **M21** | perf-ux | medium→low | `v2.xivapi.com` 漏 `preconnect`（**不加 `crossorigin`**：本站只用 `<img>`） | 不需 |
| **M22** | build | medium | `rust-toolchain` 裸 `nightly`、`wasm-pack` 版本無處可查 ⇒ 引擎重現性未釘 | **需**（B-038） |
| **M23** | docs | medium | AGENTS.md:20 把 `hqPercent()` 指到 `app.js`（實在 `app-render.js`，:43 自相矛盾）；架構表漏 `first-run-hint.js`／`404.html`／`tests/`；VERIFY 註解「T1〜T57」實為 T61 | 不需 |

## 建議（不入庫，報告即承載體）

- **sec**：`iconUrl()` 白名單零測試（A2）；settings-api `%2f` 編碼穿越靠上游擋（A1／sec-b A3）；Function 回應無安全標頭（sec-b A2）；`unsafe-inline` 保護的憑證面寫進 AGENTS（A3）。
- **quality**：依賴注入契約 7/12 層驗證（A1）；`test-formulas.mjs` 內 28 份 vm sandbox、4 份逐字重複（A4）；兩支死 proxy `renderIngredients`／`updateInitial`（A5）；巨集提示音保存點只 warn 無 toast（A6）；T6 掃不到 `functions/`（A7／tests A7）。
- **resilience**：`index.html` 交接腳本 3 個空 catch（A4，13 站樣板不單邊改）；`vendors.json` 失敗商人徽章靜默消失（A5）。
- **correctness-data**：`consumersOf` 把配方數當職業數（A3，本輪順手修）；素材彙總路徑沒傳 `needHq`（A5）；`nameTc` 缺值只 print 不 problem（A6）。
- **build**：LIST 清理只掛 cp 失敗分支（A4，M5 的 `.gitignore` 修法已消掉症狀；根治＝`mktemp`）；部署閘不在本機跑（A6，併 B-037）；`_site`／`.deploy-minify` 靠硬編 case（A7）；minify 段是死路徑（A8）。
- **docs**：部署後驗把「走 SPA fallback」寫成正常（A4，13 站共用段落不單邊改）；`_middleware.js` 檔頭「四條件」實為三條（A6，樣板不改）；`lessons.md` handoff 標題與現況相反（A7）。
- **tests**：T49 下限 `>=11` vs 實際 12（A6）；T11 `nth-child` 正則只吃單位數（A8）。
- **ux**：製造清單／職業任務面板載入期全白無占位（A2）；求解完成離開分頁收不到回饋（A3）；站內導覽不進歷史、「繼續做」單向（A4，partial：「不推堆疊」是拍板取捨，一層 undo 可再議）；擋下後導去角色數值無移焦（A5）；「⚒ 繼續做（N）」計數與開窗預設篩選對不上（A6）。
- **design**：自繪食藥 combobox 三項對不上 `.codex-select`（A1）；左緣色條兩套畫法（A2）；`.crafter-sr` 重刻 `.codex-sr-only`（A5）；`--fs-xs` fallback 舊值（A6）；警告框兩種長相（A7）；列高六個值（A8）。
- **perf**：手機配方表 240px 死規則與 `fitHeight` 不看捲動（A2）；WASM 預熱與首屏 JSON 搶頻寬（A3）；取消求解即重抓 103 KB WASM（A4）；icon 一律 `_hr1`（A5）。

---

## 亮點

- **求解正確性有兩道外部對帳，本輪雙雙全綠**（sim-diff 96 萬次施放無新分歧；JS 對 Tnze golden 3328 組＋97 格分歧 0）。
- **零 npm 依賴**、注入面實測乾淨（40 處零破口）、部署面 fail-closed 有效且在 Windows 上穩定。
- **前輪 12 項批次 0 ＋ B-025〜B-031 全部收官，逐一查證零回退。**
- 線上使用者體驗量測全面良好；`first-run-hint` 的 CLS 修法經瀏覽器實測生效。
- 本 repo 的資料 ratchet、`build-data.py` 的 `PROBLEMS` fail-closed、T49 由 index.html 反推涵蓋率——這些**做對了的哨兵**是本輪三支說謊哨兵能被相對襯出來的原因。

---

## 誤報／校正

| 項目 | 處置 |
|---|---|
| 「14 支 script 每次開頁被抓兩次」／「`fat-cat` 溢出」／「`"docs` 怪目錄」 | 主迴圈自查後撤回（見線上實測段） |
| 軌 C A1（授權宣告未發佈）verifier 降 **low** | **主迴圈上調 medium**：MIT 要求著作權宣告隨副本散布，`LICENSE-MIT.txt:4` 指向 404；AGENTS 鐵則 10 自己寫「頁尾只寫授權名稱不算」；README:46 的前提「未公開」已翻掉（repo 為 public） |
| 軌 C A4（`.deploy-filelist.tmp`）verifier 降 **low** | **主迴圈上調 medium**：錯誤訊息指向錯的修法（加進 allow＝擴大部署面） |
| sec-frontend A2（`iconUrl` 零測試）verifier partial→**info** | 採用：輸入全來自 build-data 產物，無使用者可控來源 |
| build A1（BUILD-STAMP）verifier **partial(medium)** | 採用 medium；partial 理由是「stamp 的目的是防漏 rebuild，非防漏 commit」——但 `check-actions.py:90` 印的字面就是「pkg/ 與 wasm/src 同步」，宣稱與實作不符成立 |
| tests-ci A1（gate 6 觸發）verifier confirmed(medium) | 主迴圈實讀 `check-test-baseline.js:198` 三條正則，確認 `tools/test-formulas.mjs` 三條皆不匹配 |
| correctness-data A1（`isCrystal`）verifier confirmed(medium) | 主迴圈實跑：id≥20 命中正則 **55 筆**（agent 說 25，差在 agent 只數 `ingredients.json` 出現過的）；`items.json` 每筆帶 `category` 欄，`"水晶"` 即正確判準 |
| correctness-data A2（一物多配方）verifier confirmed(medium) | 主迴圈實算 `recipes.json`：**136 組、最多 4 張**，與 agent 一致 |
| quality 七條全降 low/info、perf-ux 兩條 medium 降 low、ux A2-A4 partial(low) | 採用降級值 |
| design A3 refuted？ | 否——design 批次的 `A3=refuted(info)` 對應的是**另一維**（build A8 minify 死路徑那批）的編號撞名；design A3（T36 漏 `.consumables`）主迴圈實讀 `test-formulas.mjs:2337-2345` 確認清單只有 filter-group／result-summary／cfg-card／cl-card 四種 |

### 驗證品質

- refuted **1**、partial **11**、降級 **23**／67（34%）。降級率高於前三輪，訊號是 **reviewer 在小 repo 上灌水**（把「可以更好」寫成 medium），不是 verifier 橡皮圖章——verifier 的降級理由逐條可查，且主迴圈抽驗的 10 項裡 8 項與 verifier 一致、2 項主迴圈上調。
- **主迴圈親自複驗 10 項**：M2／M3／M4／M5／M14／M15／M16／M17／M18／M20，全部成立。
- **突變測試 15 組**（副本上）：14 紅／1 綠＝M1。

---

## recall 層

| 軌 | 產出 |
|---|---|
| A 註冊表差集 | 差集為空（17 份登記表／9 候選／缺席 0） |
| B 關鍵字擴散（7 個 spreadKey） | **3 個命中**：`isCrystal:A1=confirmed(medium)`（同一正則的第二個消費端）、`specWanted:A1=confirmed(medium)`（M7 的「離開 expert 不還原」那一半正是擴散抓到的）、`statShortfall:A2=confirmed(low)`；`crafting-`／`craftPlan`／`renderIngredients`／`saveWarned`／`REQUIRED` 無新命中 |
| C 零-context | 5 條，**2 條是維度 fan-out 全集沒有的**（授權宣告未發佈、角色數值型別防線只在顯示端）⇒ **本輪軌 B、C 皆有效** |

---

## 主迴圈備註

- **撞車**：另一 cwd 在 marketboard 的 session 收到逐字相同的 `/goal`；Owner 裁示 marketboard 歸該 session，本 session 改審自己的 cwd，並把 marketboard 的 CLS／請求量測交接過去。
- **工作樹在整個 fan-out（含續跑）期間未被寫入**：Scout 快照 clean＋行尾 29 筆；兩次收尾實測皆相同。突變測試在 `scratchpad/mut` 副本上做。
- **健檢工件先於修復 commit**（`01e48af` 第一版、本版為補齊後改寫）；批次 0 的修復另筆 commit。

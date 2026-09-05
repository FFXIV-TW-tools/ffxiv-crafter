# ffxiv-crafter 健檢報告（2026-09-05・R5）

## 總評：**涵蓋率 5/12 維為完整 fan-out**｜專案體質 **7.5**（涵蓋不完整）· 使用者友善 **7.8**（涵蓋不完整）

> ⚠️ **這一輪的分數帶著涵蓋率前綴，不是漂亮的單一數字。** 12 個維度裡只有 **5 個**（sec-frontend／
> sec-backend／correctness-core／quality／resilience）跑完「reviewer → 獨立 verifier」的完整迴圈；
> 另 7 個（correctness-data／docs-drift／tests-ci／build-release／design-system／perf-ux／ux-flows）
> 因 **fan-out 中途撞到 session 限額**（`You've hit your session limit · resets 2pm`，45 個 agent 中
> 32 個失敗，含全部 retry）而只有**主迴圈親自淺審**。recall 軌 B（關鍵字擴散，7 個 spreadKey）
> 與軌 C 的驗證階段同樣全滅；軌 C 的 reviewer 本身跑完了，其 5 條 findings 有經批次驗證。
> ⇒ **7 個淺審維的分數信心低於另 5 個**，尤其 ux-flows 與 correctness-data 沒有任何獨立探索。
> 補跑方式見計畫檔「批次 R — 補跑未覆蓋維度」。

**較上輪**（2026-08-15，11 維完整）：體質 7.5 → **7.5**（持平，但**維度組成與涵蓋深度都不同，不可直接相減**）／
使用者 7.2 → **7.8**。使用者分的上升有實測支撐：本輪線上量到 CLS 最差 **0.0395 @560px（載入期全 0.000）**、
首訪實際傳輸 **768.5 KB**、DCL **441ms**、計費請求 **0**、console **零 error**、12 個寬度**零文件級橫向溢出**——
前輪點名的「成果默默遺失、假警告、載入期間死按鈕」三件在本輪都查不到回退。

**本輪最重要的訊號**：前輪（2026-08-15）的頭條是「哨兵的檔案清單是手維護的、會漏」。本輪它**以更難發現的
形式復發了一次**——不是清單漏了檔，而是**哨兵的判斷式本身被寫壞成永遠不成立**：

> `tests/first-run-hint-key.test.mjs:47` 的 `/\b(defer|async)\b/` 裡兩個 `\b` 是**字面的 backspace
> 位元組（0x08）**，不是詞界。實測把 `<script src="first-run-hint.js">` 改成 `<script defer src=…>`，
> 哨兵印出「✓ …且為 parser-blocking」並 exit 0；改成 `type="module"` 才會紅（那半條沒有 `\b`）。
> 而 AGENTS.md 與該測試檔頭都明文宣稱它「同時鎖不得 defer／async／module」。
> **三個禁止值裡，最可能被誤改的那一個（`defer` 是常見寫法）正好是抓不到的那一個**，
> 而它守的是載入期 CLS 從 0.0005/0.0011/0.0105 退回 0.044/0.069/0.094 的那一發。

零回饋訊號的程度比前輪那批更高：測試印的是**肯定句**（「且為 parser-blocking」），
而被測的 HTML 上就寫著 `defer`。全 repo 掃過，文字檔只有這一個中招（二進位檔為預期）。

---

## 機械基線（本輪實跑，全綠）

| 項目 | 結果 |
|---|---|
| `node --check` × 15 支手寫 JS | ✅ 全過 |
| `node tools/test-formulas.mjs` | ✅ **654 passed, 0 failed** |
| `node tests/run-all.mjs` | ✅ **4/4 測試檔** |
| `py -3.11 tools/check-actions.py` | ✅ 三個不變量（35==35 Action／BUILD-STAMP 同步／sim-diff 釘 raphael v0.26.2） |
| `cd wasm && cargo test` | ✅ **5 passed**（含 `trained_eye_plan_is_not_padded_by_upstream_durability_bug` 仍紅＝上游未修、workaround 仍需要） |
| `check-test-baseline --repo .` | ✅ 3 個標記全相符（654／35／5） |
| `sh deploy-prepare.sh` | ✅ **連跑 3 次皆「部署輸出就緒：44 個檔案」** |
| **`tools/sim-diff` 引擎差分閘**（~96 萬次施放，不進 pre-commit） | ✅ **沒有清單外的新分歧**；`ALLOWED` 清單內每條都仍出現 |
| **JS 對 Tnze golden 對帳** | ✅ `base_progress`/`base_quality` **3328 組分歧 0**；`hqPercent` **97 格分歧 0** |
| 依賴 | ✅ **零 npm 依賴**（repo 根無 package.json）；Rust 釘 raphael-rs v0.26.2 |
| monorepo 跨 repo 哨兵（crafter 部分） | ✅ 11 支全綠：deploy-surface／domain-migration(0)／handoff-consistency／headers-baseline／timezone／inline-body-reset／favicon／unknown-path-cost／button-taxonomy／cjk-mixed-terms／robots-consistency |

### 線上實測（playwright-core，`https://crafter.xivtc.com/`，2026-09-05）

| 量測 | 結果 |
|---|---|
| CLS（41 個寬度 1920→320，載入期＋互動期，取最差） | **0.0395 @560px（載入 0.0000 ＋ 互動 0.0395）**；`/404` 全 0.000。預算 0.1 內 |
| 首訪 | 78 requests／76 資源；解壓後 7.73 MB、**實際傳輸 768.5 KB**；render-blocking 傳輸 **23.1 KB**（只有 styles.css） |
| navigation | responseEnd 80ms／DCL **441ms**／load **481ms** |
| 計費請求（Pages Functions） | **0**（首頁完全不打後端） |
| 回訪（同 context reload） | 實際傳輸 **12.9 KB**（全 304）；解壓後仍 7.66 MB（＝ **B-021 已否決**的那件事，非新發現） |
| console | **零 error** |
| 橫向溢出（12 個寬度 1920→320） | **零文件級溢出**；超出視窗的只有 `overflow-x:auto` 內的 `.codex-table--fixed`（設計如此）與 portal 共用 `fat-cat.js` 吉祥物（非本 repo） |

**已排除的假象（查過、不是缺陷）**：14 支 same-origin script 在 Resource Timing 各出現 2 次，第二次是
`initiatorType:'fetch'`／`transferSize:300`／`decodedBodySize:0` 的 304 —— 來源是 portal 共用
`version-check.js` 開機時 HEAD 所有 same-origin `script[src]` 記 ETag，**刻意設計**（它已為 2026-08-04
額度事故避開頁面路徑）。

---

## 維度評分

### 專案體質視角

| 維度 | 分數 | 深度 | confirmed | 一句話 |
|---|:---:|:---:|:---:|---|
| sec-frontend | **8.5** | 完整 | 3（low×2＋info） | 40 處注入點逐一比對 `esc()` **零真實破口**；`esc()` 五字全含非半套；扣分只在「唯一未轉義的 `src=${iconUrl()}`（18 處）全靠一條 regex 擋而測試一律 stub 掉它」 |
| sec-backend | **8.5** | 完整 | 3（medium＋low×2） | 184 行後端面小而紮實：service binding fail-closed、白名單預設關閉、301 的 Location 走編碼過的 pathname、無 secret、不反射上游訊息。最重的一條不是漏洞，是 301 把首頁挪進帳號級計費額度 |
| correctness-core | **7.5** | 完整 | 4（medium×3＋low） | 世代守衛與 worker 生命週期站得住；三條 medium 全是「改了 A 沒有連動 B」的同一形狀 |
| correctness-data | **8.0** | ⚠️ 淺審 | 0（主迴圈未發現） | `build-data.py` 的 fail-closed 實查成立（`PROBLEMS` 累積 → `sys.exit(1)`，缺件檔維持舊內容）；四個 ratchet 都是帶實測值的 `>=` 斷言；引擎差分與 golden 對帳全綠。**但無獨立探索** |
| resilience | **7.5** | 完整 | 5（high→medium ＋ medium×2 ＋ low×2） | 三條失敗路徑大致收得住；扣分在「選配資料載入失敗」被當成「品項下架」而清掉玩家偏好 |
| quality | **7.5** | 完整 | 7（全數 verifier 降為 low/info） | 12 層模組 pattern 一致；債集中在「依賴注入契約只有 7/12 層在 init 驗證」與「行數鐵則的機械閘看不到 `.mjs`」 |
| **tests-ci** | **6.0** | ⚠️ 淺審 | 3（主迴圈自查） | **本輪最低**。哨兵判斷式被寫死成永遠不成立（0x08）／T49 涵蓋率閘下限寫 `>=11` 而實際 12 支／`test-formulas.mjs` 3129 行遠超 2000 紅線但 gate 3 看不到 `.mjs`／**無 CI**（repo 無 `.github/`） |
| docs-drift | **6.5** | ⚠️ 淺審 | 3（主迴圈＋軌 C） | AGENTS.md:86 的散文宣告 653 vs 實測 654（第二事實源已漂）／AGENTS.md 已長回 36,911 B 而 R7 豁免的立論是「28.3KB、再砍就是刪紅線」——**而 gate 5 每次都在印這行警告，只是被當成已豁免而略過**／index.html 的成本論證註解與 2026-09-02 的 301 改動矛盾 |
| build-release | **7.0** | ⚠️ 淺審 | 2（主迴圈＋軌 C） | 部署面 fail-closed 本輪實跑仍有效（3/3 綠、44 檔）；扣分在 `.deploy-filelist.tmp` 自鎖與 `THIRD-PARTY-NOTICES.md` 線上 404 |
| design-system | **7.5** | ⚠️ 淺審 | 1（主迴圈） | styles.css **零 local 重刻 `.codex-*` 基礎元件**（只消費，53 處引用）；扣分只在 22 處硬編色彩字面量（`#03060c`×9／`#7dd87d`×8／`#4ec9d0`×1） |

### 使用者友善視角

| 維度 | 分數 | 深度 | confirmed | 一句話 |
|---|:---:|:---:|:---:|---|
| perf-ux | **8.5** | ⚠️ 淺審（但有完整機械量測） | 0 | 前兩輪把首載鏈處理乾淨後，本輪線上量測全面良好：CLS 0.0395、傳輸 768 KB、DCL 441ms、render-blocking 23 KB、回訪 12.9 KB、零 console error、零橫向溢出 |
| ux-flows | **7.0** | ⚠️ 淺審 | 2（自其他維借調） | 兩條使用者側最痛的都不是新功能的問題，而是**畫面對玩家說了與事實相反的話**：吃了藥已達標卻仍紅字寫「還差 380」；一次網路抖動把食藥偏好清掉且只有 console 一行 warn |

**權重**（沿用前輪以利比較）：體質＝安全 0.25／正確性 0.30／韌性 0.15／品質 0.10／測試 0.10／文件 0.10
＋可選維 build-release 0.10／design-system 0.10，權重和 1.20 重新正規化 → **7.5**。
使用者＝perf-ux 0.50／ux-flows 0.50 → **7.8**。

> **跨維度合併揭露**：`craftPlan` 死碼＋鑽石依賴重複計數同時被 `correctness-core`(A3) 與軌 C(A2) 報出，
> 是**同一個缺陷**；歸戶給 correctness-core，軌 C 那筆不重複計分。
> `settings-api` 白名單的百分比編碼穿越同時被 `sec-frontend`(A1) 與 `sec-backend`(A3) 報出，同法處理。
> `AGENTS.md` 基線數字漂移同時被主迴圈與軌 C(A3) 報出，歸戶 docs-drift。

---

## 須修改（依嚴重度）

| # | 維度 | 嚴重度 | 項目 | 拍板？ |
|---|---|:---:|---|:---:|
| **M1** | tests-ci | **medium（本輪頭條）** | `tests/first-run-hint-key.test.mjs:47` 的 `\b` 是字面 0x08 ⇒「不得 defer／async」那半條哨兵是死的 | 不需 |
| **M2** | correctness-core / ux-flows | **medium** | 改食物／藥水後「最低能力要求」紅字與求解鈕狀態不刷新 —— 已達標卻仍寫「還差 380」 | 不需 |
| **M3** | resilience / ux-flows | **medium** | `meals.json`／`medicine.json` 載入失敗被當成「品項下架」，把玩家保存的食藥偏好清空 | 不需 |
| **M4** | build-release | **medium** | `THIRD-PARTY-NOTICES.md` 在 `deploy-deny.txt` ⇒ 線上 404，而被服務的 `LICENSE-MIT.txt:4` 正指向它（MIT 著作權宣告義務） | 不需 |
| **M5** | build-release | **medium** | `.deploy-filelist.tmp` 自鎖：非正常結束留下該檔後每次 build 都失敗，且訊息叫人「加進 deploy-allow.txt」（照做＝把暫存檔加進部署面） | 不需 |
| **M6** | docs-drift | **low** | `AGENTS.md:86` 散文宣告 `test-formulas` 653，實測與標記皆 654（第二事實源）；`run-all` 那一項完全沒有機械對帳 | 不需 |
| **M7** | correctness-core | **medium** | `opt-adversarial` 的保存偏好會被 expert 配方靜默吃掉（T43 修法只套到 `SPEC_GATED_IDS` 兩個 id） | 不需 |
| **M8** | resilience | **medium** | `AbortSignal.timeout` 無 feature detect ⇒ 舊瀏覽器整站死在一個永遠無效的「請重新整理」 | 不需 |
| **M9** | correctness-core | **medium** | `craftPlan` 生產端零呼叫點（死碼）且鑽石依賴重複計數（實測 W 應為 4 卻算成 6），而 T51 的 8 條 golden 全是樹狀、剛好避開 | **需**（刪或修） |
| **M10** | docs-drift | **medium** | `AGENTS.md` 已長回 **36,911 B**，R7 豁免（到期 2026-11-16）的立論「已砍到 28.3KB、再砍就是刪有效紅線」已被證偽 | **需** |
| **M11** | quality | **medium** | `app.js` 547／`styles.css` 787／`tools/build-data.py` 509 都跨過 500 行 review 閘門，本區間各被改 6／15／3 次而無拆分紀錄 | **需** |
| **M12** | sec-backend / resilience | **medium** | 2026-09-02 的 301 改動把 `/` 與 `/index.html` 挪進 Pages Functions ⇒ 每次開頁一次帳號級計費 invocation，且首頁無降級路徑 | **需**（跨 13 站） |
| **M13** | tests-ci | **low** | `test-formulas.mjs` 3129 行遠超 2000 紅線，但 pre-commit gate 3 只看 `.js` 不看 `.mjs` | **需**（跨 repo hook） |

## 建議（不入庫，報告即承載體）

- **sec A2**：`iconUrl()` 的白名單 regex 是 18 處未轉義屬性內插的唯一防線，而測試一律 stub 掉它；
  加三條純函式斷言（惡意輸入回 `''`）成本極低。順帶把 AGENTS.md 那句理由從「來源可信」改寫成
  「`iconUrl` 已白名單化，放寬它就必須同時補 `esc()`」。
- **sec A1／A3**（同一條）：`settings-api` 白名單先正規化再比對只擋字面 `../`，`%2f..%2f` 會穿到上游；
  今天不成立是靠上游的 uuid regex，不是靠本檔。測試補編碼形案例。
- **sec-backend A2**：`_headers` 對 Function 回應不生效 ⇒ settings-api 的使用者資料回應沒有安全標頭，
  而哨兵只量 `_headers` 檔。
- **quality A1**：依賴注入契約只有 7/12 層在 init 驗證，未驗證的 5 層契約只寫在註解且已兩處對不上。
- **quality A4**：`test-formulas.mjs` 內 28 份手刻 vm sandbox，其中 4 份 DOM stub 工廠逐字重複。
- **quality A5**：2026-08-15 的死 proxy 清理沒做完（`app.js:174 renderIngredients`／`:220 updateInitial`）。
- **quality A6/A7**：7 個保存點有 1 個只 `console.warn` 沒 toast；T6 靜默-catch 哨兵掃不到 `functions/`。
- **resilience A4/A5**：`index.html` 交接腳本 3 個空 catch（鐵則違反，但哨兵只掃 repo 根 `.js`）；
  `vendors.json` 失敗 → 商人徽章靜默消失。
- **design-system**：22 處硬編色彩字面量繞過 token。
- **correctness-core A4**：T49 涵蓋率閘下限 `>=11` 而實際 12 支，容許一支分層檔靜默掉出掃描。

---

## 亮點（誠實列出）

- **求解正確性有兩道獨立的外部對帳，本輪雙雙全綠**：`sim-diff` 拿兩顆零共用程式碼的引擎隨機走訪對打
  ~96 萬次施放**無清單外新分歧**；JS 端對 Tnze golden 的 `base_progress`/`base_quality` **3328 組分歧 0**、
  `hqPercent` **97 格分歧 0**。這種等級的外部驗證在個人專案裡罕見。
- **`ALLOWED` 清單裡每條都仍會出現**，包含「上游把神速技巧耐久寫死 10」那條——代表我方 workaround
  仍然必要，而不是變成無人知道何時失效的殘留。
- **零 npm 依賴**（repo 根連 `package.json` 都沒有），供應鏈面近乎為零。
- **注入面實測乾淨**：40 處 innerHTML 逐一比對後零真實破口，`esc()` 五字全含。
- **部署面 fail-closed 仍然有效**（允許清單、44 檔、3/3 綠），且與 marketboard 不同，本 repo 的
  `deploy-prepare.sh` 在 Windows 上**不會間歇失敗**。
- **前輪 12 項批次 0 修復 ＋ B-025〜B-031 七條全部收官，本輪逐一查證零回退。**
- 線上使用者體驗量測全面良好（見上表），且 `first-run-hint` 的 CLS 修法經瀏覽器實測確認生效
  （`display=flex` 在首次繪製即定案）。

---

## 誤報／校正

| 項目 | 處置 |
|---|---|
| 「14 支 script 每次開頁被抓兩次」 | **主迴圈自查後撤回**：第二次是 portal `version-check.js` 的 ETag HEAD，刻意設計 |
| 「`fat-cat` 元素在窄屏溢出視窗」 | **撤回**：來自 portal 共用 `fat-cat.js`，非本 repo 範圍 |
| 「`docs/health-reviews/` 下有怪目錄 `"docs`」 | **撤回**：git 對非 ASCII 檔名加引號的顯示形式 |
| 軌 C A1（授權宣告未發佈）verifier 降為 **low** | **主迴圈上調回 medium**：MIT 要求著作權宣告隨副本散布，而 `LICENSE-MIT.txt:4` 明白指向一個 404 的檔；AGENTS.md 鐵則 10 自己就寫「頁尾只寫授權名稱不算」 |
| 軌 C A4（`.deploy-filelist.tmp`）verifier 降為 **low** | **主迴圈上調回 medium**：不只是「build 會失敗」，而是**錯誤訊息指向錯的修法**——照著做會把暫存檔加進 `deploy-allow.txt`＝擴大部署面 |
| quality 七條全被 verifier 降為 low/info | 採用降級後的嚴重度；但 A2（500 行閘門）在主迴圈另有獨立量測（453→547／606→787），以 M11 列入須修改 |
| resilience A1 verifier 判 **partial** | 採用 `correctedSeverity: medium`。partial 的理由是「不會**立即**寫回 localStorage」——但下一次任何 `save()`（HQ 勾、`<details>` 開合）就會寫入，故仍列須修改 |

### 驗證品質（判 verifier 是否橡皮圖章）

- refuted **0** 條、partial **4** 條、降級 **11** 條（quality 7 條 medium→low/info、sec-backend A1 medium→low、
  軌 C A1 high→low、A2 medium→low、resilience A1 high→medium）。
- 降級率 11/27 ≈ 41%，高於前三輪（18–23 條／輪、更多維度）。**這是 reviewer 灌水而非 verifier 橡皮圖章**
  的訊號：本 repo 規模小（3.9k 行手寫碼），reviewer 為湊滿 findings 傾向把「可以更好」寫成 medium。
- **主迴圈親自複驗 4 項**：correctness-core A1（✅ 成立，機制與 agent 描述一致）／resilience A1（✅ 成立）／
  軌 C A1（✅ 成立，**上調嚴重度**）／軌 C A4（✅ 成立並實測重現，**上調嚴重度**）。
- **主迴圈另做突變測試 15 組**（在 repo 副本上，不動工作樹）：T53／T49／T54／T59／T39／巨集 FULL 與 CHUNK／
  select 寬度預留／settings-api service-binding 紅線／build-data fail-closed／first-run-hint key 與載入時機——
  **14 組轉紅、1 組仍綠**，那 1 組就是 M1。

---

## recall 層

| 軌 | 狀態 | 產出 |
|---|---|---|
| A 註冊表差集 | ✅ 跑完 | `registry-diff.mjs` 差集為空（掃到 17 份登記表／9 個候選／缺席 0）⇒ 無待裁決 finding |
| B 關鍵字擴散 | ❌ **全滅**（session 限額） | 7 個 spreadKey（`crafting-`／`specWanted`／`statShortfall`／`craftPlan`／`renderIngredients`／`saveWarned`／`REQUIRED`）一個都沒跑 |
| C 零-context | ⚠️ reviewer 跑完、驗證階段全滅 | **5 條 findings，其中 2 條是維度 fan-out 全集沒有的**（軌 C A1 授權宣告未發佈、A5 角色數值型別防線只在顯示端）⇒ **本輪軌 C 有效** |

> 軌 C 的 A1 是本輪唯一由「減先驗」抓到的合規面缺陷——維度 fan-out 的 sec 兩維都把授權當非安全議題略過，
> build-release 又沒跑到。**這一條單獨支持軌 C 續跑。**

---

## 主迴圈自查與方法論備註

- **本輪發生撞車**：另一個 cwd 在 `ffxiv-tw-marketboard` 的 session 收到逐字相同的 `/goal`，
  兩邊同時起了 R5 健檢。經 Owner 裁示 marketboard 歸該 session，本 session 改審自己的 cwd。
  已把本 session 獨有的線上量測（marketboard 的 CLS 與請求量測）以 cross-session message 交接過去。
- **本輪的 fan-out 不完整是資源限制，不是判斷**。7 個未覆蓋維的補跑指令與快取續跑方式寫在計畫檔批次 R；
  `resumeFromRunId` 可讓已完成的 13 個 agent 直接吃快取，只重跑失敗的。
- **工作樹在 fan-out 期間未被寫入**：Scout 快照為 `clean` ＋ 行尾基線 29 筆（`w/crlf`）；
  收尾實測 `git status` 只剩本報告自己這一個 untracked、`git ls-files --eol | grep -v w/lf`
  仍為 **29 筆** ⇒ **無 agent 污染**（前輪 portal 曾發生 fan-out agent 改寫被審檔行尾的事故，
  本輪的 `READ_ONLY_RULE` 有效）。
- **突變測試在 repo 副本上進行**（`scratchpad/mut`），全程未動工作樹——因為 fan-out agent 正在讀 repo，
  當場突變會讓後批 reviewer 把我的突變當成 repo 的 finding 報上來。

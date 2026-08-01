# ffxiv-crafter 健檢報告（2026-08-01）

> 全維健檢（11 維度）。方法：Workflow fan-out 24 agent（11 reviewer + 13 verifier）＋主迴圈親自複驗。前兩輪為 2026-07-04（9 維）與 2026-07-11 R2（5 維），本輪**新增 3 個從未審過的維度**（build-release / design-system / memory-audit）。

## 總評：專案體質 **7.6** / 10 · 使用者友善 **7.8** / 10 — 內外皆穩，照常維護（涵蓋 11/11 維，無 failed、無 N/A）

較上輪 7.8 → 7.6（體質）／7.5 → 7.8（使用者）。**兩輪 scope 不同，不可直接比**：體質分下降的 0.2 全部來自本輪新納的 build-release（6.5）與 design-system（7.0）兩個從未審過的維度，前輪審過的維度分數全部持平或微升——不是回歸，是盲區被照亮。使用者分的升幅來自 2026-07-29 CLS 修復與流程引導改造確實生效。

一句話定性：**這是一個地基紮實的小工具，剩下的問題集中在「工具鏈與部署面」而非產品本身**。核心公式、轉義紀律、世代守衛三個最該出事的地方經對抗驗證後都乾淨；被扣分的是資料/文件/建置產物之間缺乏機械同步，以及一個真正會產出「玩家按不出來的巨集」的技能前提漏連動。

## 機械基線（主迴圈實跑，非 agent 回報）

| 檢查 | 結果 |
|---|---|
| 審查快照 | `0a42e8b` · working tree **clean** |
| `node --check` × 8 支手寫 JS | ✅ 全過 |
| `node tools/test-formulas.mjs` | ✅ **122 passed, 0 failed**（== AGENTS.md 宣告基線） |
| `py -3.11 tools/check-actions.py` | ✅ 35 Action 變體 == craft-actions.json 鍵，icon 全數有效 |
| `cd wasm && cargo test` | ✅ **2 passed**（parse_action round-trip ／ 名稱唯一） |
| 鐵則機械抽驗 | `title="` 殘留 **0**、空 `catch {}` **0**（鐵則守住） |
| 手寫碼規模 | 2894 行 / 15 檔。單檔最大 `app.js` **506**（破 500 門檻 6 行）、`styles.css` 492 |
| 首載資產 | data/ 未壓 4.9MB（B-005 已實測 brotli 後 536KB、parse ~10ms → 該項已否決，本輪不重報） |
| 突變測試（主迴圈補做） | 移除 `app-browse.js:50` 的 `page = 0` → **122 項仍全綠**（證實 T11 為空殼斷言，見須修改 #3） |

## 維度評分

### 專案體質視角（權重：正確性 .30／品質測試 .15／安全 .12／韌性 .12／建置 .10／設計系統 .10／文件 .07／memory .04）

| 維度 | 分數 | confirmed | 一句話 |
|------|:---:|:---:|------|
| sec-frontend | **9.0** | 3（全 low/info） | 找不到任何 XSS 可達路徑——使用者輸入根本沒有到 innerHTML 的通路；主迴圈 recall 抽查每個模板內插點都過 `esc()`，高分站得住 |
| correctness | **7.5** | 6 | 公式面乾淨（含逐項對照 raphael v0.26.2 引擎原始碼與 best-craft 參考實作）；扣分在專家之證未與兩個技能連動 |
| resilience | **8.0** | 5 | fetch 三路徑與 worker 生命週期收得乾淨；WASM 初始化失敗是唯一不可恢復的死路 |
| quality-tests | **7.5** | 8 | 42 函式零死碼、依賴注入 pattern 一致；但 122 項測試裡混了一條**經實測證明不具鑑別性**的斷言 |
| docs-drift | **7.0** | 8（全 low） | 無 CLAUDE.md 衛生問題（109/9/50 行皆遠低於 200 上限）；問題全是量化宣告陳舊（配方數 5.15 倍誤差、行數、資料量） |
| memory-audit | **7.5** | 5 | 本 repo slug memory 目錄為空＝符合 external 鐵則的**正確設計**（教訓進 AGENTS.md）；父層 2 個 crafter 相關條目有 drift |
| **build-release** 🆕 | **6.5** | 8 | 本輪最低。整個 repo 被當靜態根部署、pkg/ 與 lib.rs 無同步守、build-data.py 不 fail-fast |
| **design-system** 🆕 | **7.0** | 8 | 3 張表手刻重造 `.codex-table`、body 漏 portal navbar offset、emoji 未換 `FFXIVIcons` |

### 使用者友善視角（權重：perf-ux .40／ux-flows .40／a11y .20）

| 維度 | 分數 | confirmed | 一句話 |
|------|:---:|:---:|------|
| perf-ux | **8.0** | 5 | 前輪 CLS 修復確實生效；剩下是 preconnect 漏 xivapi、meals/medicine 多排一輪 RTT 等小額 |
| ux-flows | **8.0** | 7 | 流程引導三步軸有效；最痛的是食藥選單在手機被裁掉、以及巨集沒有復述前提條件 |
| a11y-compat | **7.0** | 8 | 自繪 listbox 的鍵盤契約大致完整，但焦點不可見（`outline:none`）＋求解計時每秒轟炸 aria-live |

## 前輪追蹤

前兩輪（2026-07-04／2026-07-11）的**須修改項全數已修且無回歸**，本輪逐一確認：

| 前輪項 | fate |
|---|---|
| M1 專家之證 CP+15 | ✅ 已修（T1 金鎖守住）。**但本輪發現同一顆勾選框還漏了第二層連動**——見須修改 #1 |
| sec A1 `g.level` 裸插 self-XSS | ✅ 已修（`Number()` 二次收斂，本輪 recall 抽查確認） |
| sec A2 saveGear 空 catch | ✅ 已修。**但同檔 `loadGear` 的靜默 catch 仍在**——見須修改 #8 |
| quality A1 公式零 JS 測試 | ✅ 已修（29→122 tests）。**惟其中一條為空殼**——見須修改 #3 |
| UX A1/A2/A3 求解等待回饋 | ✅ 已修且有效（本輪 ux-flows 8.0） |
| 2026-07-29 CLS 修復 | ✅ 已修（588px→≤1px）。**該輪 CHANGELOG 留下的 `body`/`#ftw-main` 懸案，本輪找到根因**——見須修改 #4 |

## 須修改項目（必做）— 真缺陷，按風險排序

1. **[專案·correctness · medium]「專心致志」「快速改革」未與「專家之證」連動 → 產出玩家按不出來的巨集**
   `app.js:323-325` 的 `use_heart_and_soul` / `use_quick_innovation` 直接讀勾選框，完全不看 `$('specialist').checked`（主迴圈 grep 確認：`specialist` 只出現在 app.js:271/280/453，computeSettings 內零引用）。`index.html:182/185` 的說明文字自己寫著「需專家之證」，但沒有任何 gating。玩家沒插專家之證卻勾了 → 巨集裡出現 `/ac "專心致志"`，貼進遊戲那一行直接失敗。**這正中本工具最痛的失敗模式（浪費昂貴素材）。**

2. **[專案·build-release · medium] 整個 repo 被 CF Pages 當靜態根部署，且 `CHANGELOG.md:32` 把已修掉的建置者帳號名重新公開**
   verifier 實測 `https://ffxiv-crafter.pages.dev/AGENTS.md` 回 200 正文；repo 無 `.cfignore`／無 build output 設定 → `git ls-files` 全部 50 檔上線，含 `docs/health-reviews/*`（歷次弱點清單）、`tools/*.py`、`wasm/src/lib.rs`。更諷刺的是 2026-07-28 花一輪把 `pkg/*.wasm` 裡 39 條 `C:\Users\shawn_lin\.cargo\...` 清成 0，**但記錄這件事的 CHANGELOG 本身帶著那個字串、部署在同一網域**（主迴圈親自 grep 確認）。無憑證外洩，實害是架構與本機路徑暴露。

3. **[專案·quality-tests · medium] T11「篩選變更 → 回第 1 頁」是空殼斷言（主迴圈突變測試證實）**
   我把 `app-browse.js:50` 的 `page = 0` 刪掉後跑測試：**122 passed, 0 failed**。也就是說這條斷言不管邏輯在不在都會綠。這比「沒有測試」更糟——DEVLOOP「測試基線只准升」是建立在斷言真的守得住的前提上，空殼斷言讓基線數字虛胖。

4. **[使用者·design-system · medium] `body` 缺 `padding-top: 64px` → 跨網域 header.css 晚到造成首屏下推位移**
   `_DESIGN-SYSTEM.md:40` 明載：header.css 走**跨網域** CDN、比子工具同源 CSS 晚到，子工具必須同源自帶同值預留才能消除該 race，並附 2026-07-02 field data（portal 首頁曾 63% poor）。主迴圈確認 `styles.css:12-20` 的 body 規則完全沒有 padding，姊妹工具 tw-bis／macro-builder 有寫。**這正好解釋 2026-07-29 CLS 修復輪留下的懸案**（CHANGELOG 記「`#ftw-main`／`body` 各 1 次高分位移，來源不在本工具…若持續出現要回 portal 層查」——不必回 portal，是本工具漏寫）。

5. **[使用者·perf-ux ＋ 專案·correctness · medium] 在「角色數值」分頁打一個字，會清空已填的 HQ 素材數量與目標品質**
   `onGearInput()`(app.js:114-121) → `refreshSelectedGear()`(app.js:176-222) 無條件重繪素材區與目標品質欄。玩家調完 HQ 素材後回頭改一個數值，設定就默默沒了，而且不會有任何提示——**成果默默遺失**是使用者視角最忌諱的一類。（本項在 correctness 與 perf-ux 兩維各被獨立找到，同根因已合併。）

6. **[使用者·ux-flows ＋ a11y · medium] 食物／藥水自繪選單固定 400px 寬，在 <1018px 視窗與所有手機上被 `.codex-tablet` 的 `clip-path` 裁掉右半**
   `styles.css:309-310` 固定 `width: 400px`，容器是 `index.html:122` 的 `section#config-panel.codex-tablet`。被 clip-path 切掉的部分**無法捲動找回**。食藥加成直接影響求解結果，手機玩家等於選不了。（兩維獨立找到，同根因已合併。）

7. **[專案·resilience · medium] WASM 引擎初始化失敗＝永久不可恢復，且錯誤訊息把玩家導向錯誤方向**
   `worker.js:4-16` ＋ `app-solve.js:57-76`：引擎載入失敗（網路中斷／pkg 404／瀏覽器不支援）後沒有重建路徑，且錯誤被 `solveErrorMessage` 當成求解失敗來措辭，會叫玩家去調設定——但問題根本不在設定。玩家只能自己重整，而站上不會告訴他。

8. **[專案·resilience ＋ quality · medium] `loadGear` 是全 repo 唯一的靜默 catch，角色數值損毀時無聲清空**
   `app.js:80` 的 catch 不 log、無型別驗證（對照 `crafting-list.js:62`／`app-consumable.js:23` 都有 `console.warn`）。違反「`except: pass` 禁止」鐵則的字面。更關鍵：前輪才修過同檔 `saveGear` 的空 catch，**哨兵 T6 只掃 app.js 且只認「空 catch」**，所以這個「有 body 但不 log」的漏網之魚掃不到。

9. **[專案·build-release · medium] `pkg/` 產物與 `wasm/src/lib.rs` 無同步機械守 — 改引擎忘了重編，四道閘全綠而線上跑舊 WASM**
   `check-actions.py:28-33` 只比對 `lib.rs ↔ craft-actions.json`，完全不看 `pkg/`。`cargo test` 測的是 host target 原始碼、不是部署的 wasm 二進位。也就是說改了引擎、忘記跑 `build-wasm.ps1`、commit 上去——VERIFY 四項全綠，玩家拿到的是舊引擎的巨集。

10. **[使用者·a11y · medium] 求解計時每秒重寫 aria-live 區 → 螢幕閱讀器連續播報數十次**
    `app-solve.js:42-53` 的 `startSolveClock` 每秒改寫 `#solve-status`（`index.html:209` 宣告為 live region）。求解可能數十秒 → 整段等待期間閱讀器持續播報，使用者無法聆聽或操作其他內容。秒數節點應 `aria-hidden`，只讓狀態變化播報。

11. **[使用者·a11y · medium] 自繪 listbox 選項 `outline: none` 且焦點樣式與 hover 相同 → 鍵盤看不出選到哪一列**
    `styles.css:316`；鍵盤導覽本體 `app-consumable.js:119-134` 是逐項 `focus()` 的，焦點不可見等於整套鍵盤操作作廢（100+ 筆食藥清單）。同時違反設計系統「禁 `outline: none`」鐵則。

12. **[專案·memory-audit · medium] `external.data-cache-must-revalidate.md` 的「How to apply」指向的模板實際沒有 `/data/*` 行**
    memory L27 寫「新工具接 portal 時照 `_NEW-TOOL.md` 模板寫」，但模板裡沒有該行 → 這條規則的機械化落空，下一個新工具會再踩一次（這條 memory 本身就是「第二次踩到才寫」的產物）。

## 建議修改項目（可選）

### 文件 drift（全部 low，但量大且會誤導）
- `README.md:27-30` **重建 WASM 照抄必失敗** — 寫 `cd wasm` 後跑 `-File tools/build-wasm.ps1`，但 `wasm/tools/` 不存在（主迴圈實測）。失敗後的自然退路正是被明令禁止的裸 `wasm-pack`。ROI 高、一行改。
- `AGENTS.md:80`「104 個 expert 配方」**實際 536 筆**（5.15 倍誤差，換資料源後未更新）
- `AGENTS.md:5` 規模依據失真：宣告「~1.6k 行分佈 10 檔」，實際 11 檔 2516 行
- `AGENTS.md:29` 宣告 app.js「500 行」實際 **506** — 剛好把「已越過拆分閘門」寫成「恰好合規」（主迴圈實測）
- `AGENTS.md:98 vs :103` DEVLOOP 摘要自相矛盾：一邊「本 repo 不另立 specs/」一邊「spec 放 docs/specs/」
- `AGENTS.md:43` `_headers` 描述漏 `/data/*`（2026-07-29 才改的）— 與 memory-audit A3 同一項
- `AGENTS.md:42` tools/ 列漏 `build-wasm.ps1` 與 `test-formulas.mjs`（本 repo 第二大手寫檔、且都是 VERIFY 關鍵）
- 資料量數字全面陳舊：AGENTS「3.5MB」實際 4.28MB、BACKLOG B-005「~4.8MB」實際 7.28MB、`app.js:462` 註解「11803 筆」實際 13874

### 品質 / 可維護性
- `app.js` **506 行破門檻**（已知債 B-002/B-007 兩輪拆分後又漲回）— agent 附拆分候選：`app-gear.js`（gearsets/localStorage/驗證）／`app-formula.js`（computeSettings/recipeMaxes/applyConsumables）
- `isCrystal` 兩份平行實作（`app.js:229` 與 `crafting-list.js:83`），規則與 regex 各寫一份且兩份都無測試
- 依賴注入契約驗證只做 3/6 層；app.js 對 CraftSolve/CraftRender 軟檢查後無條件解參
- `#results` / `#results-placeholder` 顯示狀態由三層共管、無單一 owner，流程狀態機把它當狀態真相讀回
- 註解／文件與碼不同步 5 處（含已不存在的識別字）
- `correctness A3` 角色等級欄無上界：輸入 101~255 會關掉等級懲罰並誤開精修之眼（要打錯字才會中，故列建議；但屬「算錯巨集」家族，修法極廉價＝一個 `Math.min(100, …)`）
- `correctness A5` 「← 返回配方列表」不作廢飛行中求解，與 `app-solve.js:111-113` 註解宣稱的覆蓋範圍不符
- `correctness A6` 引擎硬失敗（Rust panic/OOM）後未重建 worker，同一 WASM 實例被繼續重用

### 建置 / 部署
- `build-data.py:131-139` 缺來源只印 ⚠ 後續跑，以 exit 0 產出半殘資料
- `build-data.py:74` `item_lookup.sqlite` 缺存在性檢查 — `sqlite3.connect` 會在 monorepo 權威路徑造 0-byte 幽靈 DB
- `wasm/rust-toolchain` 只寫 `channel="nightly"` 未 pin 日期、未宣告 wasm32 target → WASM 重建不可重現
- `pkg/.gitignore` 內容是 `*`（wasm-pack 自動產生）→ 新產物檔會被靜默忽略
- `build-wasm.ps1:27-31` 外洩驗收只比對字面、大小寫敏感、只掃 `.wasm`

### 設計系統
- 3 張表手刻重造 `.codex-table`（`styles.css:137-150/421-427/443-459`），且 `.rt` sticky 表頭踩中共用層 B-033 已修掉的 `border-collapse` 坑
- 行內附屬動作鈕用 `.codex-btn--icon`（38px 主控件）而非 `.codex-icon-btn`，已被迫本地覆寫尺寸
- 功能性 emoji（📋✕↗）未消費已升格的 `window.FFXIVIcons`
- `copyText`/`fallbackCopy` 與 `window.FFXIVClipboard.copy` 平行實作
- 3 處繞過 token 的硬編值（rgba 斑馬紋／`border-radius: 4px`／`--lh-tight` fallback 1.2 vs token 1.15）
- 28 個 class 未通過 design-lint R7 命名所有權（16 個 bare class，含與 `.codex-chip` 撞名的 `.chip`）
- 11 處自訂 font-size 繞過 typography utility（值都用 token，無 scale 漂移風險）

### 效能 / UX / a11y
- `loadData` 把 meals/medicine 排成第二輪 await — 白等一個 RTT 換 2.5KB
- 首屏 129 顆 icon 走 `v2.xivapi.com` 但只 preconnect 了 portal（**同 portal 四個姊妹工具都有做，crafter 是唯一漏的**）
- `loadData` fetch 無逾時：網路 stall 時「📦 載入配方資料中…」永遠停著，無錯誤無重試入口
- 結果區沒有復述「這段巨集的前提條件」（食藥／專家之證／HQ 素材忘了帶就做失敗）
- 角色數值只驗「有沒有填」不驗「合不合理」：等級留空預設 Lv100 → 產出玩家還學不到的技能
- 全站無 URL/history 狀態：返回鍵直接離站，手機分頁被回收就回第一步
- 求解完成沒有跨分頁通知；缺角色數值時被丟到該分頁但焦點掉了、沒指出要填哪列
- 選單開啟時按 Tab 焦點丟回頁面開頭（不還焦給觸發按鈕）
- 觸控裝置點「＋加入清單」會彈出並滯留說明卡，蓋住鄰近配方列
- 4 處 `scrollIntoView({behavior:'smooth'})` 不受 `prefers-reduced-motion` 影響（portal 全域壓制只涵蓋 CSS 層）
- 配方表每列 `tabindex=0` → 鍵盤要按約 120 次 Tab 才走得到翻頁器
- 篩選筆數與空狀態不進 live region；tabpanel 缺 `aria-labelledby`

### 非缺陷・功能建議
- 角色數值無匯出／匯入：換裝置或清快取就得重填 9 列 × 4 欄
- 製造清單儲存失敗只有 `console.warn`，玩家不知道清單不會被保存

## 誤報 / 校正

對抗驗證統計：**confirmed 65 / partial 6 / refuted 0 / 無 verdict 0**。

零 refuted 觸發 rubric 的橡皮圖章警戒，主迴圈依規加倍抽驗，結論是**verifier 沒有失職**——它們改以 `correctedSeverity` 大幅下修而非 refute：

| 校正 | 內容 |
|---|---|
| high → medium ×2 | correctness A1（專家之證連動）、build-release A1（部署面）——兩者都真實，但 verifier 正確指出需要使用者主動勾選／實害限於資訊暴露 |
| medium → low ×11 | 主要是 docs-drift 全部 5 項與 correctness A2/A3/A4、quality A3/A4 |
| low → info ×2 | sec A2（noopener）、design-system A7（命名所有權） |
| partial ×6 | sec A2 標題「共 4 個出口」與自身 evidence 矛盾（實為 6 處，計數錯誤）；sec A3 誤讀「資料只存本機」語境（原文已限縮在該面板）；perf-ux A2/A4、ux-flows A2、a11y A4 為靜態推斷被降 |

**主迴圈親自複驗 4 項**（皆成立）：correctness A1（grep 確認 computeSettings 零引用 specialist）、build-release A1（grep 確認 CHANGELOG:32 含帳號名）、design-system A2（讀 `_DESIGN-SYSTEM.md:40` 與 header.css:365 仲裁 reach claim，並對照 5 個姊妹工具）、quality A1（突變測試實證）。
**主迴圈 recall 反例抽查**（針對 9 分的 sec-frontend）：列出全部模板內插點逐一檢查，動態字串全部過 `esc()`，未發現 reviewer 漏掉的 XSS 面 → 高分成立。

**已拍板取捨無一被重報**——CSP `unsafe-inline`、B-005 JSON 大小、B-008 icon 木工版、expert 警語、求解計時不殺 worker 全部沒有出現在 findings，CONTEXT 的取捨清單有效。

## Memory / 文件稽核

**本 repo slug 的 memory 目錄為空 ＝ 正確設計，不是缺口**（agent 正向確認）：`external/CLAUDE.md` 鐵則要求教訓寫進該 repo 的 `AGENTS.md`（進 git、跨機、cd 進去自動載入），不另寫 per-cwd memory。**建議維持**。

父層 `C--FFXIVProject/memory/` 的 crafter 相關條目（**刪／改一律待 shawn 確認，未自動處理**）：

| 檔 | 問題 | 候選處置 |
|---|---|---|
| `external.data-cache-must-revalidate.md:27` | How to apply 指向的 `_NEW-TOOL.md` 模板實際沒有 `/data/*` 行 → 機械化落空 | **補模板**（列入須修改 #12），memory 本身保留 |
| `external.data-cache-must-revalidate.md:19` | 「（見下）」是斷鏈引用，實質內容在 crafter CHANGELOG | 改成指向 CHANGELOG 的明確連結 |
| `external.audit-followups.md:11` | Analytics-A 待辦已完成卻仍掛著（線上實測反證） | **刪該項**（連帶 `MEMORY.md:33` 描述） |

CLAUDE.md 衛生**無問題**：AGENTS.md 109 行／CLAUDE.md 9 行／README 50 行，皆遠低於 200 行上限，無內容錯置、無跨層冗餘。CHANGELOG 332 行可考慮歸檔 2026-06 以前段落（純建議，非缺陷）。

## 既有設計亮點

**專案體質**
- **轉義紀律 100%**：主迴圈逐點 recall 抽查全部模板內插，動態字串無一例外過 `esc()`；URL 內插另有 `Number.isFinite` 與 `^/i/(\d{6})/(\d{6})\.png$` 白名單正則雙層收斂。這在 vanilla JS + innerHTML 的專案裡很罕見。
- **公式面經得起引擎級對照**：agent 為了驗證不只讀本 repo，還去讀了 raphael v0.26.2 的 `settings.rs`/`state.rs`/`actions.rs` 與 best-craft 的 `InitialQualitySetting.vue`，確認 job_level 雙重把關與 HQ→初始品質算式一致。找不到會直接算錯數值的公式 bug。
- **求解世代守衛紮實**：過期結果／錯誤幀丟棄全路徑成立（T13 守），這是 worker 型工具最常出事的地方。
- **42 函式零死碼**、依賴注入 pattern（classic script + `globalThis.CraftXxx` + getter 取 live 狀態）跨 6 層一致——這個 pattern 讓 app.js 兩度拆分都做到「既有呼叫點零改」。
- **鐵則真的被守住**：`title=` 0 殘留、空 `catch {}` 0 殘留、35==35 action 不變量、icon 佔位圖不變量——這些都是前幾輪踩坑後固化成機械檢查的成果，本輪零成本重驗全綠。

**使用者友善**
- 前輪 CLS 修復（588px → ≤1px，涵蓋 9 種寬度實測）與流程引導三步軸都確實生效，本輪 user 視角分從 7.5 升到 7.8。
- expert 配方的「試算完成 ⚠」中性措辭是誠實設計——不對隨機製作狀態的配方給假保證。
- 手法 chips 與走查表雙向高亮、食藥選單顯示 icon＋品級＋功效，都是超出「能跑」標準的體貼設計。

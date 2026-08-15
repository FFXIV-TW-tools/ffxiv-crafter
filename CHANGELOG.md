# CHANGELOG — ffxiv-crafter

> 記 root 級 / 跨檔改動與「為什麼」。日常配方資料重建（`build-data.py` 產 data/）不入此檔。格式：新的在上。

## 2026-08-16（六）— 巨集完成提示音 ／ B-030・B-031 ／ AGENTS 瘦身 ／ 標題列被壓垮修正

### 巨集完成提示音（Owner 需求）

每一段巨集結尾都補一行帶音效的 `/echo`：中段「第 N 段完成」（提示還要按下一段）、末段「製作完成」。
先前只有**切段時**才有，單段完全沒有——玩家貼進遊戲後是盯著角色動作跑完的，沒有音效就得一直看著畫面。

連帶的硬限制：遊戲巨集一格上限 15 行，最後一行既然永遠留給 echo，**單段容量就是 14 步不是 15**
（原本 15 步會塞成 16 行＝貼不進遊戲）。T39 擴充：逐一驗 1/13/14/15/16/28/29/40 步的
「每段 ≤15 行」與「總行數 − 段數 == 步數」，兩個突變（容量改回 15、末段文案不分流）各自轉紅。
瀏覽器實測：單段 3 行結尾 `/echo 製作完成 <se.1>`，零 console error。

### 配方詳情標題列被動作鈕壓垮（Owner 回報，附截圖）

進入製作鏈後「← 回『舊日王國寬刃劍』」是第 4 顆動作鈕，把品名擠成一個字寬、直排，三個數值各自折行。
**與 B-029 交付物列同一個形狀**：`.ri-main` 是同列裡唯一能縮的東西，而 `min-width: 0` 讓它可以縮到 0。
修法＝給收縮下限（`flex: 1 1 260px; min-width: min(260px, 100%)`），放不下時**動作群整條換行**
（`.ri-head` 本來就 flex-wrap）＝540 門檻以下的既有版面。
實測（欄寬 618px）：`.ri-name` 27px → **553px**、`.ri-head` 248px → **104px**；
同源 iframe 1400/1018/900/800/700/600/500/430/390/360/320px 十一種寬度**零水平溢出**、品名寬 276–590px。T55 守形狀。

### B-030 資料管線不變量（四項）

- **`build-data.py` 缺上游輸入改 fail-closed**：以前印一行 ⚠ 然後照跑到底、**exit 0**，等於「以為重建了，
  其實 data/ 還是上一輪的舊檔」。改成收集全部缺件、跑完印總表並 exit 1。
  **刻意不在缺件當下中止**——既有的「缺的那份不覆蓋」保留了前一個好狀態，要改的只有「回報成功」。
  端到端實測：scratch 副本缺 meals/medicine → 印出 2 項缺件 + exit 1；正常路徑仍 exit 0。
- **交付數量對帳命中率 ratchet**（T31）：228/290。同檔的 vendors／hq 早就有，唯獨 qty 沒有；
  兩個 fail-open 疊在一起（build 端不當錯誤、前端把未知當 1 份估算）⇒ 採購量整批偏掉而全程零訊號。
- **食藥資料不變量**（T54）：筆數／icon 全中／item id／icon 路徑形狀／繁中品名。產生端查無就寫 None 且照樣 ✓。
- **quality-stages 不變量**（T54）：`src` 的字彙**從消費端 `toQuality` 的原始碼抽出**、再要求資料 ⊆ 它，
  不在測試裡寫死清單。資料端多輸出一種（如 root B-041 的 key 2/3/4/6）時 `toQuality` 走 `return 0`
  → 那一檔靜默從下拉消失。另加筆數、三檔、非負整數、由低到高。

### B-031 CSP 哨兵（只做有增量價值的那一半）

移除 `unsafe-inline` 是**已拍板取捨的再提案**（兩輪判過重報，本輪 verifier 亦降 low）——不做。
做的是 T53：index.html 的可執行 inline script 恰為 2 段。`unsafe-inline` 留著的理由是「head 那兩段
bootstrap 非留不可」，那個理由只在段數不變時成立；加第 3 段時 **CSP 檔一個字都不用改＝零訊號**。

### B-027 結案

DS-02（`.crafter-qt-tag` → `.codex-badge`）／`.consumables`／DS-01（三張表 → `.codex-table`）皆已於
2026-08-15 完成，無剩餘項。

### AGENTS.md 瘦身（B-025 續）

**36.1KB → 28.3KB（−22%）**，照 R7 規定的順序做，**沒有刪任何有效規則**：
- **移除**（第二事實源，會漂移）：規模段的 15 個檔名清單（架構表已有）、架構表與檔頭註解重複的敘述、
  「改 UI 前先 Read `_DESIGN-SYSTEM.md`」與中性容器規則各自的重複段
- **搬移**（敘事）：「為什麼把 check-actions.py／run-all.mjs 併進 canonicalTest」「交接頁測試為什麼不併進 runner」
  「為什麼不能跑裸 `wasm-pack`」「巨集為什麼要有提示音」→ `docs/lessons.md`
- **保留**：所有可執行規則；有測試守的條目改成「規則一行 + 測試編號」，敘事在該測試自己的註解裡

**仍超標 8.3KB → Owner 選 (B) 申請豁免**（2026-08-16）：AGENTS.md 開頭加
`R7-exempt: 2026-11-16 依據：…`。沒選 (A) 的理由寫在戳裡——把「部署面鐵則」段移出常駐層是
**13 個 external repo 的一致決定**（全部內嵌該段且明文要求同步副本），單邊做等於製造分岔，
而且做完約 24.5KB 仍未達標。豁免免掉的是「連續 2 個月稽核超標升級成違規」，
`⚠ R7 …` 警示行照樣印（護欄維持可見是刻意的）。

## 2026-08-15（三）— 製作鏈連動 ＋ 多職業切換（Owner 需求，宇宙探索階段性任務）

**問題**：月球的任務常常是「先做 1，再用 1 的材料做 2」。例：
`統一規格的合金鉚釘(48329)` ← `統一規格的合金(48333)` ×2 ← `宇宙貨箱`。
站上看得到素材清單，卻沒有「去做它、再回來」的路徑 —— 玩家得自己重新搜尋每一層。

**先查清楚兩件事再動手**：
- 48333 沒有品質階段＝純中間材；48329 有 cosmic 三階門檻＝真正要交的。所以這是**一條製作鏈**，
  不是兩個獨立配方。
- 跨站契約已經存在且是刻意的：cosmic 站 `modules/crafter-link.js` 的註解寫明「本站只送**要交的成品**；
  中間素材在 crafter 的原料清單裡看得到，不在這裡重複列一次」⇒ **缺口完全在 crafter 這一側**，
  不需要改 cosmic，也不該把中間材塞進跨站連結。

### 製作鏈

- 可製作的素材列加「⚒ 先做這個 ×N」（N＝需求量 ÷ 該配方一次產幾個，無條件進位）
- 點下去把當前配方**推進返回堆疊**，配方詳情顯示「← 回『統一規格的合金鉚釘』」，一鍵回上一層
- 用堆疊不是 boolean：鏈可能不只兩層。**不在切分頁時清空**（玩家常跳去角色數值補資料再回來），
  只有「返回配方列表」或從配方表另選配方才算放棄
- `craftPlan()` 純函式把整條鏈攤成「底層 → 成品」的步驟。T51 守，含三層 fixture：
  **往下傳的是「做幾次」不是「要幾個」**——中間材一次產 3 個時要 4 個只需做 2 次、底層素材只要 2 份。
  第一版的兩層 fixture 抓不到這個錯（突變測試發現），補三層後才擋得住。

### 多職業切換

**實測 651 件物品有多個配方**，宇宙探索的「統一規格的金屬板」有 **12 個＝全 DoH**。
原本 `RECIPE_BY_ITEM` 只留「先出現者」⇒ 深連結 `?item=` 等於幫玩家選了一個他可能沒練的職業，
他按求解只會被擋在角色數值頁。

- 新增 `RECIPES_BY_ITEM`（item_id → 全部配方）。「取先出現者」現在只用於配方表
- 深連結、製作鏈的「先做這個」一律走 `pickRecipeForItem()`：**優先挑玩家有填數值的職業**，
  都沒填才沿用第一個
- 配方詳情給「也能做：[鍛造][甲冑][金工]」切換列，當前職業 aria-current；沒填數值的標「未填」
  （讓他一眼看出按下去會被擋，而不是按了才知道）。**換職業保留製作鏈**（換的是用哪個職業做同一件東西）

421 → **435 passed**；兩個功能各自突變驗證轉紅。瀏覽器實測：48329 → 先做這個 ×2 → 統一規格的合金 →
「← 回『統一規格的合金鉚釘』」；48251 三個職業切換正常、數值跟著換。

## 2026-08-15（二）— 健檢拍板項執行：B-025〜B-029（385 → 396 passed）

Owner 拍板後執行五項。**其中兩項的量測／查證結果與拍板時的假設不同**，都不是照提案做完就算數的那種。

### B-028 settings-api 代理收窄 — 差一點靜默弄壞雲端設定

提案（沿用健檢 finding 的措辭）寫「本站只用得到 `/u/*` 與 `/health`」。實際去查消費端才發現
**`/u/<uuid>/<docId>` 這條路徑根本不存在**：真實面是 portal `settings-client.js` 的
`SETTINGS_BASE + '/settings/' + uuid`（GET pull／PUT push），而同源站台的 `SETTINGS_BASE`
就是 `location.origin + '/settings-api'`。**照提案寫白名單會 404 掉每一次雲端設定同步，
而畫面上只是「設定沒跟著走」——零錯誤訊號。**

定案：`/^\/health$/` 與 `/^\/settings\/[^/]+$/`；路徑**先正規化再比對**（擋 `/settings/../feedback`
這種爬回根的寫法——不先攤平的話白名單看到的是 `/settings/…`（過）而上游收到的是 `/feedback`）；
清單外回 404 而非 403（不對外界確認上游有沒有那條路徑）；`Origin` 改成**缺席才補**
（無條件覆寫會讓上游那道以 Origin 為判準的閘永遠不觸發＝替第三方漂白）。
測試 +7（含 PUT 正向案例：只驗 GET 的話「白名單擋掉寫入」會溜過去），突變兩種各自轉紅。

⚠️ **部署後要人工確認一次**：本機 dev server 不跑 Pages Functions，且 `localhost` 不在
`SAME_ORIGIN_SETTINGS_HOSTS` 裡 ⇒ 這條路徑**本機無法端到端驗**。推上去後在 crafter 改一個設定、
重整，確認雲端同步正常。

### B-029 職業任務窄屏 — 量測推翻了報告的前提，但抓到更糟的

報告判「手機寬度必然溢出」，verifier 標 partial（靜態推斷）。照 AGENTS 的 SOP 實測 16 種寬度：
**文件層級在任何寬度都沒有水平溢出**。真正的缺陷是 `.crafter-qt-item__src`（徽章＋動作鈕，實測 222px）
是 `flex: 0 0 auto` 不收縮，而品名是唯一能縮的 ⇒ 它吸收全部不足：
截斷從 ≤560px 開始（3/27）、460px 有 11/27、**≤390px 是 27/27 且品名寬度為 0**
——玩家看到「圖 + ×1 + 複製鈕 + 徽章」而**完全沒有品名**，這一列最重要的資訊被犧牲掉。

修法＝窄屏讓 `__src` 落到第二行、品名拿回整行；斷點沿用本檔既有的 **760px**，不發明新數字。
修後複驗 10 種寬度：截斷全為 0、最小品名寬 48–52px，且 800px 以上與修改前逐項相同（無回歸）。T44 守形狀。

### B-026 `check-actions.py` 併入 canonicalTest（Owner 選 A）

`process/fleet.json` 的 `canonicalTest` 加 `&& py -3.11 tools/check-actions.py`，`AGENTS.md` 逐字對照行同步。
它守的三個不變量先前**沒有任何自動入口會跑到**——改引擎、忘記重編、safe-push 全綠，玩家拿到舊引擎算的巨集。
代價每次推約 1 秒；換機缺 `py -3.11` 會以「推不出去」明確失敗，不是靜默略過。
⚠️ `fleet.json` 在 claude-skills repo，那份改動要另外 commit／push。

### B-027(a) `.result-summary` 遷共用中性面板

與共用版幾何逐項相同，屬 2026-08-13 那輪的純遺漏。瀏覽器實測 computed style
（`rgb(3,6,12)`／`1px solid rgb(43,63,86)`／`8px`／`12px`）**與遷移前完全一致**。
**`.consumables` 沒遷、也不該算遺漏**：它是 6px（`--radius-sm`），巢狀在 8px 的 `.cfg-card` 裡用小一級圓角
是合理的設計選擇，遷過去是「視覺會變 2px 的設計決定」而不是補遷 → 留給 Owner。
已加負向哨兵，有人順手統一時 T36 會紅。

### B-025 AGENTS.md 瘦身：43.2KB → 30.6KB（−29%，**未達 <20KB**）

搬走逐輪測試流水帳（單行 6.6KB → `docs/test-baseline-history.md`）、職業任務 HQ／商人的推導證據與
sim-diff 長篇說明（→ `docs/lessons.md`），並把**架構表壓成一句話職責 + 指向檔頭**（9.9KB→6.0KB）。
架構表那項的理由不是省 byte 而是 **DRY**：每支模組的檔頭註解本來就更完整，那張表是第二份事實源——
本輪健檢正好抓到它漂移兩次（`app.js` 行數、`.crafter-qt-list` 類名）外加 `functions/` 整列漏列。

**停在 30.6KB 是刻意的**：剩下的 `工具鐵則` 與 `開發注意` 逐條看過都是可執行規則（「不要改回 X」「新增 Y 要記得 Z」），
再砍就是 DEVLOOP R7 自己警告的「為壓 byte 刪有效規則（護欄非 KPI）」。要繼續降需要 Owner 再拍一次，
選項寫在 B-025 條目裡。

**驗收**：`test-formulas` **396 passed**／`run-all` 2/2／`check-actions` 三項／`deploy-prepare` 40 檔／
`check-test-baseline` 三項相符／`check-devloop-artifacts` 工件格式合格；本輪 4 個新修復各自突變驗證轉紅。

## 2026-08-15 — 健檢批次 0：四個「零回饋訊號」的行為缺陷 ＋ 三段最靠近玩家的程式碼補測試

**為什麼**：全維健檢（11 維／31 agent／對抗驗證）發現**前輪修好的四類問題，兩週內以「新路徑繞過既有保護」的形式復發**。
共同形狀是：畫面完全正常、測試全綠、無錯誤，只有玩家貼進遊戲或關掉分頁才會發現。

### 行為修復（每項先寫會紅的測試 → 修 → 突變驗證）

- **手動指定同步等級會靜默清空已填的 HQ 素材與目標品質**（correctness-core／perf-ux／ux-flows 三維獨立命中同一根因）。
  `CraftSync.onChange` 直呼 `refreshSelectedGear()`，繞過 `refreshGearNote()` 裡「先記成果、重繪後套回並收斂到新上限」那段
  ——而那段正是 B-011 為「改角色數值」那條路修的。→ 改走 `refreshGearNote()`。
  同時補上「**生效 rlv 沒變也要重繪等級同步說明**」：`CraftSync.render` 原本只在 `refreshSelectedGear` 裡被呼叫，
  不補這一刀就會修一個 bug 換一個 bug（面板停在舊等級）。T37。
- **生效 rlv 改變時，品質階段以「絕對品質數字」被保留**。宇宙任務的門檻是**滿品質的百分比**，rlv 一變同一檔就是不同數字
  ⇒ 下拉翻成「自訂」、求解照一個不存在的門檻算。→ 改為保留**檔次**、由新滿品質重推
  （新增 `CraftStages.stageSelection`／`applyStageSelection`，換算仍收斂在該層一處）。
  線上實測：Lv70→Lv90 三階由 1563 正確重推為 **3125**（修復前停在 1563，差一倍）。T38（**含接線層斷言**——
  只驗那兩支 API 的話，把呼叫端改回保留絕對值照樣全綠）。
- **NQ 模式殘留的目標品質產生假的「未達目標品質」警告**。`setTargetMode` 停用欄位但不清值，`render()` 直接讀 `.value`；
  `shortfallHtml` 的註解本來就寫著「NQ ⇒ 不警告」——壞的是接線。→ 以「欄位是否被停用」為準（單一決定者＝`setTargetMode`）。
  順帶把**品質階段下拉一併停用**：原本選了完全不生效，「按了沒反應」比停用更難懂。T39／T14。
- **製造清單與等級同步保存失敗不通知玩家**。六個保存點裡只有這兩個是靜默的 —— 玩家會一路加十幾個配方、關掉分頁才發現整份不見。
  → 一次性 toast（沿用既有慣例，不每次操作都轟炸）。T40。
- **專家之證閘關閉時吃掉玩家保存的偏好**。init 順序是 `loadSolveOpts()` → `refreshSpecialistGate()`，那時還沒選配方
  ⇒ 閘一律關、剛讀回的勾選當場被清掉；之後閘打開也只是「可勾」而不會勾回去 ⇒ 這個偏好**永遠套不回**。
  → 把「想不想用」與「能不能用」分開（`specWanted`），閘關著時存檔也寫回偏好本身。T43。
- **`level-sync.json` 被歸為選配資料，載不到就靜默退回六倍難度**。其他選配載不到只是少一個快捷；
  這一份載不到會讓宇宙探索配方沿用 rlv 690 ＝ Lv70 玩家看到六倍難度，正是 B-016 修掉的病從另一條路回來。
  → 仍不拖垮整站，但**降級要看得見**（明確 toast）。T41 另含對照組：食藥／品質階段載不到刻意不打擾玩家。
- **資料載完前四個分頁按鈕完全沒有事件，而首次使用提示正指著它們**。綁定排在 `await loadData()` 之後，
  慢網路上那是好幾秒。→ 移到 await 之前（`switchTab` 只切 class 與 hidden，不碰資料）。T42。

### 測試網（334 → **385 passed**）

- **靜默-catch 哨兵宣稱掃「全部手寫 JS」，實際只掃 10/13** —— 手打的清單漏了 `app-quests.js`（第二大模組）／`app-gear.js`／
  `app-recipe.js`，而**漏掃的症狀就是全綠**。→ 改為掃描產生，並補「掃到 0 支也算失敗」的涵蓋率閘。
- **巨集組裝與結果渲染先前零覆蓋** —— `renderMacro`（遊戲 15 行硬上限、超過切段補 `/echo`）與 `render()`
  （AGENTS 明訂的 expert 中性措辭、未達標警語）都可以整段刪掉而 334 條全綠。→ 建 render harness 補 12 條。
- **`functions/settings-api` 代理零測試** —— 它自己的檔頭寫著「🔴 改壞了完全沒有訊號」（改成 `fetch(URL)` 會讓
  per-IP 額度變成全站共用），而 `export const __test` 連消費端都沒有。→ 新增 `tests/settings-api.test.mjs`（16 條）。
- **測試 harness 的保真度修正**：`app-level-sync.js` 在真實頁面是 classic script、**早於** `app.js` module，
  T25 的 harness 卻反過來載 ⇒ `CraftSync.init` 從來沒被接上、手動指定等級那條路徑**在測試裡等於不存在**。
  這比沒有測試更危險（測試存在，但測的不是線上那條路）。

### 清理與文件

- 刪三支確認死碼的 proxy（`saveGear`／`gearValid`／`onGearInput`）—— **逐一 Grep 反查全 repo**（含 inline handler
  與字串拼接）後才刪；`anyGear`／`markListState` 有呼叫點，未動。
- 文件 drift 八處：開篇「無後端」（已有兩支 Pages Function）／架構表補 `functions/` 一列／規模 14 檔 2.84k 行 → 15 檔 3.47k／
  `app.js` 424 → 485 行／VERIFY 的 `node --check` 清單改萬用字元（手維護的清單已漏 `app-quests.js`）／
  `.qt-list` → `.crafter-qt-list`／商人涵蓋率同段自相矛盾（172 vs 247）／`CLAUDE.md`＋`AGENTS.md` 移除寫死的 `C:\FFXIVProject\…`
  絕對路徑（違反 external 層明訂的跨機規則）。

**驗收**：`node --check *.js`／`test-formulas` **385 passed**／`run-all` **2/2**／`check-actions.py` 三項／
`deploy-prepare.sh` 40 檔／`check-test-baseline` 三項相符；**突變測試 7/7 皆紅**；
瀏覽器實測（深連結 → 等級同步 → 手動改等級 → 求解 → 巨集 → 四分頁）crafter 自身零 console 錯誤。

**未做（需拍板／需先量測）**：B-025〜B-031，見 [修復計畫](docs/health-reviews/2026-08-15-全維健檢-fix-plan.md)。

## 2026-08-13 — 三個中性分組容器遷共用 `.codex-tint-panel--neutral`（portal B-017d／B3 消費端）

**為什麼**：`.filter-group`／`.cfg-card`／`.cl-card` 三個容器各自在本地寫了一份「8px 圓角＋1px 中性邊＋一種底色」，
而 portal 8/8 已交付 `.codex-tint-panel--neutral` 正是這個形狀的共用版（本站這三個就是它當初的取樣對象之一）。

- 幾何（圓角／描邊／底色）改由共用版提供，底色以 **`--panel-bg` 傳參**：`.filter-group` → `--color-surface-hover`、
  `.cfg-card` → `--color-bg-deep`、`.cl-card` 不傳（共用預設就是 `--color-surface`）。
  **padding 與外距刻意留本地**——共用版的 8/12px 是給資訊盒用的，分組容器要更寬且 `.cfg-card` 上下不等。
- **視覺終態逐項相同**（瀏覽器實測 computed style，非讀 CSS 推論）：底色 `rgb(24,34,47)`／`rgb(3,6,12)`／`rgb(16,24,36)`、
  邊 `1px solid rgb(43,63,86)`、圓角 8px、padding `12px`／`12px 16px 16px`／`16px` 與改動前一致，零 console error。
- **不是 `.codex-card`**：這三個是靜態分組盒，套互動卡會得到「滑過就發光的假按鈕」，且圓角／內距／陰影三項都對不上
  （portal 2026-08-08 否決 `.codex-card--static` 的理由就是這個）。
- T36：三個容器都要掛共用 class，且**本地不得再宣告 `background`／`border`／`border-radius`**。
  守的是回退——寫回去畫面完全正常（值一樣），只是幾何又變成兩份事實源，日後 portal 調 8px 這裡不會跟上。
  突變驗過（拿掉 `.filter-group` 的共用 class ＋ 把 `.cl-card` 的 background/border-radius 寫回本地 → 紅 3 條）。
  316 → **334 passed**。

## 2026-08-12 — 職業任務每列補「複製品名」鈕（走 portal 共用元件）

**為什麼**：查到要什麼之後，下一步幾乎都是把名字貼到市場板或遊戲搜尋框。

- 交付物列與素材列各有一顆複製鈕，用 **portal 的共用元件**：`FFXIVIcons.btnHTML('copy', …)`
  （→ `.codex-icon-btn` ＋內嵌 SVG）＋ `FFXIVClipboard.copy`（secure-context 判斷 ＋ execCommand fallback ＋ toast）。
  **沒有自刻 📋 emoji 鈕** —— portal B-027 就是為了收掉那個（5 個 repo 各刻一份、glyph 四種不一致）。
  Owner 問「market 那個複製按鈕應該要在共用元件內，請確認」→ **確認早就在**（B-027 已從 marketboard 升格），
  本站這次是接上去，不是再造一份。
- 缺 CDN（本機沒開 portal svc）時退回一顆同樣可按、同樣帶 `aria-label`／`data-copy-name` 的文字鈕，功能不消失。
- 素材列結構改為「容器 `div` ＋ 內層 `.crafter-qt-mat__link` ＋同層的鈕」：原本整列是 `<a>`，
  把 `<button>` 塞進去是**非法嵌套**，而且點鈕會連帶跳去市場板。
- **本站自己那份較薄的實作也接上共用**（Owner：「有重複使用的請接共用」）：
  `app.js` 的 `copyText` 改成「有 `FFXIVClipboard` 就用它、缺 CDN 才退回本地 execCommand 版」——
  巨集複製／採購清單／品名三條路徑現在共用同一入口；清單的移除鈕 `✕` 換成共用 `close` 圖示。
  **帶文字的動作鈕（`📋 加入製造清單`／`📋 複製清單`）刻意不動**：那是身分／主操作，不是功能性小圖示。
- **數量與複製鈕移到緊接品名之後**（Owner：「不要貼這麼右邊」）：這一列很寬，原本靠 `flex:1` 把它們
  推到最右，眼睛得跨過一大片空白才讀到「要幾個」。右側只留狀態徽章與動作鈕。
- T34：共用元件契約（用 copy 圖示／label 帶品名／`data-copy-name` 帶值／退場版不得用 emoji／
  `<a>` 內不得有鈕／點鈕不得跳頁／優先共用 clipboard）。
- T35：接共用的契約與退場路徑（`copyText` 走共用並把 label 交給它、缺共用不得拋錯、移除鈕走共用 `close`、帶文字動作鈕維持 emoji 的負向哨兵）。298 → **316 passed**。

## 2026-08-09 — 新增「職業任務」分頁（11 職／勾完成／素材展開到底層）

**為什麼**：練生活職業時最花時間的不是製作，是「這一路上到底要交哪些東西、還缺什麼」。原本要開灰機一頁頁查。

### Added

- `data/job-quests.json`（`tools/build-data.py --quests-only` 產）：11 職（8 製作＋3 採集）、217 個任務、290 件交付物。
  **權威＝台服解包**：交付物在 `Quest.Script{Instruction}=RITEM<n>` → 同序 `Script{Arg}`＝item id；
  職業對照由 `ClassJobCategory` 的「恰好一個職業旗標為 True」推導（**不用 `cjc == job_id + 1` 那種形狀對照**，
  現況成立是巧合，改版就靜默錯位）；職業繁中名走 `jobs.json`、物品名/icon 走 `item_lookup`（DRY 鐵則）。
- `app-quests.js` 職業任務層：任務清單＋完成勾選（本機保存）＋「只顯示未完成」＋**未完成任務**的素材彙總，
  遞迴展開到「要去買／採的底層素材」，中間材另列一段。可製作的交付物直接給「⚒ 求解手法」入口，
  不可製作的連 marketboard 查價／來源。
- `tools/fetch-quest-qty.py`：抓 Owner 提供的社群試算表 → `tools/job-quest-qty.json`（交付數量）。

### Notes（資料誠實度）

- **交付數量不在解包裡**（`Quest.CountableNum` 全是 255 哨兵值）。數量取自社群試算表，
  且**對帳用 item id 不是字串**：試算表名 → `item_lookup` 查 `name_tc`／`name_sc`／（OpenCC t2s 後再查 `name_sc`）
  → **id 必須等於解包 RITEM 的 id 才採用**。第三段是必要的：試算表源自灰機（簡中），名稱常是「把簡中繁化」
  而非台服正名（「羅敏薩鳀魚」t2s→`罗敏萨鳀鱼`＝id 4870，台服正名是「羅敏薩**鯷**魚」）。
  轉換只用於查 id，**顯示一律用解包的台服名**。
- 現況 **228/290 件有數量、62 件標「數量未知」**。未知的多數是真差異（60 級以上任務要交「XX的材料」，
  試算表列的是成品「高級XX」＝另一個 item id）——id 對帳正確地拒絕了它們。UI 逐件標示，
  彙總區另寫一行「其中 N 件以 1 份估算」。**寧可寫出不知道，也不要靜默按 1 算**：那會讓採購量整批偏掉而畫面全正常。
- 勾任務只更新「進度／職業 chips／彙總」三塊，不重繪整份清單（`.qt-list` 有自己的捲軸，重寫會把捲動位置彈回頂端）。

### Added（商人資訊，Owner 追加）

- `data/vendors.json`：職業任務相關的 591 件物品中，**256 件 NPC 有賣、172 件查得到販售地點**
  （地名＋座標＋NPC 名與稱號）。**來源全部是解包**＝monorepo item_dict 的 `gil_shop_npc.json`。
  同源鏈：台服 datamining-tc →（bot 的 `build_upstream_names.py --dim gil`，繁中直出）→ 該中間表 →
  marketboard 的 `build_source_detail.py`（「🪙 NPC 商店」卡）與本站的 `build-data.py` **各自消費同一份**，
  不是兩份抄本。
  ⚠️ 第一版曾用社群試算表補地點（只有 38 筆、且是「北黑」這種縮寫），Owner 一句「不能拿別頁面的來用嗎」
  才發現 monorepo 早就有這份 —— **既有資產沒找過就下「只有社群資料」的結論**，是這次的教訓。
  改用解包後涵蓋 38 → 172 件，且價格與 `item_lookup.price_mid` 逐筆一致；社群那半直接退場（不留兩份會漂移的）。
- 一件東西常有十幾個通用商人 → 只列前 3 個（帶座標的優先），其餘「另有 N 處」帶過。
- **沒有座標不等於沒有商人**（Owner：「楓木方盾明明一堆防具商人賣」）：第一版用 `if n.zone` 過濾，
  把「武具商」「雜用商人」這種只有名字沒座標的通用商人整批丟掉，畫面變成「本站沒有販售地點資料」，
  但遊戲裡到處都買得到。改成一律保留、帶座標的排前面 → **172 → 247 件**（256 件有賣中）。
- **需 HQ 改成品名後直接貼遊戲內的 HQ icon**（Owner：「直接用 HQ 符號在道具名稱後面，不要搞個標籤」）：
  用的是 **marketboard 的同一張 `assets/hq.png`**（銅色漩渦），不是自創符號 —— 第一版寫成 `✦` 是我自己
  掰的，玩家在遊戲裡認的不是那個。不確定的用同一張圖淡化＋`?`。圖以 CSS filter 轉**白色**（Owner），不另存第二張圖——同一份 asset 不分岔。
- **要交 HQ 的那一格不再顯示商人徽章**（Owner：「只賣 NQ 不用顯示，因為商人根本不會賣 HQ」）：
  寫「有賣」是誤導、寫「只賣 NQ」是廢話，這一格對玩家唯一有用的是旁邊的「求解手法」。
- 徽章同時出現在**素材彙總**與**任務交付物**兩處（Owner：「甚至是任務需求」）。

### Fixed（HQ，Owner 指出）

- **要交 HQ 的交付物不能說「商人有賣」** —— 商人賣的是 NQ，那樣寫等於叫人買一堆交不掉的東西，
  而且是**買完站到 NPC 面前才發現**。改成「🏪 只賣 NQ」＋說明要自己做出 HQ；`hq` 未知時也照實提醒
  「若任務要 HQ，買來的 NQ 不能交」（**未知不等於不用**）。交付物另加「✦ 需 HQ」／「HQ？」徽章。
- HQ 需求同樣不在解包裡：實測 `Quest.ItemBool` 與 HQ **無關**（RITEMn↔ItemBool[n] 吻合率 50%＝隨機，
  它其實對應 ToDo 條目）、`ToDoQty` 恆為 1 也不是交付數量。故 HQ 來源是試算表的 `୭` 記號 ——
  語意用資料反驗過：標 ୭ 的 **92 件全部 `can_be_hq=1`（0 件例外）**，且 Lv1–19 完全無標記、Lv20 起才出現。
  現況 92 件標明需 HQ。

### Tests

- T31：配方產出量 ceil（要 4 個、一次產 3 → 做 2 次）／中間材再展開／數量未知以 1 份估算而非漏算／
  資料出環不轉死／完成過濾與進度／`job-quests.json` 資料不變量＋木工 Lv10「梣木木材 ×12」golden。
- T32：商人資訊兩來源分流（解包說有賣才出徽章／地點單價標明社群整理／只知有賣時誠實說「沒有販售地點資料」／`vendors.json` 不變量與地名已還原）。
- T33：需 HQ 的商人徽章分流（要 HQ→「只賣 NQ」且不得沿用可購買樣式／未知也提醒／`hq` 欄型別／木工 Lv25 需 HQ・Lv10 不需 HQ 正反 golden）。262 → **298 passed**（T32 另加「無座標通用商人照樣列出」與「覆蓋率 ≥240」兩條）。

## 2026-08-09 — 專家之證改成逐職業的角色狀態（上限 3）＋ 求解頁降高度

**為什麼**：專家之證原本是「素材與加成」裡的一個全域勾（跟食物藥水放一起）。它其實是**角色狀態、綁職業、遊戲同時最多 3 個** —— 放在求解設定裡的代價是：換一個職業的配方就要自己記得撥開關，撥錯了求解器照樣算出漂亮巨集，而那份巨集玩家在遊戲裡按不出來（專心致志／快速改革根本沒有），**全程零錯誤訊號**。

### Changed

- 專家之證搬到「角色數值」分頁，成為每職一格的勾選（`gearsets[職業].specialist`），表頭常駐 `n/3` 計數；勾第 4 個會回退並說明原因（不用 `disabled`：那會讓鍵盤走不到、螢幕閱讀器也讀不到為什麼）。
- 求解端改讀 `gear.specialist`（由 `gearFor` 附上）：`effectiveStats` 的 +20/+20/+15 與 `use_heart_and_soul`／`use_quick_innovation` 的 gate 都是它。**證不跟著數值的 fallback 走** —— 某職沒填數值時數值取「預設」，證仍看該職業自己那格（「預設」不是職業，也不佔上限）。
- 「素材與加成」只剩食物／藥水；求解頁改由「套用『職業』數值 …」那一行寫出 `專家之證 ✔`（唯一顯示點）。
- 舊 `ffxiv-crafter-consumables-v1` 裡殘留的 `specialist` 欄位一律忽略（**不做遷移**：舊值是全域的，對應不到任何一個職業，猜一個等於替玩家亂勾）。

### Changed（版面）

- 配方詳情的「加入製造清單／材料樹與利潤」從獨佔一列改成與配方名同列靠右：實測 ri-head 104px → 67px。
  門檻用 **container query 看設定欄自己的寬度（≥540px）**，不是 `@media` 看視窗 —— 這一區住在雙欄版面的左欄，視窗 900px 時它其實只有約 420px，照視窗判斷會在那個區段把按鈕與長配方名擠成三四行（實測 236px），比原本還糟。窄欄一律退回獨佔整列。

### Tests

- T30（專家之證逐職業狀態）：上限擋第 4 個／不進保存／不隨 fallback 走／公式端 gate／取消後空出一格／「預設」不佔上限。240 → **262 passed**。

## 2026-08-03 — 舊網址交接頁（monorepo B-048 Task 4，第 5 站）

**為什麼**：本站已掛上 `crafter.xivtc.com`，但手上是舊 `*.pages.dev` 書籤的使用者不會知道，也不會把跨工具身份（UUID）帶過去。

**為什麼不是 301**：301 在**邊緣執行、早於任何 JS** ⇒ 舊 origin 完全沒機會讀 `localStorage` 裡的 UUID。純 301 會讓使用者靜默失去雲端身份。所以必須回一頁極簡 HTML、由 client 讀 LS 後自行組目標 URL——這也是為什麼目標 URL 不能在 server 端組完就送：**`#fragment` 永遠不會送到伺服器**。

### Added

- `functions/_middleware.js`（**四個條件同時成立才攔**：`GET`／`Accept` 含 `text/html`／host 精確等於 production 舊 host——字串全等，順帶讓 CF preview 子網域天然放行）
- `_routes.json`（**完整枚舉**，刻意不用 `/*`：那會讓每個 CSS/JS/圖片請求都變成一次 Functions invocation）
- `tests/route-manifest.json`（攔截路徑唯一事實源）＋ `tests/handoff.test.mjs`（四個攔截條件各有正負案例）
- `deploy-allow.txt` 加 `functions`／`_routes.json`；`deploy-deny.txt` 加 `tests`（fail-closed，漏了 build 直接失敗）

### Notes

- 本站為**單頁站**，manifest＝`["/", "/index.html"]`。`/index.html` 必須顯式列入——實測它**不會** 308 到 `/`（其餘 `.html` 深鏈會，被 308 後由無副檔名形式接手，交接照樣發生）。
- middleware 由樣板產生，**除兩個常數外與其餘 12 站逐字節相同**，由 monorepo 交接頁一致性哨兵把關（斷言的是逐字節相同，不是「條件有沒有在」——後者抓不到語意被改寫）。

## 2026-08-03 — B-006 結案：生態內互跳慣例成文、本地 `[hidden]` interim 移除

**(a) noopener（Owner 選 A：維持不加，但要成文）**：工具間深連結用 named target 且刻意不加
`rel="noopener"`（加了會切斷 `window.opener`，named 分頁重用的體感就壞了）。風險可接受的前提是
**目標全是同 org 自家子域 ＋ 收端寫入動作一律有確認 modal**；連非自家網域仍必須加。
理由寫進 portal `_DESIGN-SYSTEM.md` 新段〈🔗 生態內互跳〉——**成文的目的是止血**，
這項被外審重複點名過，之後引用該段即可。

**(b) `[hidden]` 守衛（Owner 選 A）**：portal `header.css` 的全域守衛
（`.codex-btn/.codex-chip/.codex-icon-btn[hidden]`）**早已存在**，故本 repo 收窄到 5 個按鈕 ID 的
interim 移除，改留一行指引：**是 codex 元件就不用做事；自寫 class 且本地設了非 none 的 display 才要補**。
**實測驗過**（這正是「hidden 設了不等於收得起來」那個坑）：5 個按鈕逐一 `getComputedStyle` ——
顯示時 flex/inline-flex、設 hidden 後全部 none。T21 哨兵仍綠。

## 2026-08-03 — 清 backlog：B-001 不變量、B-003 否決、AGENTS 敘事搬 docs

**B-001 DOH/JOB_ICON 權威源（Owner 選 A）**：這兩份是**刻意的 local hardcode**——monorepo 的
`jobs.json` 只散布 21 個戰鬥職、不含 8 個製作職，沒有上游可對。改用「對得起實際資料」的不變量取代
sync：新增 **T29**（`DOH` 必須恰好 == `recipes.json` 出現過的 job 集合；`JOB_ICON` 鍵集合 == `DOH`；
每個值都是 icon 路徑），並在 `app.js` 註明「刻意 local、月稽核請跳過」。負對照驗過（拿掉「烹調」→ 2 條紅）。
**240 → 243 passed。**

**B-003 worker 接 simulate（Owner 選 A）**：掛近一個月無實際需求 → 正式否決關閉。
`simulate()` 的 export 保留不刪（零成本，且 `replay()` 本來就是求解走查在用的同一條路）。

**AGENTS.md 超 DEVLOOP R7 護欄（Owner 選 A）**：34.1KB → **30.3KB**。手法是規則明訂的「敘事搬索引、
勿為壓 byte 刪有效規則」——7 條長教訓的**由來與量測過程**搬 `docs/lessons.md`，AGENTS 留可執行的規則
本身 ＋ `→ 敘事見` 指標。判準：**動手前需要知道的留下、事後想理解才需要的搬走**。

## 2026-08-03 — 修自造譯名「群星穩定」→「宇宙穩手」（B-018）

**為什麼**：查「群星穩定是什麼」時發現該名**不存在於任何解包**——是 monorepo `build_game_ref.py`
補充列裡的手寫值，還標 `tc_verified=1`（宣稱台服官方已驗證），且與同一個 db 的 `actions` 表所存的
「宇宙穩手」互相矛盾（同 id、兩表、兩名，錯的那個宣稱已驗證）。違反繁中服正名鐵則「疑慮時查，不自創」。

**Owner 指出更根本的問題**：46843 是**宇宙探索（月球）專用**技能、**台服尚未開放**（本體 7.2、技能 7.4），
本來就不該被當一般製作技能加進來。資料形狀佐證：一般製作技能住 `CraftAction` sheet（id 100xxx）、
有 `ClassJobLevel`、CP 走 `Cost` 欄；46843 與同為月球專用的**奇迹之材 (41269)** 一樣住 **`Action`** sheet、
`ClassJobLevel=0`、走 `PrimaryCostType=20`（非 CP）。**判斷是不是月球專用，看它住哪張 sheet。**

**修法（外科式）**：真正的缺陷只有「自造名 + 假驗證標記」，補充列機制本身是 B-004 有意加、B-009 複核過的，不動。
→ `name_tc="宇宙穩手"`（国服名機轉）、`tc_verified=0`（等台服開放後由解包轉正），判準寫進註解；
crafter 側同步 `FALLBACK_TC` 與 `data/craft-actions.json`。

今天沒有玩家可見變化（`stellar_steady_hand_charges` 寫死 0 ⇒ 此技能永不出現在巨集），
但台服上 7.4 時就不會露出錯字。

## 2026-08-03 — 實測評估 raphael v0.28.6，結論維持 v0.26.2（B-019，無程式碼變更）

實際升上去跑過再回退，數據留檔避免日後重複評估：

- **能升**：只要 2 處型別修正（v0.28 起 `state.progress`／`quality` 由 u32 改 u16）。`action_name`
  是 exhaustive match ⇒ **編得過就證明上游沒新增 Action 變體**（仍 35 個）。
- **行為一致**：`cargo test` 5 綠；差分閘 12 類已知差異次數**逐一相同**；JS 公式對帳零分歧。
- **但升的理由不成立**：release note 主打的「7.55 與台服 7.2 遊戲資料」在 `raphael-data`，
  **我方沒引用那個 crate**（公式在 JS 端算），更新到不了我們。
- **代價是實的**：`pkg/*.wasm` 286,789 → 326,054 bytes ⇒ **brotli 後每位首訪者多 10 KB**
  （85.1 → 95.1 KB）。求解也沒變快：同一題 v0.26.2 **300ms** / v0.28.6 **346ms**、同一組解。

⇒ 無收益、有成本，維持 v0.26.2。**升版也修不掉神速技巧那個耐久錯**（上游 main 至今仍是 10），
所以「等上游修好就能拿掉 workaround」這條路目前還沒開。

## 2026-08-03 — 引擎差分測試收進 repo 當常設閘（cycle 2026-08-03-sim-diff-gate，B-020）

**為什麼**：上一段那個神速技巧的錯，是靠「拿另一顆獨立引擎逐格對打」才發現的——那份工具當時只在
`~/_claude_scratch/`，換機即失。收進 `tools/sim-diff/` 後，上游換版或我方動公式時會自動抓漂移
（正是 B-019 升 raphael 需要的回歸網）。

**從一次性腳本升級成閘**（差別在這三點，不是搬個檔案）：
- 已知差異寫成 `ALLOWED` 常數、**每條附為什麼可以放行**；清單外一律 `exit 1`。
- 清單裡的條目某輪**沒出現**也會印警告 —— 多半代表上游修好了，該回頭移除我方 workaround。
- 兩份 `Cargo.toml` 的 raphael tag 必須相同，由 `check-actions.py` 的 `check_simdiff_pin()` 機械守。
  **版本漂開＝綠燈但測的不是線上跑的那顆＝假保護，且零錯誤訊號**（負對照驗過：漂移 exit 1、同版 exit 0）。

用法與「不要為了讓閘變綠而往 ALLOWED 加東西」的紀律寫在 AGENTS「開發注意」。

## 2026-08-03 — 修正「工匠的神速技巧」耐久（上游 raphael 的錯，我方不動其原始碼繞過）（cycle 2026-08-03-trained-eye-durability）

**為什麼**：對標 BestCraft 逐步比對時發現耐久固定差 10。追下去是上游 raphael v0.26.2
把神速技巧的 `base_durability_cost` 寫死 10，而遊戲實際不消耗耐久。

**怎麼確定不是我們錯**（判準寫進 AGENTS「開發注意」，此處不重複）：日文客戶端文案裡每個會消耗
耐久的技能都寫「耐久を消費して」，神速技巧沒有；Teamcraft 與 Tnze 的模擬器亦為 0。⚠ **英文文案
只標非預設值，拿它判會得到相反結論**——我第一輪就是這樣誤判、後來才用日文修正。上游 `main` 至今未修。

**影響**（有量測，非推測）：走查表從神速技巧那步起耐久少 10（玩家看得到的錯數字）；求解端預算少
10 點 → 手法無謂變長，實測 rlv640 緊繃配方 **17 步 → 14 步**（17 步要貼兩段巨集，14 步一段就夠）。
另跑 1260 組配置掃描：**沒有**「我方判做不到、實際做得完」的情形，方向上一直是保守的。

**修法**：兩處都收在 `wasm/src/lib.rs`（我們自寫的薄綁定），**raphael 一行未動** —— 頁尾與
`THIRD-PARTY-NOTICES.md` 的「以未修改原始碼編譯」聲明維持成立，不觸發 Apache-2.0 §4(b)。
① `replay()` 事後補回 10 點 ② `solve_input()` 把神速技巧那條路拆成「神速技巧 ＋ 只衝進展的子問題」，
子問題用真實耐久求解。`cargo test` 2 → **5 條**（新增三條都有實質斷言）。

### 這輪順帶做的全面差分審計（結論：只有上面這一個錯）

把 raphael-sim v0.26.2 與 Tnze `ffxiv-crafting` 7.4.5 兩顆獨立實作擺進同一個 Rust crate 對打，
**958,495 次技能施放**：進展／品質／CP **零分歧**；耐久的唯一「製作進行中」分歧就是神速技巧那條。
我方 JS 公式另對帳：`base_progress`／`base_quality` 3,328 組零分歧、`hqPercent` 97 格零分歧、
HQ 素材初始品質 244,553 組對 BigInt 精確值**零誤差**（同組比對下 BestCraft 因先除後乘錯 83 組）。
專家之證與食物加成的先後也驗過：專家之證是靈魂水晶欄位的**裝備**，食物百分比基數含它，我方順序正確。

**已知但未處理**（留待拍板）：`stellar_steady_hand_charges` 寫死 0 ⇒ 群星穩定／倉促／冒進／高速製作
四個技能在本工具永遠不會被用，宇宙探索配方因此拿不到最佳手法。

## 2026-08-02 — 抽 app-recipe.js：app.js 進 500 以內（cycle 2026-08-02-recipe-split）

**為什麼**：上一批抽完 `app-gear.js` 後 app.js 仍 592 行（proxy 委派本身佔行數）。本批抽
「配方詳情狀態機」——`selectRecipe`／`showPicker`／`refreshGearNote`／`refreshSelectedGear`／
`renderIngredients`／`updateInitial` → `app-recipe.js`（216 行）。**app.js 592 → 424，閘門達標。**

### 狀態刻意不搬（這是本批最重要的設計決定）

`tools/test-formulas.mjs` 的 T25 用 `vm.runInContext('computedInitial' / 'selected.rlv', ctx)`
直接讀全域、並用 `RECIPES = …` 注入資料。若把狀態一起搬走，就會變成
**「模組與 app.js 共用六個可變全域」**——那不是封裝，只是換個檔案放，而且要再開六個全域例外。

改成**狀態全留 app.js，模組走注入的 getter/setter**（`getSelected`／`setSelected`／
`getComputedInitial`／`setComputedInitial`／`getRecipes`…，同 `app-browse.js` 已驗證的形狀）。
上一批 `app-gear.js` 把 `gearsets` 留在 IIFE 外，是被既有測試逼出來的**例外，不是範本**。
`recipeMaxes` 留在 app.js（公式面、與 `computeSettings` 共用，AGENTS 明訂不得兩處重算）。

### Verified

- 四道機械閘：`test-formulas` 239 → **240**／`check-actions` 35=35 ＋ pkg 戳記同步／
  `node --check` 全 12 支／`deploy-prepare.sh` 31 → **32 檔**。
- **搬移忠實度逐字比對**：把拆分前後的 `selectRecipe`／`refreshGearNote` 抽出來 diff，
  差異**全部只是機械性加 `deps.` 前綴**，結構、順序、條件零改動。
  兩個特別容易失手的位置也確認保留：`invalidateInFlight()` 仍在兩個 `return false` **之後**
  （選配方失敗時不該波及正在跑的求解）、等級同步的「先存後套回並收斂到新上限」整段未動。
- 瀏覽器實測：配方詳情／等級同步／返回列表→重選配方／HQ 素材與初始品質／
  改角色數值後目標品質 9000 與 HQ 數量 2 都保留／求解 22 步完成／零 console error。

### 順帶補上一條沒人守的迴歸（239 → 240）

驗收時用突變測試發現：**把 `selectRecipe` 裡的 `invalidateInFlight()` 整行刪掉，239 條全綠**。
T13 只驗了 `CraftSolve.invalidateInFlight` **本身**，沒有任何測試驗 `selectRecipe` 真的會呼叫它——
而 T13 存在的理由正是「換配方後晚回的舊結果會渲染在新配方標題下，玩家可能複製到錯綁巨集」。
這是既有缺口（非本次造成），但重構剛好把那行搬進新檔，之後弄丟更不會有訊號 → 補進 T25，負對照驗過。

> 執行＝委派 codex `gpt-5.6-luna`（xhigh），一次過；新增的迴歸測試與 stub 修正由 CC 補。

## 2026-08-02 — 抽 app-gear.js（拆分閘門定案的最後一批，cycle 2026-08-02-gear-split）

**為什麼**（B-002 定案）：`app.js` 640 行、已越過 500 行拆分閘門。Owner 拍板的順序是
「行為修復先做完，最後單獨一批拆」——理由是重構與行為修復混在同一個 diff 裡，
委派驗收無法歸因（看不出某行是修 bug 還是搬家）。本批就是那一批，**零行為變更**。

### Changed

- 抽 `app-gear.js`（96 行，classic script `globalThis.CraftGear`）：`gearsets` 狀態、
  `loadGear`／`saveGear`、`gearValid`／`gearFor`／`anyGear`、`renderGearsets`、`onGearInput`。
  沿用既有的 classic-script + deps 注入 pattern（同 app-render／app-solve／app-browse），
  **app.js 保留同名 proxy** → 既有呼叫點與事件綁定零改。app.js **640 → 592**。
- `onGearInput` 的事件鏈順序由注入的 `afterInput` 逐字保留：
  `saveGear → updateHint → refreshGearNote（若已選配方）→ invalidateResults → CraftFlow.update`。

### 為什麼 `GEAR_KEY`／`gearsets` 留在 IIFE 外（其他層都是私有狀態）

`tools/test-formulas.mjs` 的 T6 sec-A2 用 `vm.runInContext('gearsets', ctx)` **直接讀全域識別字**
驗「壞掉的 localStorage 值要被重置成空物件」。搬進私有作用域會讓那兩條斷言 ReferenceError。
要收進去就得同時改那兩條測試的取值方式——可以做，但別在「順手整理」時不小心做。已寫進檔頭。

### Verified

- 四道機械閘：`test-formulas` **239 passed（數字不變）**／`check-actions` 35=35 ＋ pkg 戳記同步／
  `node --check` 全 11 支／`deploy-prepare.sh` 30 → **31 檔**。
- **測試檔的 diff 只有 sandbox 載入方式**（6 處 `vm.runInContext(GEAR_SRC, …)`），
  斷言期望值一字未改——這是純重構的判準，改了期望值就代表行為變了。
- **CC 突變測試**：改 `app-gear.js` 的等級 clamp 下界 → 仍打紅**同樣 7 條** T24 斷言
  ⇒ 測試契約完整穿過拆分，proxy 沒有讓行為驗證失效。
- 瀏覽器實測：角色數值表 9 列由 CraftGear 繪出、填值即保存、首次提示收起、
  等級 150 → clamp 回 100（穿過 proxy）、切回求解頁套用註記與等級同步都正確、求解 2 步完成、零 console error。

> **app.js 仍 592 行（>500）**：proxy 委派本身要佔行數，單靠這一批到不了 500 以下。
> 下一個候選是把 `selectRecipe`／`showPicker`／`refreshSelectedGear`／`refreshGearNote`
> 這組「配方詳情狀態機」抽成 `app-recipe.js`（約 130 行），待 Owner 拍板。

> 執行＝委派 codex `gpt-5.6-luna`（xhigh），一次過。

## 2026-08-02 — 文件與 memory 同步（cycle 2026-08-02-B015-docs-sync）

**為什麼**（B-015 / 健檢批次 6，排最後因為行數與測試數要等前五批定案）：文件宣告的數字與指令
會隨 code 漂移，而**漂移的文件比沒有文件更危險**——它是每個 session 都會被讀進 context 的常駐指令。

### Fixed

- **`README.md` 的重建 WASM 指令照抄必失敗**：原本寫 `cd wasm` 再跑 `tools/build-wasm.ps1`，
  但 `tools/` 在 repo 根，`cd wasm` 之後那個路徑不存在。失敗後使用者的自然退路正是**被明令禁止**的
  裸 `wasm-pack`（會把建置者的 Windows 帳號名編進公開產物）。改成從 repo 根執行。
- **`AGENTS.md` 數字更正**（每項都實測過）：expert 配方 104 → **536**；`app.js` 500 → **640** 行；
  規模描述「~1.6k 行 10 檔」→「~2.7k 行 12 檔」（原清單漏了 `app-consumable.js`／`app-quality-stages.js`／
  `app-level-sync.js`）；`tools/` 與 `_headers` 兩列補上本輪新增項。
- **portal `templates/_headers` 補 `/data/*` must-revalidate**（portal repo `752db3e`）：
  模板缺這段 → 新工具照抄就讓 `data/` 走預設快取，推完玩家仍看到舊資料且**零訊號**。
  掃描 9 個有 `data/` 的 external 站，**`ffxiv-tw-sightseeing` 已經是活受害者**（未動，待 Owner 決定）。
- **memory**：刪 `external.audit-followups.md` 的 Analytics-A（**先 curl 驗證 crafter／treasure 的 beacon
  都已注入才刪**，不是照報告說「已完成」就刪）＋同步 `MEMORY.md` 索引；
  修 `external.data-cache-must-revalidate.md` 的「（見下）」斷鏈 → 指向 crafter CHANGELOG 的明確段落。

> **CC 退掉執行者一處改動**：它把 B-005（2026-07-27 **已結案**）的前提數字 4.8MB 改寫成 7.3MB。
> 那是**當時**的資料量，而同一段的「實際傳輸 536 KB」正是對那份資料量測的——改了會讓該段自相矛盾，
> 等於竄改歷史紀錄。已還原。（順帶：現況實測 `du -ch data/*.json` 是 7.1M，跟它寫的 7.3 也對不上。）
> 教訓：**「更新過時數字」與「改寫歷史紀錄」是兩回事**，已結案條目的當時數值不該被現況覆蓋。

## 2026-08-02 — a11y：live region 不再轟炸、鍵盤焦點看得見（cycle 2026-08-02-B014-a11y）

**為什麼**（B-014 / 健檢批次 5）：兩項的共通點是**看得見的人完全不受影響**，不實測就永遠不會發現。

### Fixed

- **求解計時不再每秒重播整段**：`#solve-status` 是 `role="status" aria-live="polite"`，
  而 `startSolveClock` 每秒重寫整個 region 的 `innerHTML` → 多數螢幕閱讀器對 live region 的任何 mutation
  都會重播**整段**，求解數十秒就被唸數十次。
  **只把秒數標 `aria-hidden` 不夠**——region 的 innerHTML 還是被換掉，mutation 照樣發生。
  改成求解開始時建立一次結構，之後每秒只改一個 `aria-hidden="true"` 秒數節點的 `textContent`；
  「≥60 秒」的升級文案只在跨過門檻的**那一次**寫入（那是真的該播報一次的狀態變化）。
- **自繪 listbox 的鍵盤焦點看得見**：`.crafter-cons__opt` 原本 `outline: none` 且**焦點樣式與 hover 完全相同**
  → 100+ 筆食藥清單用 ↑↓ 移動時看不出目前在哪一列，且違反 portal 設計系統的「禁止 `outline: none`」鐵則。
  改 `:focus-visible` + 2px accent ring，`outline-offset: -2px`（選單是 `overflow-y: auto` 的捲動容器，
  正 offset 會讓第一／最後一列的 ring 被裁掉）。

### Verified

- 四道機械閘：`test-formulas` 231 → **239 passed**／`check-actions` 35=35／`node --check` 全檔。
- **CC 獨立突變測試**：`paint()` 改回重寫父層 `innerHTML` → T28 紅 5 條；把 `outline: none` 加回 → CSS 哨兵紅。
- **真實鍵盤實測**（這批唯一能真正驗證的方式）：按實體 ↓ 之後 `:focus-visible` 為 true、
  computed outline 是 `solid 2px rgb(78,201,208)`；焦點移到**非選中**列時該列 `box-shadow: none`
  但仍有 ring ⇒ **「目前鍵盤焦點」與「已選中」視覺可區分**（修前兩者樣式相同）。

> 測試斷言的是「**狀態節點物件沒有被重建**」而不是「可見字串值不變」——後者恆綠，是空殼。
> 執行＝委派 codex `gpt-5.6-luna`（xhigh），一次過。

## 2026-08-02 — pkg/ 與 wasm/src 的同步機械守（cycle 2026-08-02-B013-pkg-stamp）

**為什麼**（B-013(b) / 健檢批次 4）：`pkg/` 是 wasm-pack 的輸出、必須 commit 進 repo（CF Pages 不編 Rust）。
改了 `wasm/src/lib.rs` 卻忘記重編時，**四道機械閘全綠**——`cargo test` 跑的是 host target 的 Rust 原始碼，
跟 `pkg/` 裡那顆舊 wasm 無關——而線上跑的是舊引擎。零回饋訊號。

（(a) 部署面暴露已於 2026-08-01 用 `deploy-prepare.sh` + 允許清單獨立解決，不在本輪。）

### Added

- `tools/build-wasm.ps1` 編完寫 `wasm/BUILD-STAMP.json`（`lib.rs` 與 `Cargo.lock` 的 hash）。
- `tools/check-actions.py` 追加不變量比對，不符即非零 exit 並指名是哪個檔對不上。

### 兩個已探明的坑（別回退）

- **戳記放 `wasm/` 不放 `pkg/`**：`pkg/.gitignore` 的內容是單一個 `*`，**而且它自己也被自己忽略**。
  在 `pkg/` 加檔要改那個 `.gitignore` 成白名單，但 **wasm-pack 每次 build 都會重新產生該檔** → 白名單會被蓋掉。
  `wasm` 已列在 `deploy-deny.txt`，戳記不會被發佈（實測 `_site` 30 檔內無戳記）。
- **hash 必須先正規化行尾**：repo `core.autocrlf=true` 且無 `.gitattributes`，直接 sha256 會在換機／重新 clone 後
  誤紅。兩支腳本（PowerShell 寫、Python 讀）用同一套 CRLF→LF 正規化。

### Verified

- **CC 親跑四項**：PowerShell 側 hash `21699b2d…0cf7` == Python 寫進戳記的值（跨語言一致，不是採信回報）；
  在 `lib.rs` 加一行註解 → **紅**且印出戳記 vs 現況 hash → 還原 → 綠；
  **整檔行尾轉成 CRLF → 仍綠**（正是上面那個誤紅坑）；
  `check-actions.py` 的成功訊息格式未變 → pre-commit gate 6 三項照常對帳。
- `test-formulas` 231 passed（本批不增測試）。

> 執行＝委派 codex `gpt-5.6-luna`（xhigh），一次過。

## 2026-08-02 — 求解引擎載不到不再是永久死路（cycle 2026-08-02-B012-engine-deadend）

**為什麼**（B-012 / 健檢批次 3）：`worker.js` 把 `await ready` 與 `solve()` 包在**同一個 try**，
而 `ready` 是**模組層級的單一 Promise**。網路瞬斷／`.wasm` 404 讓 `init()` reject 之後，
那個 Promise **永久 reject**、worker 卻還活著（`onerror` 不觸發，那只管 worker/module 載入失敗）
→ 主執行緒把它當成一般求解失敗，回一句「求解失敗，請調整設定後再試一次」。
**但調設定永遠不會好**，玩家唯一出路是自己重整，而站上不會這樣說。

### Fixed

- worker 把兩種失敗分開回傳（`kind: 'init'` / `kind: 'solve'`），**兩者都原樣帶回 `gen`**
  （世代守衛的身分依據，T13 釘住）。
- 主執行緒對 init 失敗顯示誠實訊息＋**重試鈕**，不再導向「調整設定」。
- **重試走 `abortSolve('retry')` 再 `doSolve()`**：`newWorker()` 不動 `solveGen`，
  而 terminate 與訊息投遞有 race——只重建 worker 不遞增世代的話，舊 worker 被砍前剛好投遞的那則
  會被當成當前結果渲染。reason 也不能用 `'user'`（那會 toast「已取消求解」並搶焦點）。
- `solveErrorMessage` export 到 `globalThis.CraftSolve`（原本 IIFE 私有，寫不出斷言）。

### Verified

- 四道機械閘：`test-formulas` 220 → **231 passed**／`check-actions` 35=35／`node --check` 全檔。
- **CC 獨立突變測試**：worker 兩個 try 合回一個 → T27 紅；重試改成只呼叫 `newWorker()` → 世代那條紅。
- **真實失敗路徑實測**（把 `pkg/crafter_wasm_bg.wasm` 移走再放回）：
  求解 → 顯示「求解引擎載入失敗（可能是網路問題）」＋重試鈕（`display: flex`，沒被 `hidden` 蓋掉）、
  全頁無「調整設定」字樣 → 還原 wasm → 按重試 → 新 worker 重跑 `init()` → **求解成功（20 步、品質 100%）**。
  **不必重整頁面**。

> 執行＝委派 codex `gpt-5.6-luna`（xhigh）。**CC 實測補了一刀**：Chrome 對缺檔實際吐的是
> `Failed to execute 'compile' on 'WebAssembly': HTTP status code is not ok`，
> **不符合**執行者新增的三個 pattern。UI 之所以仍正確，是因為 `showEngineInitFailure()` 把文案寫死、
> 根本沒走分類器——分類器等於裝飾品，且同一句話有兩份會漂移。已合併成單一來源、pattern 補上實測字串、加測試釘住。
> 這條只有真的把檔案抽掉跑一次才看得到，單元測試與程式碼審閱都不會發現。

## 2026-08-02 — 使用者可見缺陷：版面位移／成果被清空／窄屏裁切／靜默吞錯（cycle 2026-08-02-B011-visible-defects）

**為什麼**（B-011 / 健檢批次 2）：四項的共通點是**使用者看得到、但站上不會說**。

### Fixed

- **`body` 補 `margin: 0` + `padding-top: 64px`**：portal 的跨網域 `header.css` 有這兩條且帶 `!important`，
  它晚到時首屏會整段下推＝CLS。`margin: 0` 不能漏，瀏覽器預設的 8px 屬同一個 race。
- **改角色數值不再清空已填的 HQ 素材與目標品質**：`onGearInput` 原本呼叫 `refreshSelectedGear()` 整區重繪，
  把 `#opt-target` 清空、素材列重繪、`computedInitial` 歸零——玩家填好後回頭調一下數值就全沒了。
  改抽 `refreshGearNote()` 只更新 gear 真正影響的三處（套用註記／`updateEff()`／`solve-btn` 的 `aria-disabled`）。
  **等級同步配方是例外**：宇宙探索配方的三上限本來就會隨等級變，所以生效 rlv 真的改變時仍走完整重繪，
  但先存下目標品質與各素材 HQ 數量、重繪後套回並收斂到新上限。
- **食藥選單在手機不再被裁掉**：原本 `width: max(100%, 400px)`，固定最小寬超過手機可用寬。
  定案＝窄屏（≤700px）讓 `.cfg-line` 標籤獨佔一行、控制項與選單 `width: 100%`。
- **`loadGear` 不再靜默吞錯**（全 repo 唯一一處）：補 `console.warn` + 一次性 toast + 型別驗證。
  既有 T6 哨兵漏掉它是因為**只掃 `app.js`、且只認空 `catch {}`**；已升級成掃全部 10 支手寫 JS、
  規則改「catch body 內不含 `console.`」、括號配對而非單一 regex，`worker.js` 那個有 `postMessage`
  回報路徑的 catch 列具體白名單（不是整檔跳過）。

### Verified

- 四道機械閘：`test-formulas` 207 → **220 passed**／`check-actions` 35=35／`node --check` 全檔。
- **CC 獨立突變測試**（每項一條）：拿掉 `margin: 0` → T17 紅；`onGearInput` 改回整區重繪 → T25 紅 5 條；
  拿掉 `loadGear` 的 `console.warn` → T6 紅 3 條；選單寬度改回無上界 400px／拿掉窄屏規則 → T26 各紅 1 條。
- **同源 iframe 定寬實測七種寬度**（1400/1018/900/800/430/390/360）：全部零溢出、末列可選，
  且 1400/1018/900/800 與修前基準逐 px 相同（零迴歸）。手機可用選單寬 159px → **267–330px**。
- 瀏覽器：改角色數值後目標品質 9000 與 HQ 數量 2 都保留；宇宙配方改等級 100→80 時
  rlv 690→430、三上限 4026→1085 跟著變且目標品質保留。零 console error。

> 執行＝委派 codex `gpt-5.6-luna`（xhigh）。**窄屏那一項退回兩次後由 CC 收回自做**：
> 健檢報告判「800–1018px 會溢出」是錯的（實測原本正常），執行者照錯前提加的 `@media { left:auto; right:0 }`
> 把右溢出換成左溢出並打壞兩個原本正常的寬度；第二輪用 `calc(100vw - 常數)` 扣包裝器偏移仍差 5px，
> 因為那個偏移**會隨選單寬度變動**（97px ↔ 59px）。它寫的 T26 是同義反覆（把自己的 CSS 抄成斷言），已重寫。

## 2026-08-02 — 「算錯巨集」家族：專家技能連動 + 等級上界（cycle 2026-08-02-B010-wrong-macro）

**為什麼**（B-010 / 健檢批次 1）：兩個 bug 都會產出「看起來正常、貼進遊戲才失敗」的巨集——
本工具最痛的失敗模式，且全程零錯誤訊號。

### Fixed

- **專心致志／快速改革不再無視「專家之證」**：這兩個是**專家專屬技能**，沒插專家之證的角色
  根本沒有。`computeSettings` 原本完全不看 `#specialist` → 玩家沒插證卻勾了，求解器就把
  `/ac "專心致志"` 排進巨集，貼進遊戲那一行直接失敗。
  修法分兩層：**公式層硬 gate**（最後防線，即使 UI 有漏也產不出錯的巨集）＋ UI 層沿用既有
  `#adv-why` 慣例（真 `disabled` ＋ 強制取消勾選 ＋ `.crafter-why` 寫出原因）。
  **強制取消勾選刻意不寫進 localStorage**——否則玩家只是暫時拔掉專家之證，勾好的偏好就永久沒了。
- **角色等級收斂到 0..100**：原本無上界，輸入 101~255 會關掉等級懲罰並誤開「精修之眼」。
  收斂點在 `onGearInput`（不是 `cell()`——那裡只產生 `<input>`，`max=` 對 `type=number` 也不擋鍵入，
  而且改欄位不會重繪、`computeSettings` 讀的是記憶體裡那個值）。
  **下界是 0 不是 1**：本 repo 用 0/falsy 代表「未填等級 → 假設 100」。

### Verified

- 四道機械閘：`test-formulas` 181 → **207 passed**／`check-actions` 35=35／`node --check` 全檔。
- **CC 獨立突變測試**：拿掉專家之證 gate → T23 紅；等級下界改回 1 → T24 紅 7 條。
- 瀏覽器實測：冷啟動兩項 disabled ＋ 顯示原因；勾專家之證 → 解除；勾好專心致志後**拔掉**專家之證
  → 勾選被取消但 localStorage 仍保留 `opt-heart: true`（偏好沒被清掉）。等級欄六種輸入
  （150／清空／85／-3／100）行為與單元測試一致。求解 5 步完成、零 console error。

> 執行＝委派 codex `gpt-5.6-luna`（xhigh）。**第一輪退回重派**：執行者的 clamp 下界寫成 1，
> 把「未填」壓成 Lv1（清空等級欄 → 用 Lv1 求解、宇宙配方被同步到 rlv 1）——正是本批要消滅的
> 失敗模式。它自己的測試只涵蓋 `150 → 100` 故整批全綠溜過；抓到它的是 CC 對 `onGearInput`
> 跑的六種輸入探測。教訓已固化成 T24 的三條迴歸斷言。

## 2026-08-02 — 測試地基：修掉一條空殼斷言 + 補食藥加成 golden（cycle 2026-08-02-B009-test-foundation）

**為什麼**（B-009 / 健檢批次 0）：健檢用突變測試證實 177 條測試裡有一條**不具鑑別性**——
把被測的程式碼刪掉，測試照樣全綠。修任何行為之前先讓測試網真的接得住，這是後續五個批次的安全網。
本批**零行為變更**。

### Fixed

- **T11「篩選變更 → 回第 1 頁」空殼斷言**：原斷言是
  `/第 1 \//.test(...) || !/頁/.test(...)`——`||` 右邊在「篩選後只剩單頁、根本不印頁碼」時**恆真**，
  所以不管有沒有回到第 1 頁都會綠。改成篩出**仍跨 3 頁**的結果集並逐字比對頁碼段。

### Added

- **T22 `effectiveStats` 食物／藥水加成 golden**（4 條）：百分比取 `floor`／硬上限小於百分比結果時取上限／
  食物與藥水**都以原始 base 計算**（不累加）／專家之證 +20/+20/+15 先疊進 base 才算百分比。
  這條路徑先前**一條測試都沒有**（既有 T2 只測專家之證，`CraftConsumable` 一直是 undefined、迴圈根本沒進去）。

### Verified

- **CC 獨立重跑突變測試**（不採信執行者自述）：只刪 `app-browse.js:50` 的 `page = 0;` 一句
  → 新斷言紅（`130 個配方（第 3 / 3 頁）` vs 期望 `第 1 / 3`）；還原後綠且該檔零 diff。
- 四道機械閘：`test-formulas` 177 → **181 passed**／`check-actions` 35=35／`node --check` 全檔。

> 執行＝委派 codex `gpt-5.6-luna`（effort xhigh），CC 驗收（對 baseline 全 diff ＋ 親跑閘 ＋ 獨立突變測試）。

## 2026-08-02 — 修：等級同步面板每個配方都顯示（cycle 2026-08-02-lvsync-hidden-guard）

**為什麼**（Owner 回報：「你為什麼每個都要顯示」）：`.crafter-lvsync { display: flex }` 的優先權蓋過
瀏覽器內建的 `[hidden] { display: none }` → JS 設的 `hidden` 屬性形同無效，那塊面板在**所有**配方上都出現。

**為什麼上一輪測試沒抓到**：我在瀏覽器裡驗的是 `element.hidden`（**屬性**，值確實是 `true`），
不是實際算出來的 `display`。屬性對、畫面錯，兩邊都「通過」。這是本 repo 反覆出現的坑
（`styles.css` 原本已有 6 條手寫 `[hidden]` 守衛與一段說明註解），我沒補第 7 條。

### Fixed

- `styles.css` 補 `.crafter-lvsync[hidden] { display: none; }`。
  實測：一般配方（35426）computed display `none`、高度 0；宇宙配方（36165）`flex`、高度 150px。

### Added

- **T21 `[hidden]` 守衛哨兵**（177 passed）：掃 index.html 裡帶 `hidden` 的元素，其 id/class 若在
  `styles.css` 被指定了非 `none` 的 `display`，就必須有對應的 `[hidden]` 守衛。
  **負對照驗過**：把 styles.css 換回出包版本，T21 確實會紅並指名 `.crafter-lvsync(display:flex)`
  ——不是一條永遠會綠的空測試。

## 2026-08-01 — 等級同步配方：未滿 100 級不再算錯（cycle 2026-08-01-B016-level-sync）

**為什麼**（B-016，Owner 轉述玩家回報）：宇宙探索（Cosmic Exploration）的 768 個配方（8 職 × 96）
在資料裡**只有一列**，存的 rlv 690 是「Lv100 版本」——但遊戲裡同一份配方掛在多個等級級距的任務上
（`WKSMissionUnit` 的 LevelGroup 1/2/3 共用同一 recipe id、`IsSynced=1`），數值會跟著同步後的職業等級變。
本站固定用 `RLV[recipe.rlv]` ⇒ 一個 Lv70 玩家看到的難度是 **4026（實際 658，六倍）**，
求解器要嘛回「做不到」、要嘛給一份貼進遊戲完全對不上的巨集，而且**全程零錯誤訊號**
（無警告、無 console error、四道機械閘全綠）——正中本工具最痛的失敗模式。
上一輪剛加的品質階段目標是從滿品質推的，同一個 bug 會一起錯。

### Added

- **`app-level-sync.js`（新層，`globalThis.CraftSync`）**：依角色等級解出生效的 recipe level 列，
  `refreshSelectedGear` 把它寫回 `selected.rlv` —— 那是 `computeSettings` 的唯一入口，
  換在那裡就不會有第二條路徑漏掉同步（顯示與求解必然一致）。
- **手動覆寫**（Owner 指示「以防萬一多一個讓人手動調整的」）：等級輸入框留空＝跟隨「角色數值」的等級，
  填數字＝手動指定；**本機保存**（`ffxiv-crafter-level-sync-v1`），旁邊有「↩ 跟隨角色等級」還原。
- **`data/level-sync.json`**（768 筆）：權威＝monorepo `game_ref.sqlite` 新增的 `recipe_level_sync` 表
  （`build_game_ref.py` 由 `Recipe.MaxAdjustableJobLevel` 解出）。**不用「rlv==690」之類的形狀猜測**
  ——那是現況巧合，改版就靜默失效。

### 判準與證據（這類改動最容易錯在「憑印象定規則」）

- **等級 → 生效 rlv ＝ 取該職業等級的最小 rlv**。依據不是猜的：可調整配方存的 rlv（690）
  正好就是 Lv100 的最小 rlv ⇒ 代入最高等級會還原成原值。兩份對標實作在這裡是**互相矛盾**的
  （best-craft `static-source.ts:107` 取最大、`src-tauri/main.rs:202` 取最小），取最大會在滿等就把配方改掉。
- **identity 用實資料全量釘住**：768 個同步配方逐筆比對「原始 rlv == 其最高等級的基準 rlv」，
  上游改版讓對照失效會直接紅（T20）。
- **不靜默換數字**：畫面寫出「已依角色等級 Lv 70 同步 → rlv 290（難度 658 · 品質 1728 · 耐久 40）。
  配方原始資料為 Lv 100 · rlv 690。」——玩家對不上遊戲時，才分得出是等級選錯還是工具算錯。
  沒填角色等級時**不猜**：維持原始值並講明為什麼、去哪裡補。
- **不會同步的配方整區隱藏**，不留一個永遠沒作用的輸入框。

### Verified

- 四道機械閘全綠：`test-formulas` **151 → 175 passed**（T20 新增 24 條）／`check-actions` 35=35／
  `cargo test` 2 passed／`node --check` 全檔。
- 瀏覽器實測（:8809 + portal :8774）：Lv70 選 36165「統一規格的壓縮纖維板」→ 難度 4026→**658**、
  品質 5760→**1728**、目標品質上限跟著改；求解 **4 步完成**（修前的 rlv 690 對 Lv70 是不合理的目標）。
  手動指定 Lv90 → rlv 560（2135／3456），重整後仍在；按還原回到跟隨。非同步配方（35426）整區隱藏。
  零 console error。

## 2026-08-01 — 品質階段選單：不必永遠衝滿品質（cycle 2026-08-01-recipe-quality-stages）

**為什麼**：收藏品交易與宇宙探索任務都只看有沒有跨過門檻，衝滿品質是白花 CP 與步數——常常
還會讓原本有解的配方變成 `NoSolution`。目標品質欄本來就在，但要玩家自己知道門檻是多少才用得起來。

### Added

- **「品質階段」下拉**（`app-quality-stages.js`，新層）：滿品質／一階／二階／三階／自訂。
  對標 BestCraft `RaphaelSolver.vue:105-107` 的語意：**某一檔為 0 就不列那一檔**；整個配方沒有
  分階資料就把整組欄位收起來（不留一個只有「滿品質」的假下拉）。選了就填進既有的目標品質欄
  ——求解路徑一行沒動。
- **門檻原值寫在旁邊**（「宇宙探索任務 · 一階 50%／二階 60%／三階 85%」）。玩家跟遊戲畫面對不上時，
  這行決定他分不分得出是資料錯還是換算錯。刻意不用 `.crafter-why`（警告色，留給「此欄為何停用」）。
- **`data/quality-stages.json`**（992 個配方）：權威＝monorepo `game_ref.sqlite` 的
  `recipe_quality_stages`。兩種來源單位不同，換算收斂在 `app-quality-stages.js` **一處**：
  收藏品＝值×10；宇宙任務＝`ceil(滿品質 × 值 / 100)`。**進位方向是有意義的**——floor 會落在
  門檻下方一點點，求出來的手法剛好差一格達不到。
- **深連結 `?stage=1|2|3`**：只認**階段序號**，**刻意不收絕對品質數字**。讓外部站塞絕對值進來
  等於開第二條換算路徑，對面資料一舊就靜默給出達不到門檻的手法。宇宙探索站即以此連過來。

### Fixed（實測時發現，屬本功能造成）

- **目標品質沒達到，畫面卻全綠**。raphael 達不到目標時回的是「最佳努力」而不是失敗，
  而 `complete` 只看進展有沒有做完 ⇒ 顯示「✓ 可完成 品質 56%」，沒有任何地方說門檻沒過。
  這在手打目標時就存在，但品質階段把它從邊角推成主線——玩家選「三階」就是衝著門檻來的。
  新增 `CraftRender.shortfallHtml`（純函式）：未達成時寫出目標、實際、差額與可行的補救方向。
  實測（三階 12665、技能全不勾）：實際 8488，警語正確出現。

### Verified

- 端到端實測（宇宙配方 36199 加工檢驗用的釣竿，滿品質 14900）：`?stage=1` → 目標 7450 →
  求解 21 步、品質 7509/14900，**停在門檻上方而非衝滿**。零 console error。
- T18（14 條）：兩種單位換算／clamp／進位方向／未知來源不猜／無分階整組隱藏／某檔為 0 不列／
  提示階名不隨缺檔位移／手打數字與下拉雙向同步，＋ `shortfallHtml` 四條。**122 → 151 passed**
  （其中 137→147 是同日另一輪的 T19 求解選項保存，非本段）。

## 2026-07-29 — 修首屏版面位移 CLS（cycle 2026-07-29-cls-reserve）

**為什麼**：field data 回報首頁 CLS P75 0.225（Google 的 poor 門檻 0.25 在邊上），最大位移元素 `#pick-panel`（378 次取樣）。根因單純：**配方資料是 fetch 回來才長內容的，而首屏沒替它保留高度** — 本機量測空殼→實體內容 `#pick-panel` +588px、流程軸 `.crafter-flow-wrap` +73px，資料一到整頁往下彈 660px。

### Changed
- **流程軸改成靜態初始標記**：`#flow-steps` / `#flow-next` 原本是空殼等 JS 填。現在 index.html 直接寫入 `CraftFlow.flowHtml({})` 的冷啟動輸出（逐字相同），JS 接手時是同字串覆寫 → 零位移，且首屏就看得到「現在該做什麼」。
- **首載預留高度**：`#picker` 靜態帶 `.is-loading`，替職業 chips／筆數／翻頁器撐出載入後的真實高度（窄屏折行另分 4 段斷點，斷點值＝iframe 逐 px 實測）；首次 `renderTable()` 後卸下，故篩選只剩少量結果時不會留空井。表格則由 `.recipe-loading` 佔位塊自撐 `60vh`（＝`.recipe-table` 的 `max-height`，首頁 60 列必吃滿），innerHTML 一換就自動消失、不靠 class。
- **首次使用提示提前判定**：`loadGear()` + `updateHint()` 移到 `await loadData()` 之前（只讀 localStorage，不需等網路）— 原本等資料回來才 unhide，等於再推開一次版面。

### Testing
- 測試 117 → 122（T17：靜態標記 == `flowHtml({})`、`is-loading` 兩條路徑都會卸下、佔位高度 == 表格 max-height）。**靜態標記與程式輸出的漂移由 T17 逐字比對機械守** — 改 app-flow.js 文案後測試會紅，重印貼回即可。
- 瀏覽器實測（iframe 固定寬度模擬各裝置）：位移 588px → **≤1px**，涵蓋 1400 / 1024 / 910 / 800 / 509 / 412 / 390 / 360 / 320 寬；零 console error。

### Notes
- 另有 `#ftw-main` / `body` / `#main-tabs` 各 1 次取樣的高分位移，來源不在本工具（page-header 之上只有 portal CDN 的 `header.css`／`body padding-top`），單次取樣、疑似 CDN 樣式延遲抵達，本輪未動 — 若持續出現要回 portal 層查。

## 2026-07-29 — 台服官方譯名同步 ＋ 搜尋支援簡中輸入

**為什麼**：繁中名改以本機台服 client 自解包為權威（monorepo cycle `2026-07-29-B038-tc-client-datamine`）——upstream `datamining-tc` 落後兩個大改版，7.2 新內容原本退 OpenCC 機轉、產出**陸服譯名**。

- `items.json` 255 件更名（儀仗長刀→典禮長刀、鬃背獸裡脊肉→鬃背獸里肌肉），書名號改回《》。
- **`recipes.json` 是第二個坑**：站上的物品搜尋走配方表的 `item_name`，不是 `items.json` ⇒ 只更新後者的話，線上仍搜不到「典禮長刀」，**開無痕也一樣**（不是快取問題）。該檔來自 best-craft 的凍結 static-data，其產生器步驟⑦ 正是「以 `item_lookup.name_tc` 繁中化」且 idempotent，重跑即補齊 13874/13874。
- **搜尋支援簡中輸入**：`items.json` 多帶 `name_sc`、`RINDEX` 掛 `nameSc`、搜尋兩欄都比對；**只比對不顯示**（顯示一律繁中）。市場板與本機素材計算機早就簡繁都能查，crafter 是唯一沒跟上的。測試 113→117（T16）。
- 資料檔快取改 `max-age=0`＋ETag（全站一致）——原本 `/data/*` 給 600 秒，推上新資料後分不清是沒推成功還是快取沒過期。

## 2026-07-28 — 重編 WASM：產物不再外洩建置者路徑（cycle 2026-07-28-wasm-remap）

**為什麼**：查授權合規時掃 `pkg/crafter_wasm_bg.wasm`，發現 39 條含 `C:\Users\<建置者>\.cargo\...` 的字串——Rust 把每個 panic 的原始碼路徑編進二進位，而這個檔案**公開可下載**（線上實測 `https://ffxiv-crafter.pages.dev/pkg/crafter_wasm_bg.wasm` → 200 / application/wasm / 285557 bytes；瀏覽器本來就得抓它才能執行）。等於站上一直公開著建置者的 Windows 帳號名。

### Added
- `tools/build-wasm.ps1`：重建 `pkg/` 的唯一入口。設 `RUSTFLAGS=--remap-path-prefix=%USERPROFILE%=~` 後跑 wasm-pack，**編完驗收產物不含建置者路徑**（不是「編過就算」）。不用 `.cargo/config.toml` 是因為 rustflags 不做環境變數展開，寫死絕對路徑換機即失效。

### Changed
- `pkg/` 重編（285557 → 284900 bytes）：帳號名外洩 **39 → 0** 條；raphael 的路徑字串保留 24 條（`~\.cargo\git\checkouts\raphael-rs-...`），那反而與署名一致。
- AGENTS.md／README 的重建指令改指腳本，並寫明**不要跑裸 `wasm-pack`**。

### Testing
- 重編後瀏覽器實測同一配方（軟銀錠 rlv640，含食藥＋專家之證）：`✓ 求解完成：品質 100%、共 7 步`，巨集與重編前逐行相同 → 引擎行為未變。

## 2026-07-28 — 補齊 WASM 散布的第三方授權義務（cycle 2026-07-28-授權合規）

**為什麼**：Owner 問「頁尾只寫『求解引擎來源 raphael-rs（Apache-2.0）』夠不夠」。不夠——我們散布的 `pkg/crafter_wasm_bg.wasm` 是把 raphael-rs 與約 40 個 crate **編譯進去**的二進位，CF Pages 的訪客就是收受者，屬 Apache-2.0 §4 的 Object form 再散布：§4(a) 要求交付 License **副本**（頁面上寫授權名稱不算），MIT 授權的 crate 也要求隨副本附著作權宣告與授權文字。

### Added
- `LICENSE-APACHE-2.0.txt`（自 raphael-rs v0.26.2 原樣複製）、`LICENSE-MIT.txt`（MIT 標準條文）。
- `THIRD-PARTY-NOTICES.md`：41 個套件的版本／授權／著作權人，由新增的 `tools/build-notices.py` **自 `wasm/Cargo.lock` 產生**（不憑印象列；含建置期 proc-macro，寧可多列不漏列）。
- 頁尾與 README 授權段補：raphael-rs 標明作者 KonaeAkira 與「未修改」、連到第三方授權聲明、SQUARE ENIX 版權聲明。

### Changed
- **授權全文改由本站直接提供**（Owner 裁示，同日修正）：頁尾原本連 GitHub 上的 notices，但本 repo 目前未公開 → 訪客會吃 404，等於沒交付。改連隨站部署的 `/LICENSE-APACHE-2.0.txt`（實測 200、`text/plain`、10173 bytes）。MIT 全文與 `THIRD-PARTY-NOTICES.md` 先只留 repo；**repo 轉公開時再把 notices 連結補回頁尾**。**SE 版權聲明不放頁尾**（Owner 裁示）：全站大量使用官方 icon，單在本頁補一行不成體系，要做是整個 portal 生態一起，非本輪 scope；README 仍保留事實陳述。

### Notes
- raphael-rs 上游**無 NOTICE 檔**（已查 v0.26.2 的 cargo git checkout）→ Apache §4(d) 不觸發；我們未改其原始碼 → §4(b) 修改標示不適用。若日後 fork 改引擎，這兩條都會啟動。
- 本工具自製碼仍為 MIT；MIT 與 Apache-2.0 相容，無需改自製碼授權。

## 2026-07-28 — 食物/藥水下拉重做（icon＋品級＋功效）＋這一區設定本地保存（cycle 2026-07-28-食藥選單）

**為什麼**：Owner 指出食物/藥水那一區三個問題——① 預設收合，等人自己去發現 ② 下拉只有名字，看不出是哪個東西、哪個版本、加成多少，等於要另開 wiki 才選得下去 ③ 選好了重整就沒了，每次進來都要重選。

### Added
- **`app-consumable.js`（新層 `globalThis.CraftConsumable`）**：食物/藥水改自繪 `role=listbox` 下拉 —— 原生 `<option>` 只吃純文字，放不了 icon。每列＝**物品 icon ＋ 名稱 ＋ 功效（`加工 +5%（≤115）・CP +26%（≤100）`）＋ 品級**，依**物品品級高→低**排序（同品級按名穩定排序）。功效隨 HQ 勾選即時換算（勾 HQ 就看 HQ 數值，不用心算）。鍵盤：↑↓ Home/End 移動、Enter 選取、Esc 收合並還焦、點外部收合。
- **這一區的設定本地保存**（`ffxiv-crafter-consumables-v1`）：食物／藥水／兩個 HQ 勾／專家之證／`<details>` 展開狀態。資料改版後保存值若已不存在，`setData` 會清掉（不留「選了但算不出加成」的幽靈狀態）。
- **`data/meals.json`・`medicine.json` 補 `icon`／`id` 欄**：來源是 best-craft 凍結的 static-data，本來只有名稱/等級/加成。`tools/build-data.py` 新增 `--consumables-only`，以**繁中名對 item_lookup** 補圖示（124/124 全中）。`level` 欄實測 == `items.level_item`（＝物品品級），故沿用不另算。

### Changed
- 食物/藥水區塊**預設展開**（`<details open>`）——但展開狀態同樣進保存，收起來的人不會每次被打開。
- `app.js` 只留「選中品項 → 數值加成」的公式面：`buildConsumables`／`fillConsumableSelect`／`getConsumable` 移入新層，`applyConsumables` 改走 `CraftConsumable.get()`（選擇性呼叫 → 測試 sandbox 缺該層＝無食藥，公式仍可決定性驗證）。`app-flow.js` 的摘要改問選擇層要顯示名（唯一真相＝該層 state，不是 DOM）。

### Fixed
- **自繪按鈕上 Enter/Space 的雙啟動**（實測踩到）：keydown 自己處理 Enter/Space 會與瀏覽器隨後轉出的原生 click 疊成「開了又關」。改成 keydown 只接 ↑↓，Enter/Space 交還原生按鈕行為。

### Testing
- `tools/test-formulas.mjs` **101 → 113**（T15）：無加成品項排除／功效文字含上限且不印空欄位／品級排序／保存往返（食物・HQ 勾・專家之證・展開狀態）／HQ 未勾取 NQ 版本／保存值在新資料中消失即清除／init 缺依賴早炸。
- 瀏覽器實測（:8809 + portal :8774，軟銀錠 rlv640）：選單 51 列圖文正常、選取後按鈕顯示名＋功效、摘要與「實際數值」同步（作業 4020・加工 3935・CP 742，含食藥上限與專家之證）、**重整後選擇/HQ/專家之證/展開狀態全部回來**、求解 7 步完成、選完新食物 → 舊結果正確失效、真實鍵盤（↓↓ Enter／Esc）走通、零 console error。

## 2026-07-27 — 配方表分頁 + 手法/走查連動 + 收斂最後一處 codex 覆寫（cycle 2026-07-27-收官提案批次）

**為什麼**：收官提案經 Owner 挑選後執行（B-005 關閉、翻頁、連動、lint 收斂）。

### Added
- **配方表翻頁器**（取代舊的 `CAP = 120` 硬截斷）：13874 筆原本只給前 120 筆、其餘要靠篩選才看得到——想「瀏覽金工 90–100 有哪些」的使用者會直接漏看。改每頁 60 筆 + 上/下一頁 + 「第 N / M 頁 · 共 X 個配方」。**頁碼重置靠 `filterKey()` 篩選指紋比對，不靠呼叫端傳參**：`renderTable` 有 5 個外部呼叫點（搜尋/等級/rlv/職業 chip/showPicker），用參數就會有人漏傳而靜默停在不存在的頁；指紋法讓「篩選變了就回第 1 頁、翻頁本身保留頁碼」自動成立，且返回配方列表時頁碼不被重置（延續既有「返回不重置瀏覽狀態」承諾）。翻頁後 `recipe-table.scrollTop = 0` 並把焦點留在同一顆按鈕（連續翻頁不掉焦點）。
- **手法序列 ↔ 逐步走查雙向連動**：上一輪加的序號角標建立了對應關係，但點下去沒反應。手法卡改 `<button data-step>`（原為 `div`，順帶取得鍵盤可達性），點任一側高亮兩側同序號項並捲進視野；走查若為收合狀態會自動展開（否則使用者以為「沒反應」）。純檢視輔助，不動任何求解狀態。

### Changed
- `.codex-tabs { margin-bottom }` → `#main-tabs { margin-bottom }`：這是本 repo **最後一處** design-lint R5 grandfather 覆寫。外距是本頁版面需求、不是元件屬性，掛在工具自己的 ID 上才對。**`check-design-drift --strict` 現為零警告**（原本每次都印一行）。

### Removed
- ~~B-005（首載 4.8MB JSON parse 優化）~~ **實測推翻前提後關閉**：4.8MB 是解壓後大小，CF Pages 已上 brotli → **實際傳輸總計 536 KB**；`JSON.parse` 七檔合計 **~10 ms**。worker parse／資料分片都在解不存在的瓶頸。詳見 `docs/BACKLOG.md` B-005 的否決註記。

### Testing
- `tools/test-formulas.mjs` **87 → 96**：T11 擴充分頁契約（第 1 頁 60 列／頁碼文案／翻到末頁餘 10 列／首末頁按鈕停用／**篩選變更回第 1 頁**／單頁時翻頁器清空且不顯示頁碼）。
- 瀏覽器實測：13874 筆 → 232 頁、翻頁後 count 同步、搜尋後回第 1 頁、點第 13 張手法卡 → `chip[data-step=12]` 與 `tr[data-step=12]` 同時 `.is-linked` 且走查自動展開。
- **行動版 393×852 CDP device emulation 實測**（`ranking/tools/mobile_viewport_check.mjs`，非 headless `--window-size` 假 viewport）：`pass: true`、`scrollWidth == 393` 無橫向溢出；唯一 offender 是 portal 全站共用的貓小胖 canvas，非本工具元素。**但仍未掛 portal `mobile: true` 牌**——「不破版」不等於「已優化」，掛牌需另走一輪正式優化（badge 誠實性）。

### 外審（codex/gpt-5.6-sol，`.adversarial-reviews/ef046e1a-codex.md`）

第一次 `effort=high` 回 `status: timeout`（362s 硬砍、0 findings）——依 adversarial-review 鐵則「timeout 的 0 findings 不算通過」，降 `effort=medium` 重跑得 `status: ok`、152s、`bytes_in` 104822、**7 findings**。triage：

| # | 級別 | 判定 | 依據 |
|---|---|---|---|
| 1 | 高 | ✅ 採納 | **求解中改設定不會作廢飛行中的求解**——`invalidateResults()` 的 early return 看 `results.hidden`，而求解期間正是 hidden → 舊 worker 回來時 `solveGen` 未變、世代守衛放行 → 用舊設定算的手法渲染在新設定的畫面上。2026-07-25 T13 只修了「換配方」那條路徑，「改食藥／技能／目標品質／角色數值」這條漏掉。已修＋補 5 條回歸測試 |
| 2 | 中 | ❌ 駁回 | 指 sticky CTA「捲到底前不會出現」。實測否定：`scrollY=0` 時 `barTop=1143 / innerHeight=1215`，五個捲動位置 `inViewport` 全為 true——`position:sticky; bottom` 本就會把尚在下方的元素提前吸到容器可視底部 |
| 3 | 中 | ✅ 採納（重述後） | 分母與主數值原本是一致的（都 `maxQ`），非 bug；但「全部素材換 HQ 卻只填到一半」確實誤導。改為 bar 與主數值同用**可帶入上限 initMax**，`maxQ` 佔比移到下方註記，兩個尺度分開講 |
| 4 | 中 | ❌ 駁回（採其防禦建議） | `fillConsumableSelect` 的 option value 就是繁中名，不會顯示機器值。但改讀 `selectedOptions[0].textContent` 零成本且防未來漂移，已採 |
| 5 | 中 | ✅ 採納 | ＋鈕縮到 28px 未配 coarse-pointer 補償，而本 repo `.ing-hq-in` 早有此慣例；整列本身可點 → 手機誤觸會變成「選配方」。已補 40px |
| 6 | 低 | ✅ 採納 | 流程狀態變化無可播報 live region。`#flow-next` 加 `role="status"`（只掛這一行，不讓整條步驟軸重複播報） |
| 7 | 低 | ❌ 駁回，但**反向更正了我自己的紀錄** | 指「自稱四閘全綠卻沒跑 cargo test」。查證：`cargo test` **每次 commit 都由 pre-commit 的 `check-test-baseline` gate 實跑**（`execSync(cmd,{cwd:'wasm'})`，round-trip 2 綠）。反倒是我在上一段 CHANGELOG 誤記「wasm 未改動故未跑」——該句已更正 |

## 2026-07-27 — 修 7 個技能 icon 取到「無圖示」佔位圖 + 設定區三處版面調整（cycle 2026-07-27-icon佔位圖修正）

**為什麼**：Owner 在手法序列上看到多個技能顯示灰底紅斜線圖，問「為什麼會有刪除號的 icon，明明遊戲中還存在」。

**根因**（實地查 `game_ref.sqlite` 得出，非推測）：CraftAction sheet 對同一技能有多列——8 個 DoH 職業各一份，**外加一批 `ClassJobLevel=1` 的未使用佔位列，其 `Icon` 一律是 `000786`（灰底紅斜線的「無圖示」圖）**。`build-data.py` 的 `lookup()` 用 `ORDER BY id LIMIT 1` 取 id 最小的那列，而佔位列的 id 正好最小 → **秘訣／比爾格的祝福／堅信／模範製作／上級加工／高速製作／倉促** 這 7 個技能全中。且不會報錯、不會缺圖，只是圖看起來像「已停用技能」，所以一直沒被發現。
（現行 `data/craft-actions.json` 停在更舊一版 game_ref 產出的佔位 icon `001517`／`001521`／`001768` 等——這些 id 在現行 game_ref 已不存在，屬同一個根因的較早期表現。若不修，下次重跑 build-data 只會變成更明顯的 `000786`。）

### Fixed
- `tools/build-data.py` `lookup()` 選列策略：**排除佔位 icon → 取 `class_job_level` 最大的那批**（真正習得的技能列，佔位列 level 恆為 1）**→ 同批內取 id 最小**（固定同一職業版本，避免各技能各拿不同職業的 icon 而風格不一）。7 筆全部修正為 `0019xx` 跨職通用 icon，其餘 28 筆零變動。
- `tools/build-data.py` 新增 `--actions-only`：只修技能對照時不必重刷 3.5MB 配方資料（那批來源是 best-craft 凍結的 static-data，有自己的重建節奏）。
- `tools/check-actions.py` 加不變量：**icon 不得為空、不得是 `000786` 佔位圖**（實測故意塞回佔位圖會紅燈）。教訓固化成測試，不靠人眼看圖。

### Changed
- **消耗品區卡片化**：展開後是一組有功能的表單卻裸貼在卡片背景上、欄位像散落的 → 給自己的 surface 卡片底；「專家之證」是角色狀態不是消耗品，加上緣分隔線與食物/藥水兩列分開。
- **配方詳情的動作鈕改自成一列靠右**：設定欄只有半版寬，按鈕硬塞到名稱同行會把長配方名擠成兩行、連數值都跟著折行。靠右後與左側資訊不競爭，形成「資訊 → 動作 → 狀態」的縱向節奏。
- **基礎資料改一行 label+值**（難度 3200 · 品質 6900 · 耐久 80）：格子化只是把三個小數字撐成三個大方塊；職業改身分 chip，與數值語意分形。
- **手法序列 icon 統一底框**：技能 icon 素材留白差異大（跨職通用是滿版魔法陣、職業專屬是帶留白的工具圖），套同尺寸深底圓角框後每格視覺重量一致。

> 職業專屬 icon **不跟著配方職業走**（做金工配方仍顯示木工版鋸子）＝**Owner 同日裁示的最終取捨**：技能名稱一致、只是圖示因職業略有差異，不影響使用，不值得為此改 `game_ref` 資料模型（`docs/BACKLOG.md` B-008 已否決）。驗收紅線收斂為單一條：**不得出現佔位「刪除號」圖**，由 `check-actions.py` 不變量機械守。

## 2026-07-27 — 求解分頁引導改造：三步流程軸 + 模塊化設定區（cycle 2026-07-27-求解頁引導改造）

**為什麼**：Owner 實地回報「配方生產的 UIUX 應該要有更強的引導性，而不是讓使用者自己摸索——區域位置、操作要有流程且有序；可操作的部分必須高亮，不是塞一個欄位在那邊等人發現」。對照設計系統新成文的 §🧭 功能頁引導標準（2026-07-27），本頁四條驗收線**全部不合格**：冷啟動只有一張配方表沒說這頁能產出什麼；選完配方後「選配方」大卡只剩一行卻仍佔一整張 tablet；右欄是一片 1045px 高的空黑面板配兩行小灰字；求解選項的說明全靠 hover `title`（停頓 1 秒才出、觸控無效）；三個停用態（缺角色數值／NQ 模式的目標品質／高難度的確保品質可靠）**一個原因都沒寫**。

### Added
- `app-flow.js`（新層，115→134 行）＝流程引導層 `globalThis.CraftFlow`。核心是純函式 `flowState()`：由「有無配方／有無角色數值／求解中／有無結果」算出 ①選配方 ②設定條件 ③求解取巨集 的三態（完成／進行中／無法進行／待辦）與**固定位置的「下一步」一句話**。所有引導呈現（步驟軸、pick-panel 收合、CTA 就緒提示、`work.is-idle`）都由這一份狀態驅動 → 不會出現「兩處高亮」或文案各層各寫。
- 結果欄空狀態改 `.codex-empty`：寫明「求解後這裡會出現：巨集／手法序列／逐步走查」＋一顆可直接按的 ghost CTA（主 CTA 唯一性不破）。設定變更失效時**保留這張卡並在上面加警語**，不再只丟一句「⚠ 設定已變更」把入口拿掉。
- 主 CTA 改 sticky action bar（`.crafter-actionbar`）貼設定欄底部，旁邊常駐一行狀態：就緒／「尚未設定〈職業〉的角色數值，無法求解」。

### Changed
- **選定配方後整張選配方卡收合成一行摘要條**（JS 卸下 `codex-tablet` 系 class 改掛 `.crafter-picked`）——驗收線 4「流程走完把版面還給主內容」。
- **求解選項改常駐一行說明**（`.crafter-opts`／`.crafter-opt__desc`），選中態換底色；求解模式／目標品質改正式 `.codex-field__label` 表單標籤（禁 placeholder 當 label）。每張設定卡加一行「這張卡在決定什麼」。
- **消耗品摺疊列顯示現值**（`#consumable-sum`：未使用／食物 X（HQ）・專家之證）——不展開也知道有沒有吃食藥，直接回應「不要塞一個欄位等人發現」。
- **停用控制一律暗掉不隱藏＋寫出原因**：`#adv-why`（高難度不支援）、`#target-why`（NQ 模式不衝品質）；`#solve-btn` 缺角色數值時改 `aria-disabled`（**不用 `disabled`**——真 disabled 不可聚焦、SR 讀不到原因）且仍可按，按下由 `doSolve` 導去「角色數值」分頁。
- **尚無結果時結果欄不與設定欄等高**（`.work.is-idle`）：原本 `align-items:stretch` 把右欄撐成 1045px 空黑面板；求解中也維持 idle（結果仍是隱藏的，拉齊只會拉出空黑）。
- **全 repo 19 處 `title=` 全數改 `data-help`**（設計系統 2026-07-27 收緊的 ❓ 鐵則：按鈕/連結的簡短提示也不准用 title），`window.FFXIVHelp.setup()` 在 init 呼叫一次。含 `crafting-list.js` 的 5 處——同頁兩種提示行為併存＝格式不統一，故一次掃乾淨。
- `app.js` 503 → **490 行**：`setTargetMode` / `updateConsumableSummary` 兩個「停用原因與現值顯示」helper 移進引導層（職責本就屬那層，不是為了壓行數搬家）。

### Changed（第二輪：既有模塊的視覺整理，Owner 追加「原有的模塊也要 UI 整理跟美化」）
- **配方表**：`table-layout: fixed` + 百分比欄寬（📊 表格佈局穩定鐵則）——原本名稱欄吃掉全部剩餘寬，名稱與職業欄之間空出一大段；改後欄寬與內容脫鉤、篩選換頁不跳動。**列高不齊修掉**（`.rt-nmline` 補 `min-height`：原本插了「已加入」徽章的列會比其他列高一截）。每列實線分隔 → 淡化 55% + 斑馬紋（`:not(.rt-in):not(.is-sel)` 讓兩個語意態一定贏過裝飾）。＋鈕 38px → 28px（密集列裡主控件尺寸過重）。Lv／配方等級欄 `tabular-nums`。
- **配方詳情**：改三段式 grid（識別｜數值｜動作）——原本名稱、pill、按鈕、數值行全部平鋪無層級。icon 40→48px 加深底框；難度/品質/耐久改 label 上、值下的等寬 stat 格，職業另作身分 pill 不與數值混排；動作列以細線與資訊分區；**「套用〈預設〉數值…」那行浮動彩色字改吃共用 `.codex-tint-panel--bar`**（綠＝已套用／金＝缺數值），不再自寫 `.gear-ok/.gear-warn`。
- **素材列**：可 HQ 從整框金色改**左緣 3px 金條**（一整排金框比 accent 還搶眼）；「不可 HQ」四字重複 N 列＝噪音 → 改 `—` 佔位、說明移到 `data-help`；HQ 控制固定寬 → 各列輸入框左緣對齊成一直行。**初始品質改「數值 + `.codex-progress` 進度條 + 最高可帶入」**，一眼看得出離上限差多少。
- **結果區**：摘要獨立成 inset 卡；「N 步 · N 秒」改成值大單位小的 metric；兩條長條的右側數字定寬 + `tabular-nums` 對齊成一直行；**手法序列卡加 CSS counter 序號角標**（與「逐步走查」的 `#` 欄一一對應，純 CSS 不動 render）；走查表加斑馬紋 + `tabular-nums`；巨集框改 accent 淡框 + 深底（它是要被複製的產出物，不該長得像表單控件）。
- **角色數值表**：`width:auto + margin:auto` → `width:100%`（原本寬螢幕下表格孤懸中間、左右各一大片空白）；輸入框隨欄寬伸縮並在欄內置中；**「預設」列加淡 accent 底 + 加重下緣線**與 8 個職業列分開（它是 fallback，不是第 9 個職業）。

### Testing
- `tools/test-formulas.mjs` **75 → 87**：T14 在 vm sandbox 直接載 `app-flow.js` 測 `flowState` 純函式 —— 冷啟動／缺角色數值（blocked 且下一步要寫出是哪個職業）／就緒／求解中／完成五種情境的三步狀態、**上游變更使下游失效**（拿掉 hasResult → ③ 必須退回待辦）、**同時只有一步進行中**、每步文案非空、init 缺依賴早炸。
- 瀏覽器實測（`serve.py` :8809 + portal :8774）：冷啟動→選配方→求解→改設定失效→返回列表 全程零 console error；`data-help` 卡實測可彈出；缺角色數值情境（清空 localStorage）實測 ② 轉警示色且 CTA 暗掉。headless 1920 / 760 兩寬度無破版無橫向溢出。
- `check-actions.py` 35＝35；`design-lint --strict` exit 0（新 class 全走 `crafter-` 前綴、z-index 走 `--z-sticky` token）；`cargo test` round-trip 2 綠 — **由 pre-commit 的 `check-test-baseline` gate 實跑**（`execSync(cmd, {cwd:'wasm'})`），非略過。本段原先誤記「wasm 未改動故未跑 cargo test」，2026-07-27 外審指出宣稱與 VERIFY 要求矛盾後查證更正：四閘實際上每次 commit 都全跑。
- 第二輪視覺整理另實測：配方表列高逐列一致、手法卡序號角標與相鄰卡間距 12px 不重疊（量測 `getBoundingClientRect`）、760 / 1920 headless 無破版無橫向溢出、三分頁零 console error。

## 2026-07-26 — 清掉「已加入」徽章上已失效的 `codex-badge--text`（B-016 收尾）

**為什麼**：portal 的 B-016 Wave 3 把 `.codex-badge` base 翻成中文友好排版後，`--text`（原本的中文 opt-in）就退成 no-op 相容 alias。這裡的內容是「已加入 / 已加入 ×N」＝中文，base 本來就對，留著只會讓後人以為「中文一定要加 `--text`」而複製這個過時寫法。**零像素差**（alias 與 base 同值）。

- 同批的 `app-render.js` 反向處理：`HQ n%` 是純拉丁/數字短碼，加了 `codex-badge--code` 才保住 mono + 字距（`255381e`）；「品質 NN%」「✓ 可完成」含中文，刻意不加、跟著翻面收緊。
- 驗證：`node tools/test-formulas.mjs` 75 passed／`check-actions.py` 35＝35／design-lint exit 0。

## 2026-07-25 — 求解世代守衛：換配方後不再顯示舊配方的結果（cycle 2026-07-25-健檢HIGH）

**為什麼**：`doSolve` 只 `postMessage({ input: settings })`，訊息**不帶任何身分**；`onWorkerMsg` 收到就 `CraftRender.render`。而換配方 / 改設定**都不會取消飛行中的求解**：
- `selectRecipe` 只把 `#results` 藏起來、重寫 placeholder，沒有 cancel
- `invalidateResults` 開頭是 `if (results.hidden) return`——**求解中 `results` 正好就是 hidden**，所以改食藥/技能選項也不會作廢 in-flight job
- `#change-recipe` 在 `setSolving` 期間仍可點

結果：選配方 A 求解（expert 配方可跑數十秒）→ 中途換配方 B → A 的結果回來，`render` 照畫，但標題/詳情走 `getSelected()` 取的是 B。玩家看到的是「B 的名字 + A 的手法」，**複製出去就是錯綁的巨集**。

### Fixed
- `app-solve.js` 新增模組級 `solveGen`：`doSolve` 遞增並隨 `postMessage({ input, gen })` 送出；`worker.js` 原樣回傳 `gen`；`onWorkerMsg` 對 `gen !== solveGen` **整幀丟棄**（不渲染、不 toast、不動 UI 狀態——此刻可能已有另一次求解在跑，動 UI 會把「求解中」錯誤收掉）。
- `cancelSolve` 一併遞增世代：`terminate()` 與訊息投遞有 race，世代號是第二道保險。
- 新增 `CraftSolve.invalidateInFlight()`，`selectRecipe` 在成功切換配方時呼叫：世代守衛已擋住錯誤渲染，這裡負責收 UI 狀態（否則 `cancel-btn` 會亮在新配方頁面）＋釋放還在燒 CPU 的舊求解。放在兩個 `return false` 之後——選配方失敗時不該波及正在跑的求解。

### Testing
- `tools/test-formulas.mjs` **68 → 75**：T13 在 vm sandbox 裡用可控 Worker mock 跑**真行為測試**（不是 source ratchet）——訊息帶 gen／世代遞增／過期結果不渲染／當前結果正常渲染／已取消的結果不渲染／過期錯誤幀不 toast，外加 `worker.js` 必須回傳 gen 的契約斷言（守衛的另一半在 worker 側，漏了就整套失效）。

> 來源：monorepo `docs/health-reviews/external/2026-07-25-12repo-grok外審橫掃-health-review.md`（grok 零-context 外審 HIGH）。

## 2026-07-19 — 對抗審修復 + 製造清單雙卡片重整（C1/C2/C4 + Owner UI）

P0 交棒兩 commit（送端 crafter `4290059`、收端 marketboard `75c3828`）的 codex+grok 對抗審後修復 + Owner UI 回饋。本 repo 送端 `260e310`；收端修復在 marketboard `8b7c9ea`（原子 addMany/補償 rollback/gen 路由守衛/種件文案/mbChoice focus，M1–M6，247 綠）。
- **UI（Owner 回饋）**：製造清單「配方清單 / 素材總需求」拆成上下兩張獨立 `.cl-card`（`--color-surface` 底＋`--color-border` 框，不再平鋪混一起）；按鈕組（複製清單/開採購清單）移進素材卡頭右側對齊；配方瀏覽表 `.recipe-table` max-height 320px→60vh（用滿頁面空間、不再只露 ~6 列）；精簡分頁說明文字。全 token、零裸 hex、瀏覽器實測 + design-lint 過。
- **送端 harden（對抗審 C）**：C1 `invalidCount>0` 誠實 toast（不當整份成功）；C2 失敗文案分型（超限 vs 無可交棒，不再一律「過大」）；C4 `window.open` null 守衛 + `buildShoplistCsv` 依 itemId 升冪（穩定輸出）。
- 測試：test-formulas 60→**68**（T12 補多 item 排序契約）。旁路 cycle `2026-07-19-adv-review-fixes`。

## 2026-07-19 — 篩選控件包成獨立子面板（.filter-group，界線再硬）

承上「視覺分模塊」，Owner「把職業篩選＋搜尋列整組包進獨立子面板、界線更硬」（先給 dev 預覽核可後實作）。職業篩選 + 搜尋/等級列包進 `.filter-group`（index.html 加 wrapper）：raised 灰框卡（`--color-surface-hover` 底＋`--color-border` 框＋`--radius-md` 圓角＋`--space-3` padding），與下方結果列表（recessed cyan-bordered well）硬分兩區。**顏色全對照 portal tokens.css**（`--color-bg/-surface-hover/-border`、`--space-3/-4`、`--radius-md`、`--accent`=alias `--color-accent-cyan`），零裸 hex；`color-mix(--accent, --color-border)` 派生法同 header.css `.codex-btn--ghost:hover`。JS 無影響（wrapper 不動 ID 查詢）。瀏覽器實測兩區分開 + design-lint 過。旁路 cycle `2026-07-19-filter-group-panel`。

## 2026-07-19 — 配方表與搜尋控件視覺分模塊（styles.css）

Owner 反映「搜尋框跟顯示的列表框顏色太近、分不清哪個模塊」。根因：結果表 `.recipe-table` 用**跟 `.codex-input` 同款灰框 `--color-border`** ＋透明底（顯 panel 色）→ 讀作「另一個輸入框」。搜尋框為 portal 共用 `.codex-input`（不可覆寫），故強化本地結果表分模塊（全 token、無裸 hex）：
- `.recipe-table`：accent 染框 `color-mix(--accent 32%, --color-border)`（青框 vs 灰框輸入拉開）＋遞進實底 `--color-bg`（比 panel 深一階＝獨立內容井）。
- `.rt thead th`：底色 `--color-surface`→`--color-surface-hover`（原與 panel 同色會融）＋下緣 `1px --color-border`→`2px accent 染線`（明確界定列表頂）。
- 驗證：瀏覽器實測搜尋框（灰框）與結果表（青框＋加亮表頭）視覺分開；pre-commit design-lint 過。旁路 cycle `2026-07-19-list-panel-contrast`。

## 2026-07-19 — B-007 拆分對抗審修正（codex/grok d6ad9102）

Owner「請跑驗證」→ codex+grok 對抗審拆分 commit（codex 4 / grok 7 findings）triage（反查程式碼、真的才修）：
- **四閘全跑**（codex 阻擋）：實跑並記錄 node --check / test-formulas / check-actions / cargo test 全綠——原僅記 2 項、以「未動 actions/Rust」略過 check-actions/cargo，不符「未過不算完成」鐵則。
- **瀏覽層真測**（codex 中 / grok 高）：加 **T11** 直接載 app-browse.js（假 DOM ＋ 注入 deps）測 init 缺依賴 assert / renderChips 9 鈕 / renderTable 篩選 / CAP=120 / 種類副行 / 空狀態 / markListState 守衛 → **基線 50→60**（原 50 passed 不覆蓋 CraftBrowse，本輪補實）。
- **proxy/deps 脆弱**（grok F2/F3/F4/F5）：① proxy `const`→**`function` 宣告**（復 hoisting、消 TDZ）② renderChips/renderTable/markListState 加 `if(!deps)return` 守衛 ③ app.js init 加 `if(!globalThis.CraftBrowse)` 缺失早報（→ 錯誤橫幅非白屏）④ CraftBrowse.init 加**缺依賴 assert**（注入契約成不變量）。
- **CraftList 相容檢查**（codex 中）：＋鈕與詳情加清單由 `if(CraftList)` → `typeof CraftList?.add==='function'`（半套/舊版 global 不炸 TypeError）。
- **rlvVal 空狀態**（codex/grok 低，搬移前既有 bug）：`recipe-count` 空判斷補 `rlvVal` → 僅配方等級篩選 0 命中顯「無符合配方」（T11 鎖）。
- **行數更正**（codex/grok 低）：改用 **wc -l**（pre-commit gate 同法）：app.js 454（先前 Measure-Object 437 低估）、app-browse.js 104（先前 91）。
- **驗證**：四閘全綠（test-formulas **60** / check-actions 35=35 / cargo test 2 / node --check）；瀏覽器實測整條瀏覽流程（表 120/職業篩選/選配方/返回/綠底標示）零 console error。push 待 Owner。

## 2026-07-19 — B-007 抽 app-browse.js（配方瀏覽層拆分，app.js 502→437 <500）

Owner 核可 B-007（「有多個可拆分的獨立功能可拆」）。對抗審點名 app.js god-file 續脹 >500。
- **抽出**：`app-browse.js`（`globalThis.CraftBrowse`，91 行）＝ `renderChips`（職業方形按鈕條）/ `renderTable`（配方表）/ `markListState`（已加入綠底標示）＋私有 `jobFilter`（僅本層讀寫，app.js 移除該 state）。
- **留 app.js**：`selectRecipe`/`showPicker`/`refreshSelectedGear`/公式/所有 state——選擇與詳情狀態機耦合過重（引用 selected/openedFromList/gearFor/renderIngredients/switchTab…），同批移風險高於效益。只抽最內聚、對外僅注入依賴溝通的「配方瀏覽表」單元。
- **pattern**：沿用 app-render/app-solve/crafting-list 已驗證的 **classic-script + deps 注入**（非 module 化，免破壞 test-formulas vm 載入）。RINDEX/selected 由 **getter** 注入取 live 值（loadData 會重賦值綁定、持舊參照看不到新資料）；selectRecipe/toast 注入。
- **零改呼叫點**：app.js 以**同名 proxy const**（`renderChips`/`renderTable`/`markListState` = `() => globalThis.CraftBrowse.X()`）委派 → 既有 init/showPicker/debouncedRender/level-filter 監聽/CraftList onChange 全部沿用不動。`CraftBrowse.init` 於 loadData 後、render 前注入。
- **index.html**：app-browse.js classic script 加在 app-solve.js 後、app.js(module) 前。
- **驗證**：node --check（app.js/app-browse.js）/ test-formulas **50 passed**（app.js 仍 classic-interop、vm 載入不破；CraftBrowse 未載但 proxy 未被觸及＝loadData reject 先中止 init）；瀏覽器實測整條瀏覽流程（CraftBrowse init / 表渲染 120 / 職業篩選鍊金全對 / 選配方收合 picker＋填詳情 / 返回列表 / 已加入綠底初繪＋篩選重建各 4）**零 console error**。push 待 Owner。

## 2026-07-19 — 配方瀏覽 UX 再強化（已加入清單綠底標示／道具種類副行／職業篩選方形化）＋ codex/grok 雙審修正

依 Owner 一輪回饋（分頁序／加清單無反饋／橢圓標籤／不知哪些已加入／配方名補說明）。旁路 cycle `2026-07-19-browse-ux`。code commit `5e399d78`；對抗審 `.adversarial-reviews/5e399d78-{codex,grok}.md`（codex 3 / grok 11 findings）triage 後修正。

**功能：**
- **已在清單持久標示**（核心，Owner「頁面除通知外根本沒提示、不知哪些已加入」）：配方表已在清單的列**整列換綠底**（`color-mix` success 14%）＋左緣 success 色條＋名稱旁「已加入 ×N」綠徽章。加入/移除/改數量即時同步：`CraftList` 暴露 `has/count`＋`onChange` 回呼；app.js `markListState` **in-place 更新**（不重建表→保留焦點），renderTable 初繪與 CraftList 變更皆呼叫。**為什麼**：綠底掃視是「已加入」最直接訊號，補足原本只有一閃通知。
- **道具種類副行**（Owner「配方名補說明如道具種類」）：配方名下方補繁中道具種類（`item_lookup.ui_category`，繁中正名、配方成品 100% 覆蓋 11333/11333）。`build-data.py` 加 `category` 欄（保持權威）、`items.json` surgical 重生（只讀已 commit 的 recipes/ingredients、不重抄 static-data 避免 drift；13759 items 全含 category）。
- **職業篩選方形化**（Owner「不要橢圓標籤、參照共用設置」）：pill `.codex-chip` → 方形 `.codex-btn` 分段條（選中 `--primary` 填色 / 未選 `--ghost`），保留真實職業 icon（JOB_ICON→xivapi，非 emoji）；不本地覆寫 codex-* 屬性。參照生態既有（ranking role 篩選為方形條）。
- **toast 帶配方名**：加入通知由通用文案改帶配方名。**分頁序**：角色數值移到最右（求解 / 清單 / 角色數值）。

**codex/grok 雙審 triage（反查程式碼、真的才修）：**
- 🔴 **cap 謊報**（codex 中 / grok 低）：qty 到 999 上限仍報「+1（共 999）」而資料沒變 → `add()` 早退＋warn toast，不謊報、不觸發無效 render/notify。
- 🔴 **✓ 假 affordance**（grok 高）：in-list 按鈕原改 ✓ 填色，像「已完成/點擊取消」但實際 +1 → **按鈕恆為 ＋**（動作一致），in-list 只靠綠底＋徽章；順帶移除 `data-name`（grok 質疑雙重編解碼）。
- **markListState 守衛**（grok 中）：加 `typeof CL.count !== 'function'` feature-detect（舊快取/半套 init 不炸整表互動）。
- **is-sel + rt-in 疊加**（grok 中）：加 `.rt-in.is-sel` accent 淡染＋is-sel 外框 → 選中的 in-list 列選中態不被綠底吃掉（headless 實測 bg=accent16% / outline=cyan）。
- **徽章位置**（grok 低）：移到名稱同行旁（`.rt-nmline`）。
- **駁回（反查後）**：grok「toast XSS」＝誤報（portal `FFXIVToast` 用 `textContent`、item_name 可信遊戲資料，esc 反顯字面 `&lt;`）；grok「死 codex-chip CSS」＝已無殘留（grep 零）、flex-wrap 防溢出。
- **測試固化**（codex/grok「新行為零測試」）：加 T10 清單 add/has/count＋上限誠實＋onChange 次數；**基線 40→50**。
- **app.js 502 行 >500**（codex 阻擋 / grok 中）：拆分候選正式立 **B-007**（app-browse.js）交 Owner 拍板；本輪不當場擴 scope（鐵則「列候選不當場擴大」＋避免剛驗證的 code 回歸風險）。

**驗證**：node --check／test-formulas **50 passed**／design-lint（success fallback 對齊 tokens `#7dd87d`）；瀏覽器實測綠底／徽章名稱行／按鈕保持 ＋／種類副行／篩選重建保留／選中疊加／分隔線對齊（td 底邊逐欄一致 448/495/…）皆綠。push 待 Owner。

## 2026-07-19 — B-002 app.js 職責拆分（658→488 行，<500 達標）＋ portal `.codex-btn[hidden]` 守衛

Owner 核可 B-002。**為什麼**：整合改造後 app.js 達 645 行、兩輪雙審阻擋「god-file 續膨脹、跨功能回歸風險」。
- **拆分策略**：沿用本 repo 已驗證的 `crafting-list.js` **classic-script + deps 注入** pattern（非重寫每個狀態參照、非引入 globals 碰撞風險）。抽最自包含的兩層：
  - `app-render.js`（`globalThis.CraftRender`，120 行）：hqPercent(純)/render/手法序列 chips/走查/巨集。注入 **getter**（getSelected/getItems/getActions）取 live 狀態——loadData 會重賦值 ITEMS/ACTIONS 綁定，持舊參照看不到新資料。
  - `app-solve.js`（`globalThis.CraftSolve`，98 行）：worker 生命週期/doSolve/求解計時/結果分派/取消/setSolving。worker·solveClock 為該層私有；渲染委派 CraftRender、公式/gear/switchTab 由 app.js 注入。`invalidateResults` **留 app.js**（被 gear/原料/求解輸入多處外部呼叫、求解層內部不呼叫它）。
- **未全做原 6 層**：formula/gear/data 仍在 app.js——`computeSettings` 是對抗驗證公式（AGENTS 鐵則「勿動」），機械化拆它風險高於效益，且 488 已達標。
- **test-formulas 相容**：app.js 未用 ES import（仍 classic-interop via globalThis），vm 載入手法不破；hqPercent 改從先載的 app-render.js 取；**40 passed 持平**。
- **portal 守衛**（B-006 部分，另 repo commit `cf3813d`）：`header.css` 加 `.codex-btn[hidden], .codex-chip[hidden] { display:none }` 集中守衛（display:inline-flex 蓋 UA [hidden]）；crafter 本地 interim 守衛待 CDN 上線後移除。
- **驗證**：node --check ×5 檔 syntax OK / test-formulas 40 / check-actions 35=35 / cargo test 2；瀏覽器實測 rlv710 求解 doSolve→worker→onWorkerMsg→render 端到端正確（品質條/巨集分段/複製/手法序列 icon chips/走查/狀態列）、零 console error。

## 2026-07-19 — 整合改造第二輪雙審 + 增強（複製清單／等高欄／scope 修正）

第二輪 codex+grok 雙審（span `744449ed`，報告 `.adversarial-reviews/744449ed-{codex,grok}.md`）triage ＋ Owner「優化與加強／求解器整齊美化」追加：
- 🔴 **openedFromList 頂部 tab 洩漏**（雙審，上輪未補完）：原只在返回鈕/showPicker 清 flag、**點頂部「製造清單」tab 沒清** → 集中到 `switchTab` 離開 solve 即清 flag + 收返回鈕（涵蓋所有出口）。
- 🔴 **`.codex-tab` 全域選擇器劫持**（codex 高）：switchTab/init 用 `document.querySelectorAll('.codex-tab')` 會綁到 portal 共用分頁元件 → tablist 加 `#main-tabs` 容器 id、所有查詢 scope 化。
- **`.codex-btn[hidden]` 收窄**：由覆寫共用 `.codex-btn` 改為本工具具體按鈕 ID（`#change-recipe/#cancel-btn/#solve-btn/#back-to-list[hidden]`），不碰共用根 selector（codex 阻擋）。
- **配方表事件委派**：取代每列 2N listener（篩選重繪不重綁、行動省 GC）；＋ 缺 CraftList 補 error toast（不靜默吞）。
- **mbItem/mbCraft 型別收斂**：非正整數 → `'#'`（禁 `#/item/undefined`）；T8 改測 route 契約（endsWith，env 無關）+ 壞輸入，加 T9 selectRecipe 回傳契約；**基線 37→40**。
- **增強：複製素材清單**（Owner「加強」）：清單「📋 複製清單」→ 彙總素材轉純文字（每行「名稱 ×數量」）貼遊戲/記事本採買；`copyText` 泛化成功訊息與巨集複製共用。
- **UI 整齊**（Owner「求解器整齊美化／長短高度不要混亂」）：求解兩欄 `align-items:stretch` 等高（消「左高右矮」長短混亂）、未求解時 placeholder 於等高結果欄垂直置中。
- **升級 Owner 未自改**：app.js 645 行（B-002 狀態改「待 Owner 重新拍板」）；noopener 全 repo 慣例 + portal `.codex-btn[hidden]` 全域守衛（B-006）。巢狀 a11y row+button：委派後仍記錄（設計系統無「可點列」primitive；自製 name-button 犯上輪點的另一問題，取捨標記）。
- **基線**：四閘全綠（test-formulas **40** / cargo test 2 未動 / check-actions 35=35 / node --check）+ 瀏覽器複驗（頂部 tab 洩漏、等高欄、複製清單、事件委派選配方/加入）零 console error。

## 2026-07-19 — 頁面整合 UX 改造（三頁等寬／快速加清單／marketboard 來源整合／導覽／codex 遷移）

依 Owner 反映「頁面整合很弱」五痛點（grok+codex 諮詢 → 實作 → 雙審 triage）。旁路 cycle `2026-07-19-page-integration`。

- **三分頁等寬**（痛點5）：角色數值/製造清單原各 max-width 720/880 置中、求解滿版 → 切頁內容寬度跳動。改三頁一律吃滿 `.codex-container`，內表以 `margin-inline:auto` 置中。**為什麼**：切頁 panel 邊界不跳＝整合感基礎。
- **瀏覽表快速加清單**（痛點4a）：配方表每列加 `＋` ghost icon 鈕，`stopPropagation` 只加清單不進詳情；row keydown 加 `e.target===tr` 守衛防 button 冒泡誤選。
- **返回導覽**（痛點4b）：選配方後右上「← 返回配方列表」鈕（唯一返回控件）＋「目前配方：X」誠實狀態列；showPicker 還焦。（**雙審修正**：原做「配方瀏覽›」假 nav 麵包屑、死 span 誤導可點 → 改誠實狀態文字。）
- **清單↔求解**（痛點3）：清單列「前往求解 →」明示鈕（selectRecipe 回傳成功才切頁＋移焦，**雙審修正**：原失敗仍切頁）；從清單進入才顯示「← 回製造清單」，回清單/返回瀏覽即清 `openedFromList` flag＋收鈕（**雙審嚴重修正**：原 flag 不清 → 切回 solve 殘留幽靈導覽）。
- **marketboard 來源整合**（痛點2）：DRY helper `mbItem`/`mbCraft`（item_id≠recipe id 分清）；清單素材/求解原料→`#/item`（查價・來源）、配方→`#/craft`（BOM・利潤）；晶體亦可上市場板交易故一律連（**雙審修正**：原排除晶體 → 文案/行為不一致）。named target 共用分頁、沿用不加 noopener 慣例（全 repo 一致性決策待拍板，見 B-006）。
- **美觀整合**（痛點1）：分頁→`.codex-tabs`、職業篩選→`.codex-chip`(aria-pressed)、空狀態→`.codex-empty`+CTA、詳情動作列統一 ghost 鈕群、清單摘要（種數/總次數語意分清）、首次提示加「前往角色數值」CTA。
- **順修既有 bug**：① `.codex-btn[hidden]` 守衛（`display:inline-flex` 蓋 UA `[hidden]` → change-recipe/cancel-btn 誤顯；`[hidden]` specificity 已足、不用 !important；portal 宜全域補，見 B-006）② 配方表 `.rt-name` flex 移到內層 `.rt-cellflex`（勿對 `<td>` 設 flex → 名稱欄 border-bottom 與他欄不對齊，Owner 回報的老 bug）。
- **a11y**：tablist ←→/Home/End + roving tabindex + 程式化切頁移焦；icon 鈕皆 aria-label。
- **基線**：VERIFY **四閘全綠**（node --check／test-formulas **34→37**：+T8 mbItem/mbCraft URL 契約 golden／check-actions 35=35／`cargo test` 2 passed）＋瀏覽器全流程 smoke（三頁等寬、快速加入、導覽往返、清單→求解→回清單 flag 生命週期、素材→marketboard `#/item` 端到端）零 console error。雙審報告＝`.adversarial-reviews/e256d015-{codex,grok}.md`。
- **未竟（升級 Owner）**：app.js 645 行破 500（B-002 拆分重浮檯面）；marketboard 連結 noopener 全 repo 慣例 + portal `.codex-btn[hidden]` 全域守衛（B-006）。巢狀互動 a11y（可聚焦列內含按鈕，`e.target===tr` 守衛保鍵盤正確）與配方表 per-row listener（CAP 120，可改事件委派）＝既有模式、記錄不本輪大改。

## 2026-07-16 — 求解巨集一鍵存進巨集庫（portal deeplinks cycle 波次 2 出端）

- 巨集區加「📥 存進巨集庫 ↗」：全部分段組 `[{title,lines}]` → base64url（UTF-8 先 TextEncoder，非裸 btoa）→ macro-builder `?import=`（named target 共用分頁、不加 noopener——生態互跳鐵則）。title＝「物品名 段X/Y」20 字元 Array.from 截斷；最終 URL >8KB 不出鈕（防呆，實務 ~1KB）。**為什麼**：求解完的巨集本來就要進遊戲巨集庫，過去要逐段複製貼上；收端有確認 modal、絕不自動寫入。**基線**：`test-formulas.mjs` 34 passed 持平；端到端實測（含 Owner 真實 UI 路徑＋壞 payload／取消／確認三態）過。傘狀 spec：portal `docs/specs/2026-07-16-cross-tool-deeplinks-design.md` 配對 2。

## 2026-07-16 — 配方資料換源 zh-CN 跟版 7.5 ＋ icon v2 CDN 修復（旁路 2026-07-16-data-source-sync）

- **配方資料換源 zh-CN**：data/ 全量重建 11,803→13,874 配方（+2,148 筆 7.2–7.5 新配方、rlv 720→775）。**為什麼**：上游 tnze zh-TW 資料源停更於 7.1 世代（max recipe id 36059，實測與快照零差異），zh-CN 源與國際版同步；繁中名走 item_lookup `name_tc`（權威、非機轉），與舊 zh-TW 名交叉驗證 11,603 筆重疊 99.89% 一致（13 筆差異=item_lookup OpenCC fallback 名，root fix 歸 monorepo BACKLOG B-005）。上游換源實作在 best-craft `scripts/build-static-data.py`（zh-CN 爬取＋⑦繁中化＋ingredients 補爬）。
- **舊染劑配方 30001–30200（200 筆）隨源移除＝遊戲 7.5 染劑改版**：逐色染劑配方在現行遊戲資料已刪除、改為每職業一筆「通用染劑」（38254–38261，已入列）——非資料缺漏，勿當 bug 回補。
- **icon 換 xivapi v2 asset CDN**（`app.js` `iconUrl()` + `_headers` CSP img-src）：v1 `xivapi.com` 圖庫停更、7.5 新物品 icon 全 404（實測 057489 → 404、v2 → 200）。寫法對齊 marketboard `modules/icon.js`（DRY 權威），輸入沿用 data 層 v1 路徑格式免改資料。
- **新增「製造清單」分頁**（Owner 需求，基底範圍拍板）：配方詳情「📋 加入製造清單」→ 清單分頁管理數量（次數）/ 移除 / 點名跳回求解，自動彙總素材總需求（晶體殿後對齊遊戲 BOM），localStorage 持久化＋資料改版自動剔除消失配方。**落新檔 `crafting-list.js`**（98 行 classic script，`globalThis.CraftList` 橋接——app.js 已破 500 不再加大、且保住 test-formulas 的 vm 載入手法）；彙總純函式 `aggregateMats` 進 T7 golden（測試基線 29→34）。

## 2026-07-11 — R2 複檢修復（M1 + sec/docs/UX 建議批）

依 R2 複檢報告（`docs/health-reviews/2026-07-11-R2複檢-health-review.md`，體質 7.8／使用者 7.5）修須修改 M1 + 全建議清單。

- **M1 專家之證 CP +15**（`d70d590`）：`effectiveStats` 原僅補作業/加工 +20、漏 CP +15 → CP 吃緊的專家配方（目標族群）被低估、易誤判 NoSolution/次佳；`index.html` 標籤同步補「CP +15」。**遊戲值查證**：game_ref.sqlite 只存技能/狀態（無此機制值）→ 改查 item_dict（id 10336「專家水晶」，簡中「专家水晶」，灰機 `物品:专家水晶` 佐證）+ Soul of the Crafter 專家狀態既定加成＝作業+20/加工+20/CP+15（既有 +20/+20 同源、CP+15 為其第三腳）。**為什麼**：專家配方正是本工具核心客群。
- **批次 0 — 前端純函式 golden 測試**（`d70d590`，quality A1 / BACKLOG B-004 具體化）：新增 `tools/test-formulas.mjs`（node+vm 載 app.js，假 DOM + fetch reject → 頂層 IIFE 走 catch 無害），斷言 `computeSettings`（spec §4 對抗驗證值 rlv640/工藝4048/90級→base_progress 250 當 golden）/ `hqPercent`（60 斷點抽樣含邊界 100·99/98·5/2·0·超上限·maxQ=0）/ `recipeMaxes`（floor）+ 專家之證 CP+15 金鎖 + sec A1/A2 哨兵 → **29 passed**。**為什麼**：測試基線 3→4 機械閘，公式回歸與 M1 修復固化。
- **安全縱深 sec A1/A2**（`d70d590`）：`g.level` render 前補 `Number()` 硬化（localStorage self-XSS 殘縫，前輪 gear 輸入硬化漏此顯示路徑）；`saveGear` 空 catch 補 `console.warn` + 一次性 toast（違「禁靜默吞非預期錯誤」字面）。哨兵固化於 test-formulas.mjs T6。
- **UX A1/A2/A3**（`d70d590`）：求解等待由 60s 一次性訊息改 `solveClock` interval 每秒更新耗時（求解在 worker、主執行緒空閒故不凍結）、文案「數秒→數十秒」、≥60s 升級可取消提示但不殺 worker；placeholder 方位詞中性化（手機堆疊版面「左側/→」失準）；首載 spinner 改靜態指示（主執行緒 parse 大 JSON 時 CSS 動畫凍結像當機——止血，根治歸 B-005）。
- **docs-drift**（`a6ab096`）：VERIFY 機械閘 3→4；`solveTimer`→`solveClock` 註記對齊；DRY 條括號改繫（game_ref ←build_game_ref.py、craft-actions ←build-data.py）；手動 smoke 指令由裸 `python -m http.server` 收斂為 `py -3.11 tools/serve.py`（AGENTS + README）。

## 2026-07-11 — 健檢收官 + DEVLOOP retrofit

依健檢 2026-07-04 計畫收尾剩餘項（0-2 + 全建議清單），並把本 repo retrofit 進 DEVLOOP。

- **0-2 wasm round-trip 測試**（`62cff52`）：`wasm/src/lib.rs` 加 `#[cfg(test)]` — 斷言全 35 個 Action 變體 `parse_action(action_name(a))` 對回同一變體（防兩份平行列舉拼寫分歧不編譯報錯）+ 名稱唯一檢查。順帶 CQ-05：4 個未消費 Output/Step 欄位註明「保留給 simulate」。**為什麼**：`cargo test` toolchain 先前不可用而延後，本次補齊 → 測試基線 1→3 機械閘。
- **安全縱深 SEC-01/02/03**（`3211540`）：esc 補單引號成無例外通用轉義、gear 值 render 前 `Number(v)||''` 堵 localStorage self-XSS sink、引擎 error 字串包 esc。**為什麼**：把「資料→innerHTML 必 esc」推成無例外不變量（icon 來自可信 build-data 故不包）。
- **韌性 RES-02/03/04/05**（`23d4dba`）：fetch 加 `!r.ok` 檢查、meals/medicine 獨立降級不拖垮整站、toast CDN 未載時原生 alert 後備、複製抽 `copyText` 加 execCommand fallback。**為什麼**：非必要資料 / 行動 webview / CDN 失效時仍有可見回饋。
- **a11y/ux a11y-04/05 · ux-3/5**（`99d9529`）：HQ 框觸控放大、求解後移焦、深連結找不到提示、目標品質超上限即時回填。
- **可維護性 CQ-01/02**（`5eddfe9`）：抽 `recipeMaxes()` 單一算式防上限漂移（2000 筆配方等價性驗證 0 mismatch）、worker 契約去死 `cmd` 欄。
- **DEVLOOP retrofit**：新增 `AGENTS.md`（S 級自聲明 + 鐵則 + VERIFY 基線 + 架構索引 + 開發循環）、`CLAUDE.md` 轉接化、`CHANGELOG.md`、`docs/BACKLOG.md`。**跳過**：DATA-2（待拍板）、CQ-06（app.js 拆分，現階段不動）→ 進 BACKLOG。

## 2026-07-04 — 健檢修復批次 0–3

依 `docs/health-reviews/2026-07-04-crafter-fix-plan.md` 修 6 個須修改項 + 部分建議（前序 session，本次收官前完成）。

- **批次 0 — 機械護欄 + 文件 drift**（`6b501c2`）：新增 `tools/check-actions.py`（action-set 35=35 不變量閘）、README drift 修正、補精簡 CLAUDE.md + VERIFY 段。
- **批次 1 — 核心信任**（`d3a9348`）：expert 配方巨集加不可用警語、改任一設定使舊結果失效（`invalidateResults`）、品質% 改 `Math.floor` 除假 100%、順帶 ux-6（NQ 停用目標品質欄）。
- **批次 2+3 — 求解回饋 + 首載感知 + 可達**（`ffab02d`，同 commit 因皆改 app.js 無法非互動分檔）：求解失敗訊息繁中化 + worker 復原 + 60s 逾時軟提示 + render try/catch；首載 loading 佔位、配方列鍵盤可選（tabindex+keydown）、搜尋 debounce、預建 Collator、WASM 並行預熱、tabs aria、aria-live 完成播報。

## 2026-06-22 — 專案建立

FFXIV 繁中服 DoH 製作求解器上線（純靜態站 + Rust/WASM raphael 引擎）。spec `external/ffxiv-tw-tools-portal/docs/specs/2026-06-22-craft-solver-spec.md` + ADR-013。部署 CF Pages `ffxiv-crafter.pages.dev`。

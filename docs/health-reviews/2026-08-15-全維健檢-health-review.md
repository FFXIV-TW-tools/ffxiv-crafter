# ffxiv-crafter 健檢報告（2026-08-15）

> 全維健檢（11 維度）。方法：Workflow fan-out **31 agent**（11 reviewer + 20 verifier）＋主迴圈親自複驗、突變測試與瀏覽器實測。
> 前三輪為 2026-07-04（9 維）、2026-07-11 R2（5 維）、2026-08-01（11 維）。
> 本輪的重點是 **2026-08-02 之後的 59 個 commit／+5,191 行新增面**：職業任務分頁、`functions/`（本 repo 第一段伺服器端程式碼）、
> 交接頁、sim-diff 差分閘、神速技巧耐久補償、以及 2026-08-13 的資料重建。

## 總評：專案體質 **7.5** / 10 · 使用者友善 **7.2** / 10 — 核心穩、新增面未跟上（涵蓋 11/11 維，無 failed、無 N/A）

較上輪 7.6 → 7.5（體質）／7.8 → 7.2（使用者）。

**下降不是回歸，是新增面沒有跟上既有標準**。前輪 12 項須修改全部已修且本輪逐一確認無回歸；扣分集中在同一個形狀：
2026-08-09 之後長出來的東西（職業任務分頁、手動指定等級、`functions/` 代理）**沿用了舊模組的樣子，卻沒有沿用舊模組的紀律**——
成果保留邏輯沒接上、測試沒補、文件沒更新。使用者分掉得比體質分多，因為那三件事全部落在玩家看得到的地方。

一句話定性：**這是一個核心（公式／引擎／轉義／世代守衛）經得起反覆檢驗的工具，本輪的問題全在「後來加的那一圈」**。
最嚴重的一類是**成果默默遺失與靜默算錯目標**——兩者都零回饋訊號，畫面全綠、測試全綠，只有玩家貼進遊戲才發現。

> ⚠️ **本輪已直接修掉 12 項**（含全部使用者可見的 medium）並補 7 組測試（334 → **385 passed**）。
> 上面的分數是**審查當下（`43b7def`）的快照**，不含這些修復——自己修完自己給分等於自我認證，
> 下一輪重跑時才會看到真實的 delta。修了什麼見下方「本輪已修」與 `CHANGELOG.md`。

## 機械基線（主迴圈實跑，非 agent 回報）

| 檢查 | 結果 |
|---|---|
| 審查快照 | `43b7def` · working tree **clean** |
| `node --check` × 12 支手寫 JS | ✅ 全過 |
| `node tools/test-formulas.mjs` | ✅ **334 passed, 0 failed**（== AGENTS.md 宣告基線） |
| `node tests/run-all.mjs` | ✅ 1/1 測試檔（handoff 交接契約） |
| `py -3.11 tools/check-actions.py` | ✅ 三個不變量全過（35==35 action／BUILD-STAMP 同步／sim-diff 釘同一 raphael tag） |
| `sh deploy-prepare.sh` | ✅ 允許清單 fail-closed，輸出 40 檔 |
| 手寫碼規模 | 3,111 行 / 17 檔（含 `functions/`）。單檔最大 `app.js` **453**（<500 門檻） |
| 文件量體 | `AGENTS.md` 179 行但 **40,273 bytes**（DEVLOOP R7 護欄 20KB 的 2 倍）／`CHANGELOG.md` 962 行 |
| 首載資產 | data/ 未壓 7.3MB，brotli 後實測約 607KB、parse 18ms（B-021／B-005 已據此否決兩次優化案，本輪不重報） |
| 突變測試（主迴圈補做） | 對本輪新增的 7 組測試逐一做「刪掉修復那一行會不會紅」，**7/7 皆紅** |
| 瀏覽器實測（主迴圈補做） | 修復後跑完整流程：深連結→等級同步→改手動等級→求解→巨集→四個分頁，**crafter 自身零 console 錯誤** |

## 維度評分

### 專案體質視角（權重：correctness-core .15／correctness-data .15／tests .15／sec .12／resilience .12／quality .10／docs-drift .09／build-release .06／design-system .06）

| 維度 | 分數 | confirmed | 一句話 |
|------|:---:|:---:|------|
| sec | **8.5** | 2（low + info）＋1 partial／1 refuted | 找不到可利用的 XSS／path traversal／open redirect；主迴圈 recall 抽查 `app-quests.js` 每個內插點都過 `esc()`，`esc` 含單引號故屬性上下文也安全 |
| correctness-core | **7.5** | 7（全數降為 low/info，惟其一與 user 視角合併後為 medium） | 世代守衛與模組時序都站得住；扣分在「後加的路徑沒接上既有的保護」 |
| correctness-data | **7.5** | 5 | 資料管線與換算對得上權威源；唯一 medium 是 rlv 變動時品質階段保留了**絕對數字**而非檔次 |
| resilience | **7.5** | 7 | fetch/worker/localStorage 三條失敗路徑大致收得住；`level-sync.json` 被誤歸為「選配」是真缺口 |
| quality | **8.0** | 7（1 refuted） | 依賴注入 pattern 跨 8 層一致；三支 proxy 確認為死碼（主迴圈逐一 Grep 反查後證實） |
| **tests** | **6.5** | 8 | **本輪最低**。最靠近玩家的兩段（巨集組裝、結果渲染）零覆蓋，而哨兵的檔案清單是手維護的且已漏 3 支 |
| docs-drift | **6.5** | 8 | 開篇仍宣告「無後端」但 repo 已有兩支 Function；AGENTS.md 40KB ＝護欄兩倍且每 session 全文注入 |
| build-release | **8.0** | 6 | 部署面 fail-closed 仍然有效（本輪實跑確認）；`check-actions.py` 沒有任何自動入口會跑到 |
| design-system | **7.5** | 6 | 2026-08-13 的共用面板遷移做得乾淨；三張表手刻與 `.crafter-qt-tag` 重刻 badge 是延續債 |

### 使用者友善視角（權重：ux-flows .60／perf-ux .40；本輪 a11y 併入 ux-flows）

| 維度 | 分數 | confirmed | 一句話 |
|------|:---:|:---:|------|
| perf-ux | **7.5** | 4 | 首載鏈已被前兩輪處理乾淨；剩下的是互動熱路徑（清單重建、全量重排序）與職業任務分頁排在配方表之前 |
| **ux-flows** | **7.0** | 8 | **本輪使用者側最痛**：成果默默遺失、假警告、載入期間死按鈕，三件事都是「畫面完全正常」型 |

## 前輪追蹤（2026-08-01 → 本輪）

前輪 12 項須修改（B-009〜B-015）**全數已修，本輪未發現任何回歸**：

| 前輪項 | fate |
|---|---|
| #1 專家之證未與兩技能連動 | ✅ 已修（T23／T30 守）。**但同一顆勾選框的「保存偏好套不回來」是新發現**——見已修 ⑤ |
| #2 部署面（整個 repo 被當靜態根） | ✅ 已修且**本輪重跑確認仍 fail-closed**（40 檔） |
| #3 T11 空殼斷言 | ✅ 已修。**但同型病在別處復發**——T6 哨兵的檔案清單漏 3 支，見已修 ⑧ |
| #4 body 缺 padding-top（CLS） | ✅ 已修（T17／T26 守） |
| #5 改角色數值清空 HQ 素材 | ✅ 已修。**但後來加的「手動指定等級」繞過了那段保留邏輯**——見已修 ① |
| #6 食藥選單窄屏被裁 | ✅ 已修。**同型問題在新的職業任務分頁重現**——見 B-029 |
| #7 WASM 初始化死路 | ✅ 已修（T27 守） |
| #8 `loadGear` 靜默 catch | ✅ 已修。**哨兵本身的涵蓋率則是新缺口**——見已修 ⑧ |
| #9〜#12 | ✅ 全部已修（BUILD-STAMP／a11y ×2／memory 模板） |

**值得記下來的模式**：前輪修好的東西，有 **4 項**在兩週內以「新路徑繞過既有保護」的形式復發。
修一個 bug 不等於修掉那一類——**新增路徑時要問「既有的保護是誰在守，我這條有沒有經過它」**。

## 本輪已修（12 項，全部有測試＋突變驗證；測試 334 → 385）

① **[使用者·三維同時命中·medium] 手動指定同步等級會靜默清空已填的 HQ 素材與目標品質**
`app.js` 的 `CraftSync.onChange` 直呼 `refreshSelectedGear()`，繞過 `refreshGearNote()` 裡「先記成果、重繪後套回並收斂到新上限」那段——
而那段正是前輪 B-011 為 gear 路徑修的。correctness-core／perf-ux／ux-flows **三個維度各自獨立找到同一根因**。
→ 改走 `refreshGearNote()`，並補上「生效 rlv 沒變時也要重繪等級同步說明」（否則會修一個 bug 換一個 bug：面板停在舊等級）。**T37 守**。

② **[專案·correctness-data·medium] 生效 rlv 改變時，品質階段以「絕對品質數字」被保留**
宇宙任務的門檻是**滿品質的百分比**，rlv 一變同一檔就是不同數字。原本保留舊的絕對值再收斂到新上限 ⇒ 下拉翻成「自訂」、
求解照一個不存在的門檻算，而畫面看不出哪裡不對。→ 改為保留**檔次**、由新滿品質重推（`CraftStages.stageSelection`／`applyStageSelection`）。**T38 守（含接線層斷言）**。
> 線上實測：Lv70→Lv90 時三階由 1563 正確重推為 **3125**；修復前會停在 1563（差了一倍）。

③ **[使用者·ux-flows·medium] NQ 模式殘留的目標品質產生假的「未達目標品質」警告**
`setTargetMode` 停用欄位但不清值，`render()` 直接讀 `.value`。`shortfallHtml` 的註解本來就寫著「NQ 模式 ⇒ 不警告」——壞的是接線。
→ 以「欄位是否被停用」為準（單一決定者＝`setTargetMode`）。順帶把**品質階段下拉一併停用**（原本選了完全不生效＝按了沒反應，比停用更難懂）。**T39／T14 守**。

④ **[使用者·ux-flows·medium] 製造清單保存失敗不通知玩家**
六個 localStorage 保存點裡只有製造清單與等級同步是靜默的。玩家會一路加十幾個配方、關掉分頁才發現整份不見。
→ 補一次性 toast（沿用既有慣例，不每次操作都轟炸）。**T40 守**。

⑤ **[專案·correctness-core·low] 需要專家之證的兩個選項，保存的偏好永遠套不回**
init 順序是 `loadSolveOpts()` → `refreshSpecialistGate()`，那時還沒選配方 ⇒ 閘一律關、剛讀回的勾選當場被清掉；
之後閘打開也只是「可勾」而不會勾回去。→ 把「玩家想不想用」與「現在能不能用」分開（`specWanted`），閘關著時存檔也寫回偏好本身。**T43 守**。

⑥ **[專案·resilience·medium] `level-sync.json` 被歸為選配資料，載不到就靜默退回六倍難度**
其他選配載不到只是少一個快捷；這一份載不到會讓宇宙探索配方沿用 rlv 690 ＝ **Lv70 玩家看到六倍難度**，正是 B-016 修掉的病從另一條路回來。
→ 仍不拖垮整站（其餘配方不受影響），但**降級要看得見**：明確 toast 告知數字可能不對。**T41 守（含對照組：食藥／品質階段載不到刻意不打擾玩家）**。

⑦ **[使用者·ux-flows·medium] 資料載完前四個分頁按鈕完全沒有事件，而首次使用提示正指著它們**
綁定排在 `await loadData()` 之後。慢網路上那是好幾秒，玩家照著提示點卻毫無反應、也沒有「還在載」的訊號。
→ 移到 await 之前（`switchTab` 只切 class 與 hidden，完全不碰資料）。**T42 守**。

⑧ **[專案·tests＋docs·medium] 靜默-catch 哨兵宣稱掃「全部手寫 JS」，實際只掃 10/13**
手打的檔案清單漏了 `app-quests.js`（第二大模組）／`app-gear.js`／`app-recipe.js`，而**漏掃的症狀就是全綠**。
→ 改為掃描產生，並補「掃到 0 支也算失敗」的涵蓋率閘（避免這條哨兵自己變成空殼）。

⑨ **[專案·tests·medium] 巨集組裝與結果渲染零覆蓋**
`renderMacro`（遊戲 15 行硬上限、超過要切段補 `/echo`）與 `render()`（AGENTS 明訂的 expert 中性措辭、未達標警語）
先前**一條斷言都沒有**——兩者都可以整段刪掉而 334 條全綠。→ 建 render harness，補 12 條。**T39**。

⑩ **[專案·tests·medium] `functions/settings-api` 代理零測試**
它自己的檔頭寫著「🔴 改壞了完全沒有訊號」（改成 `fetch(URL)` 會讓 per-IP 額度變成全站共用），
而 `export const __test` 連消費端都沒有。→ 新增 `tests/settings-api.test.mjs`（16 條，含 service-binding 紅線的正負對照）。

⑪ **[專案·quality·low] 三支 proxy 已無呼叫點＝確定死碼**
`saveGear`／`gearValid`／`onGearInput`。**逐一 Grep 反查全 repo（含 inline handler 與字串拼接）後才刪**；
`onGearInput` 的唯一消費端是測試 harness，一併改為直接走 `CraftGear`。

⑫ **[專案·docs-drift·medium/low] 文件 drift 八處**
開篇「無後端」（已有兩支 Function）／架構表缺 `functions/` 一列／規模宣告 14 檔 2.84k 行（實際 15 檔 3.47k）／
`app.js` 424 行（實際 485）／VERIFY 的 `node --check` 清單漏 `app-quests.js`（改用萬用字元，不再手維護）／
`.qt-list` 實為 `.crafter-qt-list`／商人涵蓋率同段自相矛盾（172 vs 247）／
`CLAUDE.md`＋`AGENTS.md` 硬寫 `C:\FFXIVProject\…` 絕對路徑（違反 external 層明訂的跨機規則）。

> **測試 harness 本身也修了一個保真度問題**：`app-level-sync.js` 在真實頁面是 classic script、**早於** `app.js` module，
> 但 T25 的 harness 反過來載 ⇒ `CraftSync.init` 從來沒被接上、手動指定等級那條路徑**在測試裡等於不存在**。
> 這是「測試存在但測的不是線上那條路」的典型，比沒有測試更危險。

## 須修改項目（未做，需 Owner 拍板或需實測）

1. **[專案·build-release·medium] `check-actions.py` 沒有任何自動入口會跑到** — 見計畫 B-026。
   它守的三個不變量（35 個 Action 變體／`pkg/` 與 `lib.rs` 同步戳記／sim-diff 釘同一 raphael tag）**只有人記得跑才會跑**：
   `canonicalTest` 是 `node tools/test-formulas.mjs && node tests/run-all.mjs`，monorepo pre-commit 也沒有它。
   ⇒ 改引擎、忘記重編、safe-push 全綠，線上跑的是舊 WASM。**修法要選（見計畫）**。
2. **[專案·docs-drift·medium] `AGENTS.md` 40KB ＝ R7 護欄的兩倍，且每 session 全文注入** — 見計畫 B-025。
   其中單行 5.5KB 是逐輪測試流水帳。2026-08-03 搬過一次只減 3.4KB、從未達標，之後又漲 29%。**搬哪些要 Owner 拍板**。
3. **[使用者·ux-flows·medium] 職業任務的交付物列在手機寬度溢出** — 見計畫 B-029。
   AGENTS 明訂「下拉／浮層的窄屏溢出，只有實測才算數」，且前輪就是因為照著錯誤前提改而**退回兩次**。
   ⇒ 這一項**必須先跑該 SOP 的量測**（同源 iframe 定寬 1400/1018/900/800/430/390/360）才動 CSS。
4. **[專案·design-system·medium] 三張表仍手刻、未消費共用 `.codex-table`** — 見計畫 B-027。前輪已列建議未做；改動面跨 portal，屬生態一致性決策。
5. **[專案·sec·low（但屬 fail-closed 教義）] settings-api 代理無路徑白名單且無條件覆寫 Origin** — 見計畫 B-028。
   今天不可利用（上游真正的 capability 是 UUID，Origin 只做 CORS），但它讓上游 `/feedback` 的第一道閘在經過本站時**永遠不會觸發**，
   且未來上游任何以 Origin 為判準的邏輯都會在 13 個站的代理後面被靜默漂白。
   > **⚠️ 勘誤（2026-08-15 執行 B-028 時發現）**：reviewer 與 verifier 都寫「本站只用得到 `/u/*` 與 `/health`」，
   > **那個路徑不存在**。實際查 portal `settings-client.js` 的消費端，真實面是 `GET|PUT /settings/<uuid>` 與 `/health`。
   > 照 finding 的措辭寫白名單會 404 掉**每一次雲端設定同步**，而畫面上只是「設定沒跟著走」——零錯誤訊號。
   > 這是本輪對抗驗證**唯一漏掉的事實錯誤**（兩層都沒查消費端），也是「審計結果必須逐一驗證」那條鐵則的又一個實例。

## 建議修改項目（可選，未做）

### 正確性 / 韌性（全為 confirmed low）
- `showPicker`（返回配方列表）不作廢飛行中的求解，與 `app-solve.js` 註解宣稱的涵蓋範圍不符（CF-04）
- 「只顯示未完成」勾完最後一筆 → 清單變空白且沒有空狀態文案（CF-05）
- `ls-level` 輸入被 clamp 但輸入框不回寫，畫面數字與實際生效等級不一致（CF-06）
- `setVendors` 內含 `render()`，與 `app.js`「setData 一次繪到位（省一次重繪）」的註解不符（CF-07，實際只是多繪一次）
- 本地 script 缺席的 fail-closed 只做了一半：`CraftSolve`／`CraftRender` 用不設防但 init 不擋（RES-02）
- WASM worker 預熱失敗會把整頁判死，且錯誤訊息歸因成「資料載入失敗」（RES-03）
- 選配資料載入失敗時，受影響區塊沒有「這是失敗不是沒資料」的訊號（RES-07）
- 交接頁腳本的四個空 catch 無 `console.*`（RES-06；屬 13 站凍結樣板，改動要跨站一致）

### 資料 / 測試
- 交付數量的對帳命中率沒有 ratchet，退步時零訊號（同檔的 vendors／hq 都有，唯獨 qty 沒有）（CORR-02）
- 食藥補 icon 以繁中名對帳且 fail-open，且無資料不變量測試（CORR-03）
- T32「每筆都是解包確認有 NPC 賣」是恆真斷言（CORR-04）
- `data/quality-stages.json` 無資料不變量：出現新來源時換算靜默回 0（TEST-07）
- `app-quests.js` 的狀態面（load/save/setData）零覆蓋（TEST-06）
- 文件與機制相反：AGENTS 說 `handoff.test.mjs`「刻意不併進 runner」，實際 `run-all` 以 glob 自動納入（TEST-08）
- `build-data.py` 對缺上游輸入 fail-open：印 ⚠ 後續跑、exit 0，靜默產出降級的 `data/`（DEPLOY-3，前輪延續）
- `pkg/` 重建的 toolchain 未釘版本，BUILD-STAMP 也不記 rustc ⇒ 乾淨機器重現不了同一顆二進位（DEPLOY-4）
- `data/` 缺上游快照戳記（`pkg/` 有，資料層沒有）（DEPLOY-5）
- `functions/` 與 `_routes.json` 之間缺涵蓋率閘（DEPLOY-6）

### 品質 / 設計系統
- 晶體判定規則（id<20 + 三個關鍵字）兩份平行實作（Q-02，前輪延續）
- 「素材列」視覺樣式在 `styles.css` 第三次被重刻（Q-04）
- `tools/build-data.py` 480 行逼近門檻、職責已擴張到六種輸出（Q-06）
- `build-data.py` 把 monorepo 根預設寫死成 `C:/FFXIVProject`（Q-07）
- `.crafter-qt-tag` 家族把 `.codex-badge` 重刻一次（DS-02）
- `.result-summary`／`.consumables` 幾何與已遷的三個容器同形，卻仍本地宣告 background/border/border-radius（DS-03）
- 兩處硬編值繞過 token，其一與共用 zebra 值不一致（DS-04）；資料載入失敗面板用 inline style（DS-05）
- `app-quests.js` 自行重做一次 `copyText` 已有的「共用優先」分派（DS-06）

### 效能 / UX
- 職業任務分頁在 `loadData` 內就全量建 DOM，且排在玩家真正在等的配方表之前（PERF-02）
- 製造清單「次數」一變動就重建整份清單，正在操作的那個 input 被銷毀重建（PERF-03）
- 配方表每次翻頁／篩選都對全量 13,874 筆重跑 filter + Collator 排序，只為取 60 筆（PERF-04）
- 商人地點／單價只存在於 hover 提示，鍵盤與螢幕閱讀器取不到（UX-07）
- 求解時缺角色數值會跳分頁但不移動焦點（UX-08）
- `copyBtn` 走 portal CDN 時把未轉義品名交給第三方 HTML 產生器，本地沒有測試釘住那份轉義契約（SEC-03；上游目前有轉義，屬契約風險）
- CSP 帶 `unsafe-inline`（SEC-01，**已拍板取捨**；唯一有增量價值的是「新增第 4 段 inline script 要有哨兵」）

## 誤報 / 校正

對抗驗證統計：**confirmed 59 / partial 10 / refuted 2 / 無 verdict 0**（71 findings）。

| 校正 | 內容 |
|---|---|
| refuted ×2 | SEC-04（具名 target 無 noopener）＝**已拍板取捨重報**（B-006(a)，理由已成文進 portal `_DESIGN-SYSTEM.md`）；Q-08（共用圖示退場路徑各寫一份）＝ verifier 查出兩處退場版都有轉義、非缺陷 |
| high → medium ×6 | CORR-01、RES-01、TEST-01/02、DOC-01、UX-01/02/03、PERF-01（reviewer 普遍把「零回饋訊號」直接當 high；verifier 正確指出多數需要特定操作序列才觸發） |
| medium → low ×20 | 大量 correctness-core／quality／design-system 項目 |
| partial ×10 | SEC-01（已拍板取捨，僅緩解手法是新的）、CORR-03、Q-04/Q-06、RES-05、DEPLOY-2、DS-06、TEST-06、UX-03（靜態推斷未實測） |

**主迴圈親自複驗 6 項**（皆成立，且全部動手修了）：
① 讀 `app.js:359-362` 與 `app-recipe.js:45-77` 確認手動等級路徑繞過保留邏輯；
② 讀 `refreshGearNote` 的 rlvChanged 分支 + `CraftStages.syncFromInput` 確認保留的是絕對數字；
③ 讀 `setTargetMode` 與 `render()` 確認 NQ 假警告；
④ **Grep 反查全 repo** 確認三支 proxy 真的無呼叫點（`anyGear`／`markListState` 有呼叫點，未刪——agent 若整批照做會刪掉活的）；
⑤ 讀 `refreshSpecialistGate` 確認保存偏好套不回；
⑥ 讀 `loadData` 的三個 fetch 分級確認 level-sync 被誤歸選配。

**主迴圈 recall 反例抽查**（針對 8.5 分的 sec）：列出 `app-quests.js` 全部模板內插點逐一檢查，動態字串無一例外過 `esc()`
（NPC 名/稱號/地名最終收在 `esc(help)`、品名收在 `esc(name)`），**未發現 reviewer 漏掉的 XSS 面** → 高分成立。
唯一沒過 `esc` 的是 `copyBtn` 交給 portal `FFXIVIcons.btnHTML` 的原始品名，已列為 SEC-03（上游有轉義，屬跨 repo 契約風險）。

**主迴圈突變測試 7 組**：本輪新增的每一條修復都做「把修復那一行改回去，測試會不會紅」，7/7 皆紅
（其中 T38 的接線層斷言是**因為發現「只驗 API 不驗有沒有人用」會變空殼**才補的——本 repo 已有兩次空殼斷言前科）。

**已拍板取捨的重報**：僅 SEC-04 與 SEC-01 兩項，且兩者都被 verifier 正確識別並降級／refute。CONTEXT 的取捨清單有效。

## 既有設計亮點

**專案體質**
- **轉義紀律仍是 100%**：新增的 `app-quests.js`（301 行、大量字串拼接 HTML）逐點對得上，連 `data-help` 這種屬性上下文都收在 `esc()` 裡；`esc` 含單引號故無例外。
- **`functions/settings-api` 的架構註解是本 repo 最好的一段文件**：它把「為什麼是 service binding 不是 fetch」寫成一條帶實測數字的紅線，並明講「不做 fallback——fallback 看起來像韌性，實際是把紅線在無人察覺的情況下放回來」。本輪只是替它補上機械守。
- **sim-diff 差分閘**（raphael-sim vs Tnze 兩顆零共用程式碼的引擎對打，96 萬次施放）＋ 已知差異清單每條附理由 ＋ 清單裡的條目沒出現也會警告——這個設計連「上游修好了、我方 workaround 該撤」都涵蓋進去了。
- **部署面 fail-closed 三件組**經本輪重跑確認仍然有效（未分類項目讓 build 失敗，而不是靠人記得）。
- **模組拆分的 pattern 跨 8 層一致**（classic script + `globalThis.CraftXxx` + getter 取 live 狀態 + 同名 proxy），讓本輪四次行為修復都做到「既有呼叫點零改」。

**使用者友善**
- **不靜默換數字**：等級同步把「已依手動指定 Lv 90 同步 → rlv 560（難度 2450 · 品質 4464 · 耐久 80）。配方原始資料為 Lv 100 · rlv 690。」整句寫在畫面上——玩家對不上遊戲時分得出是等級選錯還是工具算錯。這是本工具最好的一個設計決定。
- **職業任務分頁對「不知道」很誠實**：數量未知標「數量未知」並在彙總寫出有幾件是估的；HQ 未知用同一張圖淡化＋`?`；要交 HQ 的不顯示商人徽章（商人不賣 HQ）。**不知道就說不知道**，沒有一處拿預設值假裝知道。
- expert 配方的「試算完成 ⚠」中性措辭、手法 chips 與走查表雙向高亮、食藥選單顯示 icon＋品級＋功效——都是超出「能跑」標準的體貼設計。

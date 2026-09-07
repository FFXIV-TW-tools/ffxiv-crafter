# 鐵則由來（`AGENTS.md` 的證據層）

> **定位**：`AGENTS.md` 只放「做什麼／禁什麼／權威在哪／怎麼驗」，每 session 常駐；本檔放「為什麼」——事故、實測數字、拍板日期、已退役的條目。
> 懷疑某條鐵則、或要改它時才讀。**新增鐵則時**：規則進 `AGENTS.md`，由來進本檔對應段，兩邊用同一個標題對得上。既有的踩坑敘事另有 `lessons.md`（本檔不重複，只指過去）；測試數字沿革在 `test-baseline-history.md`。

---

## 工具鐵則

- **`hqPercent()` 對照表**：逐格移植自 ffxiv-crafting 7.4.5 的權威遊戲表（Tnze）。表的斷點與缺口是遊戲真實值。
- **製作公式**：spec §4（portal repo）已做對抗驗證；u16 無溢位，serde 對超界值報錯而非靜默截斷——改成 clamp 等於把錯誤吞掉。
- **品質階段**：只收已確證的 key 1（`CollectablesShopRefine`，收藏價值，目標品質＝值×10）與 key 7（`WKSMissionToDoEvalutionRefin`，滿品質百分比）＝992 個配方；key 2/3/4/6 的 728 個刻意不輸出（root BACKLOG B-041），那些配方在遊戲內只有「滿品質」可選是預期行為，不是缺漏。
- **繁中服正名**：職業名走 木工／鍛造／… 等台服官方譯名。
- **`rlv==690` 形狀猜測禁令**：690 是現況巧合（宇宙探索 768 筆一律存 690），改版即靜默失效。

## 架構

- **模組 pattern 為什麼用 getter 注入**：`loadData` 會重新賦值 `ITEMS`／`ACTIONS` 綁定，直接傳值會抓到舊參考；`app.js` 的同名 proxy 讓拆檔時既有呼叫點零改，所以「app.js 與模組有同名函式」不是重複實作。
- **各模組一句話職責**（2026-09-07 自 `AGENTS.md` 移出；細節仍以各檔檔頭註解為準）：

  | 檔案 | 職責 |
  |------|------|
  | `index.html` | 靜態骨架＋`document.write` 注入 portal CDN bootstrap＋SEO/JSON-LD |
  | `app.js` | 前端控制器（唯一 `type=module` 入口）：狀態持有／分頁／公式與資料層的同名 proxy／init 接線 |
  | `app-formula.js` | FFXIV 公式面：三上限 `recipeMaxes`／能力門檻 `statShortfall`／食藥與專家之證加成／`computeSettings` |
  | `app-data.js` | 資料載入面：11 支靜態 JSON 的必要／選配分類與降級策略、三份配方索引、配方表快照 `RINDEX` |
  | `app-flow.js` | 流程引導：`flowState()` 純函式 |
  | `app-render.js` | 結果渲染：`hqPercent`（純）／手法序列 chips／走查表／巨集組裝 |
  | `app-solve.js` | 求解編排：worker 生命週期／`doSolve`／求解計時／世代守衛／取消 |
  | `app-browse.js` | 配方瀏覽表：職業篩選 chips／每頁 60 筆分頁／已加入清單標示 |
  | `app-gear.js` | 角色數值：localStorage 讀寫與型別驗證／等級 clamp／專家之證逐職勾選 |
  | `app-recipe.js` | 配方詳情狀態機：選配方／原料與初始品質／製作鏈（返回堆疊）／多職業切換 |
  | `app-nextcraft.js` | 「用這個成品還能做什麼」：反查索引＋下一階配方選取視窗 |
  | `app-quests.js` | 職業任務分頁：11 職任務清單／完成勾選／素材遞迴展開／商人徽章 |
  | `app-consumable.js` | 食物／藥水自繪 listbox（原生 `<option>` 放不了 icon／品級／功效）＋本區本地保存 |
  | `app-quality-stages.js` | 品質階段 → 目標品質 |
  | `app-level-sync.js` | 等級同步：解出生效 rlv 並寫回 `selected.rlv`（顯示與求解共用） |
  | `crafting-list.js` | 製造清單：清單狀態(localStorage)／素材彙總 `aggregateMats`（純函式）／採購 CSV |
  | `worker.js` | web worker：載 raphael WASM 跑 `solve` |

- **資料流**：選配方 + 填角色數值 → `computeSettings`（FFXIV 公式，含食物/藥水/專家之證）→ postMessage worker → raphael `MacroSolver` → replay 逐步 → render 手法序列 + 巨集。
- **`functions/` 不得改成 `fetch(URL)`**：service binding 直呼才是同源；改成 URL fetch 會讓 settings worker 的 per-IP 額度變成全站共用。
- **`404.html` 回真 404**：不落 SPA fallback ⇒ 假路徑不放大成計費請求；monorepo `check-unknown-path-cost` 守。
- **`first-run-hint.js` 為什麼是 parser-blocking 外部檔**（2026-08-23，詳 `lessons.md`）：只看 localStorage 就能決定的顯隱要在解析階段定案。留給 `app.js`（module ⇒ defer）決定＝首次繪製之後才長出 80px（實測 CLS 0.044〜0.094）。inline 會被 T53 擋——它是對的。
- **`LICENSE-*.txt`**：Apache-2.0 §4(a) 與 MIT 著作權宣告的散布義務，頁尾只寫授權名稱不算數。
- **`_headers` 無 cachebust**：一律 `must-revalidate`，靠 ETag/304；`index.html` 的靜態引用刻意不帶 `?v=`。
- **舊網址 301**：自 2026-09-05 起由 CF 帳號層 Bulk Redirects 執行，本 repo 不再有 middleware。

## VERIFY

- **散文不複述基線數字**：曾發生散文停在 653 而 `TEST-BASELINE` 標記已 654 的情形；gate 6 只讀標記，散文那份是會漂移的第二事實源。
- **sim-diff 差分閘**：一輪約 1 分鐘、約 96 萬次施放；為什麼要養這支「兩顆引擎對打」的閘＝`lessons.md`（2026-08-03）。
- **為什麼 `check-actions.py` 與 `tests/run-all.mjs` 被併進 canonicalTest**＝`lessons.md`（2026-08-04／08-15）。
- **不得跑裸 `wasm-pack`**：產物會帶建置者帳號名（2026-07-28，`lessons.md`）。
- **`tools/serve.py` 而非 `python -m http.server`**：後者會快取，改了看不到。

## 資料與求解

- **神速技巧**：上游 raphael 把「工匠的神速技巧」的耐久寫死 10，遊戲實際是 0。補償寫在我方綁定而不改 raphael 原始碼，是為了保住「以未修改原始碼編譯」的授權聲明。上游修好時該測試會轉紅（`lessons.md`）。
- **宇宙探索配方**：768 個配方的 rlv 一律存 690，實際依角色等級同步；`WKSMissionUnit.LevelGroup` 無對應等級表故不可反推（`lessons.md`）。
- **配方資料源**：tnze zh-CN 跟版 7.5；zh-TW 源停更在 7.1。舊的逐色染劑 200 筆是遊戲 7.5 移除，不是資料缺漏。
- **`build-data.py` 缺輸入 exit 1**＝B-030：缺的那份不覆蓋，但也不得回報成功。
- **資料檔 ratchet**：T31／T32／T54 的當期值＝交付數量 228/290、商人 247/256、食藥 icon 全中、quality-stages 992。產生端全是 fail-open，退步時畫面只是「多幾件標未知」，沒有人會發現——只有資料斷言擋得住。
- **expert 配方**：536 個在遊戲內為隨機製作狀態，靜態巨集只能當試算。
- **最低能力要求**（2026-08-19，`lessons.md`）：3396 個配方有 `RequiredCraftsmanship`／`RequiredControl`，遊戲內不到門檻根本不給做；比較基準用 `effectiveStats` 是因為遊戲判定同樣吃食藥／專家之證的 buff。
- **版本篩選**（2026-08-19，`lessons.md`）：選項由資料生成，<7.0 併成「7.0 以前」；拆 (major, minor) 整數比會把 7.15 排到 7.5 後面。
- **新增篩選控件的三件事**（2026-08-19，`lessons.md`）：漏任一項畫面都「正常」，沒有訊號。
- **配方表列級 ＋／−**（Owner 2026-08-19，`lessons.md`）：flex 之下 − 收掉時 ＋ 會跳位，所以槽位固定用定寬兩欄 grid。
- **巨集完成提示音**（Owner 2026-08-16）：為什麼一定要有＝`lessons.md`。
- **`recipeMaxes` 單一算式**：配方表由 `RINDEX` 建索引時算一次，與顯示／求解共用同一份。

## 前端狀態與流程

- **分層檔缺席硬失敗**：404 時軟略過會讓玩家拿到「按下去才無聲 TypeError」的頁面。
- **製作鏈**：`craftPlan` 整鏈展開已於 B-032 刪除——它在生產路徑零呼叫，且對鑽石依賴會重複計數；T64 由此而生（一份看起來被驗證過的假護欄比沒有更糟）。
- **「繼續做」不推返回堆疊**（Owner 2026-08-17，`lessons.md`）：它是反方向的動線；最多 234 筆故走彈窗。
- **遮罩關閉看 mousedown**（2026-08-17，`lessons.md`）：只看 `click` 會讓開窗那一發滑鼠放開時打到遮罩，視窗開了又關，而 console 全乾淨、`.click()` 也測不出來。
- **多職業／多配方**：651 件東西有多個職業能做、136 組是同職多張配方。
- **程式化切頁帶移焦**：那幾條路徑都是「被擋下 → 去補資料」的補救動線。
- **三處本地保存**：少套回一步的症狀是「重整就跑掉」。

## UI／設計系統

- **內容井抽成一份**（Owner 2026-08-19「看不清主次」，`lessons.md`）：本地重寫時值一樣、畫面全正常，事實源卻分岔了。
- **巢狀要顯式寫 `--panel-bg`**：CSS 自訂屬性會繼承，不寫會沿用外層底色。
- **`fitHeight` 不可用 `scrollHeight` 反推**（Owner 2026-08-19，`lessons.md`）：body 的 `min-height:100vh` 使它不隨內容縮，每量一次多扣一截。
- **不要自刻 sticky**：`border-collapse: collapse` 之下分隔線不跟著表頭動。
- **`min-width: 0` 禁令**：動作鈕一多就把品名壓成一個字寬。
- **窄屏溢出**（`lessons.md`）：CSS 文字比對驗不了 layout，只有同源 iframe 逐寬量測算數；T26／T44 只擋已知會壞的形狀。
- **`hidden` 收不起來**（`lessons.md`）：本地一條 `display:flex` 就蓋掉 UA 的 `[hidden]`。
- **首屏預留高度**（`lessons.md`）：等 fetch 才長內容的區塊是 CLS 主要來源。
- **icon 走 xivapi v2**：v1 停更，7.5 的新 icon 在 v1 是 404。

## 職業任務分頁

- **HQ 與商人徽章的判準怎麼定的**（2026-08-09，敘事於 2026-08-15 搬進 `lessons.md`）：商人賣的是 NQ，所以要交 HQ 的東西整個徽章不出。
- **沒有座標 ≠ 沒有商人**：`if n.zone` 過濾會讓 247 件掉到 172 件（`lessons.md`）。
- **技能 icon 取列策略**（`lessons.md`）：`ORDER BY id LIMIT 1` 會取到佔位圖；職業專屬 icon 固定木工版是 Owner 裁示，B-008 已否決改動提案。
- **DOH／JOB_ICON local hardcode**：monorepo 的 `jobs.json` 只散布 21 個戰鬥職、不含製作職，所以這份 local 表是刻意的，不是漏 sync（BACKLOG B-001 待拍板）。

## 部署面鐵則（2026-08-01 事故）

CF Pages 的 Git 整合在沒有 build 步驟時，把 repo 根整棵目錄當靜態資產上傳 → `AGENTS.md`／`docs/`／`tools/`／`tests/`／`worker/` 後端源碼（含 `oauth.ts`）全部變成該網域下可直接 GET 的公開檔，2026-08-01 實測 12/13 站中招，持續約一年無人察覺。**private repo 只保護「誰能 clone」，不保護「已部署的檔案誰能下載」**；`.gitignore`（檔是 tracked）／`_headers`（只加標頭）／`robots.txt`（只擋收錄不擋直取）都擋不到。根因不是誰疏忽，是 `_NEW-TOOL.md` 當時明文寫「Build settings 全留空」——那句話在寫下的當下是對的（repo == 網站），但沒人追蹤它何時失效。

- **為什麼是允許清單**：排除清單預設「全部發佈」，新增目錄天生外洩。實測當天就漏了兩次——`worker/` 106 支後端 `.ts`、`_tools/` 與 `_cache/` 141 檔。靠紀律維持的安全等於沒有。
- **分類閘的靜默放行**（健檢 R3 D6）：CF build 容器會在 build command 前自動跑 npm install，產生 repo 裡沒有的 `package-lock.json`／`node_modules`，故有固定 skip 清單；`git check-ignore` 讓本機產物不擋人。兩者都是提醒層的例外，真正的邊界是複製迴圈的 allow-list 比對。
- **POSIX 語法**：CF 容器的 `sh` 是 dash，`read -r -d ''` 之類 bashism 會靜默失敗、一個檔都沒複製，build 仍「成功」但輸出 0 檔 ⇒ 整站 404，2026-08-01 實際發生。
- **根層檔名的 `${f%/*}`** 會回傳檔名本身，無條件 mkdir 會建出「叫 index.html 的目錄」⇒ `/` 404。
- **產物路徑並行安全**：ranking B-117（2026-08-15）實證，只做「逐次專屬」而不加鎖仍然兩份都 exit 1（撞在 `rm -rf _site`）。兩次實際故障的訊息（「頂層出現未分類項目」「輸出缺 index.html」）都指向錯的方向，看起來像漏加允許清單。本 repo 目前無排程／並行寫入者，`tests/deploy-prepare.test.mjs` 檔頭有相同提醒。
- **cache-bust 假紅燈**：舊部署（發佈 repo 根的那版）留在 CF 邊緣的物件帶 `s-maxage=604800`，命中時回 `text/markdown` 但 header 有 `CF-Cache-Status: HIT` ＋大 `Age`。那是快取殘留不是外洩，最長 7 天自癒（pages.dev 非自有 zone，dashboard 沒有 Purge Everything）。2026-08-01 R3 健檢實測：帶 cache-bust 的 `/AGENTS.md`、`/worker/src/index.js`、`/deploy-allow.txt` 全回 SPA fallback＝現行部署乾淨。
- **本段是共用副本**：2026-08-15 統一為 12 個 external repo 的共用權威版本，三條原本只寫在單一 repo 的教訓（cache-bust 假紅燈／分類閘的靜默放行／產物路徑並行安全）已回填到所有副本。R7-exempt 戳明列本段「不得單邊移出」。

## 規則檔三層分工（2026-09-07，root B-077）

- 處置：`AGENTS.md` 只留**全 repo 適用**的規則（做什麼／禁什麼／權威在哪／怎麼驗），由來全部搬進本檔（踩坑敘事續留 `lessons.md`），只在特定路徑才需要的規則搬進 `.claude/rules/`（Claude 讀到該路徑才載入，其他 agent 手動讀）。`AGENTS.md` **31,008 → 12,280 bytes**。
- **路徑條件載入層四份**：`frontend-state.md`（`app-*.js`／`crafting-list.js`／`first-run-hint.js`／`worker.js`）、`ui-design.md`（`index.html`／`404.html`／`styles/**`／渲染層）、`job-quests.md`（`app-quests.js`／`tools/` 任務資料管線）、`wasm-engine.md`（`wasm/**`／`pkg/**`／`tools/sim-diff/**`）。
- **`deploy-deny.txt` 加了 `.claude`**（Owner 2026-09-07 放行）：本 repo 的 `deploy-prepare.sh` 頂層分類閘 fail-closed，新增的頂層 `.claude/` 若未分類會讓 build 直接失敗，`tests/deploy-prepare.test.mjs`（在 canonicalTest 內）也會立刻紅。`.claude/` 是內部資產，歸 deny 是正確歸類，不是繞閘。
- **仍留在 `AGENTS.md` 的固定成本**：R7-exempt 戳（342 B，T65 機械守）、`TEST-BASELINE` 標記區（約 660 B，gate 6 逐字比對）、部署面鐵則段（約 1.8 KB，R7-exempt 明列「不得單邊移出」故不拆去 `.claude/rules/`）。

# CHANGELOG — ffxiv-crafter

> 記 root 級 / 跨檔改動與「為什麼」。日常配方資料重建（`build-data.py` 產 data/）不入此檔。格式：新的在上。

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

> ⚠️ **外審狀態誠實記錄**：`ef046e1` 送 codex 對抗審回 `status: timeout`（362s 硬砍、送審 102.4KB、0 findings）。依 adversarial-review 鐵則「exit 0 ≠ 審過、timeout 的 0 findings 不算通過」，已降 `ADV_REVIEW_EFFORT=medium` 重跑。

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
- `check-actions.py` 35＝35；`design-lint --strict` exit 0（新 class 全走 `crafter-` 前綴、z-index 走 `--z-sticky` token）。`wasm/` 未改動故未跑 `cargo test`。
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

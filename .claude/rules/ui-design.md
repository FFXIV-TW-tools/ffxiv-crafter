---
paths:
  - "index.html"
  - "404.html"
  - "styles/**"
  - "app-render.js"
  - "app-browse.js"
  - "app-recipe.js"
  - "app-quests.js"
  - "app-consumable.js"
---

# UI／設計系統（動 HTML／CSS／渲染層時載入）

> 規則本體；由來見 `docs/rules-rationale.md` 同名段與 `docs/lessons.md`。動 UI/CSS 前另須先 Read portal repo（`external/ffxiv-tw-tools-portal`）的 `_DESIGN-SYSTEM.md`（跨 repo 指標拆兩段寫，勿寫死磁碟機代號）。非 Claude 的 agent 動這些檔前手動讀本檔。

- button／form／token／table 用 portal CDN 的 `.codex-*`，勿 local 重寫；`.panel`／`.codex-tablet` padding ≥16px。
- `styles/` 按頁面邊界拆 `NN-*.css` 序載、token 全來自 portal CDN；**層疊順序＝檔名數字序＝`index.html` 的 `<link>` 順序**（吃 CSS 的測試依檔名序掃描串接）。
- 「內容井」只有 `.crafter-well` 一份，本地**不得再宣告 background／border／border-radius**（T59）；中性分組容器走 `.codex-tint-panel--neutral`、底色以 `--panel-bg` 傳參、**巢狀一律顯式寫 `--panel-bg`**（T36）。
- 表格一律消費共用 `.codex-table`（`--fixed`／`--sticky`），**不要自刻 sticky**，本地只留視覺特化；可能插徽章的儲存格預留 `min-height`。T50。
- 配方表高度＝`CraftBrowse.fitHeight()`：視窗高 −表格上緣 −（`<main>` 底緣 − 表格底緣）−8，**不可拿 `document.scrollHeight` 反推**，極矮視窗收 `MIN_H`；欄數與 CSS `nth-child` 百分比寬是隱性契約；`<td>` 的 `height` 只是內容盒下限，改列高以量測為準。T11。
- 配方表列級 −：**恆 render 用 `hidden` 收合**、不上 `--danger`、槽位固定＝定寬兩欄 grid。T11。
- 圖示鈕與剪貼簿走 portal 共用元件（`window.FFXIVIcons.btnHTML`／`window.FFXIVClipboard.copy`），缺 CDN 要有退場版（T34）；**禁自刻 emoji 鈕**、`label` 必填、鈕不放進 `<a>`（容器 div＋內層連結＋同層鈕，click 要 `preventDefault()`）；帶文字的動作鈕刻意維持 emoji（T35 負向哨兵）。
- hover 說明一律 `data-help`、**禁原生 `title`**；圖示鈕另補 `aria-label`；`window.FFXIVHelp.setup()` 在 init 呼叫一次。
- `hidden` 設了不等於收得起來：驗收看 `getComputedStyle(el).display`，靠 hidden 收合的區塊補 `[hidden]` 守衛。T21。
- 首屏「等 fetch 才長內容」的區塊**一律預留高度**：①內容確定→靜態寫進 `index.html`（T17）②筆數不定→`.is-loading` 分段 `min-height`（失敗路徑也要卸）③佔位塊自撐。
- 同一列裡「唯一能縮的那一欄」**不得 `min-width: 0`**：給收縮下限，放不下的是動作群整條換行。T44／T55 守形狀，驗收看量測。
- 窄屏溢出只有實測才算數：窄屏（≤700px 下拉／≤760px 交付物列）讓標籤與動作群獨佔一行、**不用魔術常數**；改這區必重跑同源 iframe 逐寬量測（1400→360，驗 `left>=0`、`right<=視窗寬`）。T26／T44。
- 求解選項說明是常駐文字不是 hover（`.crafter-opt__desc`）：停用時**不隱藏控制**，改暗掉＋`.crafter-why` 寫原因。
- 食藥下拉是自繪 listbox：按鈕上的 Enter/Space 不要自己處理，keydown 只接 ↑↓。
- icon 一律走 xivapi v2 asset CDN：`app.js` `iconUrl()` 轉 v2 URL（權威寫法＝marketboard `modules/` 的 `icon.js`，跨 repo 指標拆兩段寫）；CSP img-src 已鎖 `v2.xivapi.com`。
- CSP `unsafe-inline` 依賴面不得擴大：`index.html` 可執行 inline script 恰為 1 段（T53）；要加第 2 段先問「能不能改成外部 `.js`」。
- expert 配方靜態巨集僅供參考：render 用「試算完成 ⚠」＋警語，**勿回無條件「✓ 可完成」**。
- 改 UI／render／求解路徑後要跑手動 smoke（命令見 `AGENTS.md` VERIFY 段）。

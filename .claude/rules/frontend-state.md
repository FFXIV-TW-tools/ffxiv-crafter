---
paths:
  - "app-*.js"
  - "app.js"
  - "crafting-list.js"
  - "first-run-hint.js"
  - "worker.js"
---

# 前端狀態與流程（動前端 JS 時載入）

> 規則本體；由來見 `docs/rules-rationale.md` 同名段與 `docs/lessons.md`。標了測試編號的條目**敘事在該測試自己的註解裡**——動那一區前先讀測試。非 Claude 的 agent 動前端 JS 前手動讀本檔。

- `first-run-hint.js` 是 **parser-blocking 外部 classic script**，不得改成 inline／defer／async／module；key 與 `app-gear.js` 兩份由 `tests/first-run-hint-key.test.mjs` 守。
- `app-quality-stages.js`＝品質階段→目標品質，**兩來源單位不同、換算只此一份**；`app-nextcraft.js` 的反查索引由 `ingredients.json` 倒建，**不得新增資料檔**。
- 分層 classic script 缺席**一律硬失敗**：`app.js` init 對每支分層檔 `throw new Error('<檔名> 未載入（部署不完整）')`，**不得 `?.` 軟略過**（T49）；各層內部的 `globalThis.CraftXxx?.` 是測試 sandbox 用（`LAYER_STUBS()`），不在此列。
- 步驟軸／文案／CTA／`pick-panel` 收合／`work.is-idle` 全由 `app-flow.js` 的 `flowState()` 算，**勿在各層自寫**；改變流程位置的事件 → `globalThis.CraftFlow?.update?.()`。
- 晶體判定只有 `app.js` 的 `isCrystal(iid, name)` 一份，各層經 deps 注入，**不得自寫正則**。T48。
- 程式化切頁一律帶移焦（`switchTab(name, true)`）；只有 tablist 自己的 click handler 例外。T47。
- 製作鏈：`.ing-go` 把當前配方推進**返回堆疊**（多層），堆疊**不在切分頁時清空**，只有返回列表或另選配方才放棄；鈕上次數＝做幾次。T58。`craftPlan` 已刪（B-032；匯出必有呼叫端由 T64 守）。
- 「繼續做」＝反方向動線：入口住「目前配方」列、沒下一階整顆收起；**往上走不推返回堆疊**，選到堆疊頂等同「← 回」；一件成品只佔一列、做得起的排前面；走彈窗。T57。
- 遮罩關閉必須「按下」也在遮罩上。T56；新 modal 一律照這條。
- `RECIPE_BY_ITEM` 的「取先出現者」**只用於配方表**；深連結／製作鏈／職業切換一律走 `pickRecipeForItem()`＝有填數值的職業 → 同職取難度最低；全同的重複列只留一顆鈕，同職多張鈕面帶第一個有差異的數字、都同就編號並在 data-help 列原料；畫面一律給切換鈕。T52。
- 專家之證是「角色狀態」不是求解選項：住 `gearsets[職業].specialist`，上限由 `CraftGear.SPEC_MAX` 守（回退＋toast，不用 disabled）；求解端讀 `gear.specialist`、**禁止從 DOM 讀**；證不跟著數值的 fallback 走。
- 求解計時＝軟提示不殺 worker；`stopSolveClock()` 掛在 onWorkerMsg／cancelSolve／onerror。
- 三處本地保存欄位要在 `init` 套回 DOM：食藥（`ffxiv-crafter-consumables-v1`）／等級同步（`ffxiv-crafter-level-sync-v1`，留空＝跟隨角色）／角色數值；等級輸入框在使用者聚焦時不得被 `refreshSelectedGear` 覆寫。
- 轉義紀律：動態字串（配方名／技能名／引擎 error）進 innerHTML 一律 `esc()`；icon 路徑無注入面故不 esc，**勿當 drift 誤補**。
- 素材總需求三組（可自製／採集購買／晶體）：配方走 `CraftRecipe.pickRecipeForItem`、商人徽章走 `CraftQuests.vendorHtml`，**勿在製造清單層另刻**；「加進清單」傳的次數＝做幾次不是要幾個，`removeOne`＝−1。T58。

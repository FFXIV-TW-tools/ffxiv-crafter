# ffxiv-crafter R2 複檢健檢報告（2026-07-11）

> R2 複檢（前輪 07-04 體質 7.8/使用者 7.1，批次全落地後再審）。方法：5 維 Workflow（10 agent＋對抗驗證）。前輪修復全數無回歸。

## 總評：專案體質 **7.8** / 10 · 使用者友善 **7.5** / 10 —— 內外皆穩（前輪 7.8/7.1；使用者升）

| 維度 | 分數 | 重點 |
|------|:---:|------|
| correctness-data（專案） | 7.5 | **A1 專家之證漏補 +15 CP（medium）**——CP 吃緊配方誤判 NoSolution/次佳；A2 TrainedEye 顯示低估（良性 low） |
| sec-resilience（專案） | 8 | A1 `g.level` 裸插 self-XSS 殘縫（L65 硬化漏這路徑）；A2 saveGear 空 catch 違鐵則字面 |
| quality-tests（專案） | 7.5 | A1 公式/hqPercent 60 格零 JS 測試（B-004 具體化） |
| docs-drift（專案） | 8.5 | serve.py 文件自相矛盾；DRY 條括號誤讀 |
| user-experience（使用者） | 7.5 | 求解等待無耗時回饋＋「數秒」文案被 60s 打臉；方位詞手機失準；spinner 凍結像當機 |

## 須修改
1. **M1**[專案·correctness] 專家之證只補 +20 作業/+20 加工、漏 +15 CP（`app.js:244-245`＋`index.html:114` 標籤）——遊戲實值 +20/+20/+15（動工前照鐵則對 game_ref/灰機再確認一次值）；CP 吃緊的專家配方（正是目標族群）被低估。

## 建議
批次 0：quality A1——`hqPercent`（60 斷點抽樣 golden）＋`recipeMaxes`＋`computeSettings`（spec §4 已驗值當 golden）node+vm 測試（參考 island solver.test 手法，不必等 B-002 拆分）。
其餘：sec A1 `Lv ${Number(g.level)||100}`＋grep 哨兵／A2 saveGear console.warn＋一次性 toast＋空 catch CI 哨兵／docs A1 smoke 指令收斂 serve.py、A2 DRY 括號改繫／UX A1 每秒耗時計數＋文案改「數十秒」、A2 方位詞中性化、A3 spinner 改非動畫指示。
【BACKLOG 既有不動】B-001 DOH 權威源／B-002 拆分／B-003 simulate／B-005 parse 優化（A3 為止血、根治仍歸 B-005）。

## 誤報/校正
1 refuted（CSP unsafe-inline＝已拍板取捨重報）；2 partial。

## 亮點
WASM 16 欄契約全對齊；fetch 三路徑韌性收乾淨；worker 生命週期三處 clearTimeout；42 函式零死碼。

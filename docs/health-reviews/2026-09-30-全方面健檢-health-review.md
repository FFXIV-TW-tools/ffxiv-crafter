---
cycle: 2026-09-30-health-review
status: in_progress
date: 2026-09-30
---

# 全方面健檢（2026-09-30）

## 總評：專案體質 8.3 / 10 · 使用者友善 7.9 / 10

內外皆穩，仍有資料保存、生成一致性與使用者流程缺陷。涵蓋 **16/16 維，0 failed／N-A**。這是修復前快照，非修復後重新評分；維度與前輪不同，不報分數 delta。

要求項目：完整健檢＝完成；不須拍板者直接修復＝8須修改＋8建議項完成，實跑證據見末段；須拍板項與改善建議＝下列 M1/M3/M11、S5/S8/S10/S11。未 commit、push、部署；未修改正式雲端設定、資料快照或 portal。

### 範圍、執行與控制

純靜態前端＋WASM worker＋CF settings 代理；使用者為繁中服製作玩家，維護者同時維護資料產生與部署鏈。

納入 5 個可選維（a11y-compat、deps-supply-chain、data-lifecycle、build-release、design-system）；成立訊號：hasFrontendUI、hasDepManifest、hasPersistence、hasReleaseFlow、hasSharedStyleLayer。unknown＝無；memory 未明示，不納入。相對 R5 新增 perf-data（有 JSON／worker）、a11y（UI）、deps（Cargo manifest）、data-lifecycle（本地保存）；保留 build-release/design-system；前輪未自動評分的 09-22 不冒稱同權重。

態勢 active：90 日 215 commits，距最後 commit 1.146 日，觀察窗有 feature commit；入場線 confirmed medium+ 真缺陷。

OMP 原生轉接執行原 gen-workflow 管線，非 Workflow 工具。Claude 初次呼叫遭額度拒絕，Owner 明確選 Sol 後保留同流程重跑：**41 次成功呼叫、0 失敗、峰值12**；實跑 openai-codex/gpt-6.1-sol。逐呼叫 effort 未傳、實際值不可觀測（policy Sol high）；預算 maxSpawns160 是呼叫計數非 token；獨立新 context 不代表跨家族。Owner 通知 Claude 額度恢復後，後續必要複審使用 Claude，不重做有效的 Sol 審查。帳號別名與逐筆 token 用量未取得，不填零。

四項控制：直接修復不改資料 schema／保存政策、對外 API、安全信任界線，也不遷移既存使用者資料；只有生成過程的 staging。刪除的是無效／錯誤／實作耦合斷言，非有效契約唯一覆蓋。未觸發 DEVLOOP 強制 post gate；完整計畫含保存／安全待決方案，需 clean-context 計畫審。Owner 授權限定本輪 confirmed、不需拍板項。

## 機械基線

快照 HEAD `d26b25e952cc2f1cfa8b9e508bb3a2f8cfcfefcf`，clean、0 dirty；最後 commit 約27小時前，2小時內無 commit。fan-out 後 status／行尾與基線相同，未污染產品檔。既有 CRLF：build-wasm.ps1 合法；BUILD-STAMP.json 舊工作樹 CRLF；11 單行 JSON 無終端換行與4二進位不算污染。

| 檢查 | 修復前實跑 |
|---|---|
| canonicalTest | formulas 557 passed/0 failed；run-all 2/2；35 Action；cargo 6 passed/0 failed |
| JS 語法 | 19 支根層 JS 通過 |
| DEVLOOP 工件 | 合格 |
| registry diff | 44 張登記表、10候選、0缺席；不是完整證明 |
| 本地部署 allow-list | run-all 實際產出驗收通過；未部署 CF |
| 實際瀏覽器 | 360×800 選配方→填數值→Worker 求解→複製中文巨集，CRLF 與 echo 正常；scrollWidth350≤clientWidth360 |
| 資產 | 正式 GET gzip wire：recipes209799、items353461、ingredients99541、WASM118688 bytes；HEAD 為版本檢查，不算多餘GET |
| 局部載入 | 本地 DCL388ms／load398ms，非壓縮正式站基線；慢任務5秒使核心262ms-ready仍等到5236ms |
| 安全探測 | service binding／路徑白名單／Origin保留／no-store：原 suite與 targeted grep；正式產物與來源hash一致 |

未做：CF dashboard／rollback、真正跨站帳號交接、正式雲端寫入、完整滲透、RUM/Lighthouse、全 Git 歷史密鑰／大檔掃描。輕掃 secret marker 未命中，不冒稱無密鑰。瀏覽器只見 portal announcement meta/json 本機 CORS error，未判為本站產品缺陷。

Main 加倍抽驗4項：真實 Lv90/4000/3500/CP180 求解 recipe35417，品質746/12900、HQ2%、留白無警語；烹調Lv10＋Lv15真實任務岩鹽算2但合併批量應1；按木工篩選Enter後focus變BODY；controlled job-quests pending而其他資料完成，CraftData.load仍不返回。另對9分 sec-backend親自 grep 正規化路徑／Origin／binding，未確認新增漏洞。

## 維度評分

confirmed數含獨立 verifier 的 confirmed/partial 可採用項；recall不混加權。medium封頂8；低嚴重度校正後重建 docs/tests/deps/design 分數。專案預設權重：sec雙維各.115、core/data各.135、resilience.13、quality/tests/docs各.09、perf-data.10；四可選project各.10，除以1.4。user perf/UX各.5、a11y.1，除以1.1。原始加權8.345714/7.863636，四捨五入8.3/7.9。

| 維度 | 分數 | confirmed數 | 本輪進BACKLOG數 | 前輪fate | 一句話 |
|---|---:|---:|---:|---|---|
| sec-backend | 9 | 0 | 0 | 09-22既有修復未見回歸；R5已結案見追蹤 | 本次未確認缺陷，不等同無風險 |
| sec-frontend | 8 | 1 | 1 | 09-22既有修復未見回歸；R5已結案見追蹤 | SF1壓分（詳清單） |
| correctness-core | 8 | 1 | 1 | 09-22既有修復未見回歸；R5已結案見追蹤 | C1壓分（詳清單） |
| correctness-data | 8 | 1 | 1 | 09-22既有修復未見回歸；R5已結案見追蹤 | D1壓分（詳清單） |
| resilience | 8 | 1 | 1 | 09-22既有修復未見回歸；R5已結案見追蹤 | RES-01壓分（詳清單） |
| quality | 8.8 | 1 | 0 | 09-22既有修復未見回歸；R5已結案見追蹤 | A1壓分（詳清單） |
| tests-ci | 8.8 | 1 | 0 | 09-22既有修復未見回歸；R5已結案見追蹤 | T1壓分（詳清單） |
| docs-drift | 8.5 | 4 | 0 | 09-22既有修復未見回歸；R5已結案見追蹤 | D1、D2、D3、D4壓分（詳清單） |
| perf-data | 9 | 0 | 0 | 新增維 | 本次未確認缺陷，不等同無風險 |
| perf-ux | 8 | 1 | 1 | 09-22既有修復未見回歸；R5已結案見追蹤 | PU1壓分（詳清單） |
| ux-flows | 7.8 | 2 | 1 | 09-22既有修復未見回歸；R5已結案見追蹤 | UX1、UX2壓分（詳清單） |
| a11y-compat | 7.5 | 2 | 2 | 新增維 | A1、A2壓分（詳清單） |
| deps-supply-chain | 8.8 | 2 | 0 | 新增維 | D1、D2壓分（詳清單） |
| data-lifecycle | 7.2 | 2 | 0 | 新增維 | DL-01、DL-02壓分（詳清單） |
| build-release | 8 | 2 | 2 | 09-22既有修復未見回歸；R5已結案見追蹤 | BR1、BR2壓分（詳清單） |
| design-system | 8.8 | 3 | 0 | 09-22既有修復未見回歸；R5已結案見追蹤 | DS1、DS2、DS3壓分（詳清單） |

M1同時傷core/lifecycle、M2同時傷resilience/lifecycle：同一bug跨維合併，兩維均計真傷、只開一票。

## recall 層

| 軌 | 觸發機會 | confirmed≥medium | 主審全集沒有的真盲區 | 結果 |
|---|---|---:|---:|---|
| A 註冊表差集 | 44表／10候選 | 0 | 0 | 差集0不是完整覆蓋证明；不計退場零產出 |
| B 關鍵字擴散 | 8合格spreadKey | 0 | 0 | 5採用low/info；script上限8；命中窗外丟棄數未獨立記錄，不猜0 |
| C 零-context | 僅鐵則與既定取捨 | 2 | 1 | C1=M4重複；C2=M5共享產量是唯一medium盲區命中 |

C盲重抓率分母n=0（前輪須修改已修／已結案；B023未知qty與B040新功能非本次前輪未修缺陷），**分母不足**，不畫趨勢。無refuted critical/high，盲重驗無觸發機會。

## 前輪追蹤

截至2026-09-30，09-22的七組修復：窄屏／hidden／深連結與键盤、低等技能gate、數值合法性、結果失效、恢復選配狀態、資料輸入缺件、未知Action拒绝，經對應來源錨／canonical／實際browser核驗仍在；本輪M7是篩選重繪的不同focus路徑，M2是跨檔發布而非單檔fail-closed，不能把已修舊項重新算未修。

R5直修16項已收官；B032刪craftPlan、B033規則拆分、B034模組/樣式/build拆分、B035首頁退出Functions、B036配方辨識、B037機械觸發、B038工具鏈日期、B039測試拆分均已結案（BACKLOG勾選＋live來源/基線）；不重開。09-22四項決策：62未知qty仍留未知、名稱已更新、集中CDN、非測試minify停用，均沿用。舊索引缺產值欄本次升級，不推估歷史入庫數。

## 須修改項目（必做）

11項confirmed medium真缺陷，超過約10的WIP警示：先直接修使用者錯誤與生成一致性，再建置；保存/安全與求解取捨等拍板。全部經planBacklogAppend：11入庫／0擋下（B041–051），不得以待決降格成可選建議。

| ID／票 | [視角·維度] | 缺陷、觸發與修法 | 本輪處理 |
|---|---|---|---|
| M1／B-041 | correctness-core | **多分頁保存靜默覆蓋**；crafting-list.js:68-95；app-gear.js:17-32,123-138；app-quests.js:38-40。保存衝突政策待 Owner 拍板；建議操作級合併並序列化寫入。 | 待拍板 |
| M2／B-042 | resilience | **資料生成失敗留下混代 bundle**；tools/build-data.py:52-63。在隔離目錄完整生成，缺上游任一輸入不發布；不重刷正式資料。 | 直接修復 |
| M3／B-043 | correctness-data | **神速技巧早退漏掉更短滿品質解**；wasm/src/lib.rs:197-199,246-251。最短巨集與求解延遲取捨待 Owner 拍板；不得針對配方特判。 | 待拍板 |
| M4／B-044 | ux-flows | **留白滿品質目標缺警語**；app-render.js:134-147。直接消費 computeSettings 的有效目標；NQ 不警告。 | 直接修復 |
| M5／B-045 | recall·正確性 | **共享中間材逐分支進位使採購量偏高**；app-quests.js:51-70。整次展開共用產量餘額；保留循環與深度邊界。 | 直接修復 |
| M6／B-046 | perf-ux | **任務與商人慢回應阻擋核心首載**；app-data.js:32-44；app.js:loadData。維持 eager 平行 fetch，任務／商人不再進核心 ready gate；任務載入狀態明示。 | 直接修復 |
| M7／B-047 | a11y-compat | **職業篩選與完成任務丟鍵盤焦點**；app-browse.js:52-59；app-quests.js:94-105,221-234。保留 chip DOM；移除已完成卡片時把焦點移到相鄰 checkbox 或篩選器。 | 直接修復 |
| M8／B-048 | a11y-compat | **選配方入口缺原生操作語意**；app-browse.js:145-167。名稱欄提供具名原生按鈕，保留點擊整列捷徑與 table 語意。 | 直接修復 |
| M9／B-049 | build-release | **建置戳記漏 manifest 與腳本**；tools/build-wasm.ps1；tools/check-actions.py:75-81。雙端新增 Cargo.toml 與 build-wasm.ps1 正規化 hash，真實重建戳記。 | 直接修復 |
| M10／B-050 | build-release | **空白路徑的 RUSTFLAGS 編碼失敗**；tools/build-wasm.ps1:36-43。改 CARGO_ENCODED_RUSTFLAGS Unit Separator，保留既有旗標並 finally 還原環境。 | 直接修復 |
| M11／B-051 | sec-frontend | **共用匯出未說明內含 capability 與 webhook**；../ffxiv-tw-tools-portal/settings-ui.js:241-249,1479-1490。跨 repo 安全／匯出契約待 Owner 拍板；本 repo 不擅改 portal。 | 待拍板 |

M1：兩個分頁讀同快照，A改cms／加CRP清單，B改ctrl／加BSM清單，B全量寫入會撤销A。推薦「操作級合併＋序列化寫入」；同欄位衝突可明示後寫者優先。備選衝突拒絕＋重載（不丟但須重填），或單分頁寫入限制（最簡、犧牲多開）。只重新讀localStorage仍有同時read-modify-write競態，不算完整修復。验收两真实tab各改不同字段/增删清单/任務勾选均保留，並覆盖同字段、无WebLocks與remote刷新政策。

M3：recipe1008，Lv100/4000/4000/600，神速技巧＋精密製作2步6秒；關神速技巧精密製作1步3秒，兩者滿品質(HQ100)。推薦先明定quality capped到目標/上限後再比時間步數，避免不必要比較超額品質；維持訓練眼分支作上界，用可證明下界剪枝。備選維持當前快回策略並不宣稱全局最短。取捨是求解延遲；不得為修一個例子移除所有快速路徑或特判1008。验收代表配方語料、時間/步數、求解延迟與差分；不改raphael原始碼。

M11：portal exportAll把UUID capability與Discord webhook写入JSON，匯出操作無就近警示；未證明外洩。推薦保留「私密完整備份」但明示不能分享、二次確認敏感內容；備選默认去敏分享导出＋另外完整备份（改变导入/身份恢复契約）；不推荐默默删字段。须跨repo Owner授权后做；验收export/import round-trip、无敏感分享输出、取消无文件生成。

## 建議修改項目（可選）

| ID | [來源] | 項目／位置 | 做法與ROI |
|---|---|---|---|
| S1 | quality:A1 + spread:renderIngredients:A1 | 無 consumer proxy／匯出／注入依賴；app.js:103-104,310,314；app-recipe.js:370-386 | 直接清理；保留仍有內部用途的 renderer。 |
| S2 | tests-ci:T1 | T28 假綠與實作耦合斷言；tools/tests/30-solve.test.mjs:224-276 | 刪無效／ wording 斷言，保留狀態節點穩定性的有效覆蓋；基線變動明記。 |
| S3 | docs-drift:D1 + spread:first-run-hint-key.test.mjs:A1 | 現役規則與註解仍宣稱已移除哨兵；frontend-state.md；ui-design.md；first-run-hint.js | 刪假護欄引用，不復活刻意移除的 source-only 測試。 |
| S4 | docs-drift:D2 | canonicalTest 指向退役 fleet.json；AGENTS.md:57；CLAUDE.md:8 | 改為 repo devloop.json；歷史條目不改。 |
| S5 | docs-drift:D3 | 艦隊共用部署並行規則與現況不符；AGENTS.md:119；deploy-prepare.sh:33-39；tests/deploy-prepare.test.mjs:11-12 | 待 Owner：13 repo 共用契約需集中整批對齊；不單邊改腳本或副本。 |
| S6 | docs-drift:D4 | 快取重抓 SOP 不符重用範圍；README.md:21-25 | 改為三檔快取 bundle 一起失效，其他輸入實際重新抓取。 |
| S7 | ux-flows:UX2 | 不足能力仍顯準備就緒；app-flow.js:96-134 | 直接由既有 statShortfall／flowState 顯示不足原因。 |
| S8 | deps-supply-chain:D1 | wasm-pack／optimizer 未強制版本；tools/build-wasm.ps1:55-80 | 待 Owner：A 維持版本紀錄；B 擴 pin 工具（推薦只在重現性事故需要時採 B）；現況符合 B-038 決策，不是漂移。 |
| S9 | deps-supply-chain:D2 | 授權生成忽略 CARGO_HOME；tools/build-notices.py:20-21,61-63 | 直接沿用 Cargo cache 來源，預設仍 ~/.cargo。 |
| S10 | design-system:DS1 | 404 離線樣式本地副本；404.html:8-33 | 待 Owner：推薦維持獨立離線頁；若要同步視覺，選 portal 權威生成最小離線 CSS，不直接加 CDN 依賴。 |
| S11 | design-system:DS2 | 兩套本地 accordion；styles/30-recipe.css；styles/40-result.css | 待 Owner：先在 portal 制定 compact 共用 variant 再遷，避免現行密度／幾何改變。 |
| S12 | design-system:DS3 + spread:--fs-xs:A1 | 兩處 11px fallback；styles/50-tabs.css:78,123 | 直接對齊共用 12px；正常 CDN token 已是 12px，不宣稱線上字級原本11px。 |

不入庫理由：全部low/info不達active入場線，報告承載。spread BUILD-STAMP規則缺口併M9；歷史lessons:118為2026-08-23原文，不改凍結叙事，可引用後續撤除記錄。_site來源副本非第二缺陷，不直接編輯產物。S5需13repo同步，推薦集中澄清單一writer現況與未來並行需求，再決定整批實作；S10/S11屬刻意取捨／UI共用方向而非現行失效。

## 誤報／校正

31原始finding：28confirmed、3partial、0refuted、0無verdict；**9條severity下降**（7medium→low、2low→info）。0refuted不等於橡皮圖章，Main已加倍抽4項。tests T1受影響非全部時鐘覆蓋；docs四項不造成現行用户流程坏；工具pack未pin符合现有只记录选择；404刻意离线降low；歷史lessons與_site生成副本降info。未将correctedSeverity后的low继续按medium封顶。

## 文件稽核

現役規則有假測試引用、canonicalTest來源退役、README快取SOP錯誤：按S3/S4/S6直接修drift。共享部署段S5不單邊修改。AGENTS的31,248B豁免上限不調高；歷史文件不回寫。Memory未納入，未讀改個人memory。

## 既有設計亮點

專案：無自有資料後端；settings用service binding保留IP/Origin、路徑deny-by-default；部署allow-list fail-closed；生成資料有上游權威；WASM/Action/工具鏈/授權在canonical檢查；世代號阻擋過期求解結果；serde超界報錯而非clamp。

使用者：繁中正名、HQ真實斷點、NQ與高難度警語、品質階段与等級同步、键盤深連結、巨集CRLF/echo、窄屏无整页溢出。這些優點不能抵消M4/M5/M7/M8。

## 後續追蹤

修復與實跑驗證另追加於此；快照finding不回寫。完整原始判決與模型記錄封存為本輪證據，不作新的權威狀態。

### 本輪已授權修復與驗收（2026-09-30）

健檢與本輪直修已交付；cycle 保留 in_progress，因 M1/M3/M11 尚待政策／安全決策。上文 findings 與8.3／7.9分數保留修復前快照，不冒稱重新評分。

| 項目 | 完成內容 | 實際驗收 |
|---|---|---|
| M2／B042 | 同磁碟 staging 先 seed 原輸入，各模組 OUT 暫時導向 staging；全程成功才發布變更 | full/actions/quests/consumables 四入口成功；缺 lookup、缺 static、生成例外均 exit1，每個原輸出 hash 不變。正式11檔未更新 |
| M4／B044 | render 消費 computeSettings 的有效品質目標，摘要與警語同源 | recipe35417、Lv90/4000/3500/CP180：留白12900、實際746、差12154；明填900差154；NQ 無品質警語。複製摘要含相同警示 |
| M5／B045 | 整次素材展開共用產量餘額；保留 cycle/depth 邊界 | 真實烹調Lv10/15岩鹽2→1；重複 root 原料20→10、diamond10→5。原程式對這兩個新案例輸出錯誤；交換順序相同；深度12收底層112×4096，循環邊界保留需求 |
| M6／B046 | 十一檔 eager fetch，核心九檔先 ready；晚到任務／商人獨立注入，清單只補徽章 | 延遲兩選配檔5秒：核心519ms、真實Worker求解901ms，兩檔仍pending；5156ms徽章補成3G，清單未提交數量7與焦點保留；任務失載明示失敗且主求解仍可用 |
| M7／B047 | chip DOM 重用；hideDone 移除焦點卡片時移往相鄰 checkbox／篩選器 | Enter木工／烹調師 chip均保留焦點与pressed；Space完成任務後移到next65791／previous68143；最後一張移到quest-hide-done且顯完成空狀態 |
| M8／B048 | table cell 中具名原生button，移除row tabindex，保留滑鼠列捷徑 | AX提供「選擇『食鹽』配方」button；Enter後focus=config-title；真實求解1步3秒，鍵盤複製中文/ac與CRLF/echo。360/390/700/1400各寬無文件橫向溢出，按鈕38px高 |
| M9／B049 | Cargo.toml／build-wasm.ps1 正規化hash雙端入戳記，正式脚本真重建 | 當前戳記通過；分別改manifest／腳本且pkg不變均拒收；LF、CRLF均通過；WASM315879B、SIMD與09-29輸出hash不變 |
| M10／B050 | encoded flags以0x1f分隔，保留encoded優先權，finally還原raw／encoded／cwd | 含空白路徑的真實Cargo探針raw exit101→encoded exit0；注入建置失敗仍精確還原環境與cwd |

S1/S2/S3/S4/S6/S7/S9/S12完成：清除無consumer proxy／匯出／注入、刪假綠與實作耦合斷言、移除現役假測試引用（含app.js T49註解）、canonical來源改devloop.json、README三檔快取SOP、能力不足引導、CARGO_HOME授權來源、兩處12px fallback。

- S2：刪留白不警告的錯誤斷言、stub自己預置ARIA的恆真斷言、60秒markup寫入次數的實作耦合斷言，非有效契約唯一覆蓋；狀態節點穩定性保留。新增3條共享產量／順序行為斷言，557基線不變；diamond fixture改為真正會拒收原缺陷的每分支一件，不用原先兩件恰巧正確的案例冒充回歸覆蓋。
- S7：recipe35830要求4740／4400，實有4000／3500；主CTA與placeholder均aria-disabled=true，hint／流程寫還差740／900，不再宣稱準備就緒。
- S9：獨立含空白CARGO_HOME實跑授權生成，46套件無未知授權；產物與正式授權逐byte一致（SHA256 `bfb45ef650a5699de690f4d34149c918b88abcfda7f91c4b96e2752aebf07bf9`），正式授權檔未改。
- S12：把--fs-xs設為invalid（強制走fallback）後，cl-mat-go與crafter-qt-tag computed font-size均12px；正常CDN token本來就是12px。

統一驗證（PowerShell）：formulas557/0、run-all2/2（含真實allow-list產出）、35Action與6項hash／toolchain／sim-diff tag、cwd wasm的cargo6/0、19支root JS語法通過。加強diamond案例後僅重跑受影響formulas，仍557/0；正常互動段本站console errors=[]。測試故障注入的expected stderr不冒稱產品錯誤；本機portal CORS基線另列於前段。

引擎未改版、未改lib.rs或Cargo.lock；真重建後pkg WASM／JS正規化hash與入場快照相同（WASM `21f27762…`、JS `9c8db263…`）。因此沿用[09-29有效差分與JS golden](../verification/2026-09-29-raphael-v0286-simd.md)（958495施放；3328組公式與97格HQ），**本轮未重跑這兩支重閘**。

封存：[完整判決／模型執行／PlanGate原文及SHA256／驗收數據](2026-09-30-全方面健檢-evidence.json)；畫面：[留白品質警語](2026-09-30-quality-warning.webp)、[晚到商人與未提交數量焦點](2026-09-30-delayed-vendors.webp)。PlanGate實跑Claude Opus5.5；兩個實作worker實跑Sol。實際effort／帳號通道未觀測，不填零。

限制：逐檔os.replace不保證任意中途OS故障下多檔完全原子；未遷移使用者保存、不改跨站匯出／安全界線。M1/B041、M3/B043、M11/B051仍是須修改，須拍板而非降格建議；S5/S8/S10/S11選項與建議見上文。未commit／push／部署／刷新正式資料或改portal。


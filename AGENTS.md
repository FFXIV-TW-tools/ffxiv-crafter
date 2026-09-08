# AGENTS.md — ffxiv-crafter

FFXIV 繁中服 DoH 配方製作求解器：純靜態站 + Rust/WASM raphael 引擎（web worker），**無自有資料後端**，另有兩支 CF Pages Functions。external 公開工具，部署 Cloudflare Pages。**規模級別 S**：不設 ROADMAP 分解層，直接 Plan→Build。

R7-exempt: 2026-11-16 依據：2026-08-16 Owner 拍板（B-025 第二輪）——第二事實源已移除、敘事已搬 `docs/lessons.md`、有測試守的條目已降成「規則一行＋測試編號」；剩下的「部署面鐵則」段是 13 個 external repo 共用的內嵌副本，不得單邊移出。**本檔位元組數不得超過豁免當時的 31,248**（T65 機械守；超過＝先搬敘事，不是改數字）。到期時重評：若該段已在艦隊層集中化即撤銷豁免。

> **三層分工**：本檔＝全 repo 適用的規則；由來／事故／實測數字／拍板日期＝`docs/rules-rationale.md`（同標題對應），踩坑敘事＝`docs/lessons.md`，測試數字沿革＝`docs/test-baseline-history.md`。設計 spec 落 portal repo（`external/ffxiv-tw-tools-portal/docs/specs/` 的 `2026-06-22-craft-solver-spec.md` + ADR-013），本 repo 不另立 specs/；重建見 `README.md`。

**路徑專屬規則（`.claude/rules/`）——Claude 讀到該路徑才載入；其他 agent 動那些檔前手動讀**：

| 規則檔 | 觸發路徑 | 管什麼 |
|------|------|------|
| `.claude/rules/frontend-state.md` | `app-*.js`／`crafting-list.js`／`first-run-hint.js`／`worker.js` | 前端狀態與流程：分層硬失敗、`flowState()`、返回堆疊、`pickRecipeForItem`、本地保存、轉義 |
| `.claude/rules/ui-design.md` | `index.html`／`404.html`／`styles/**`／render・browse・recipe・quests・consumable 層 | UI／設計系統：codex 元件、內容井、表格、`fitHeight()`、CLS、窄屏量測、CSP |
| `.claude/rules/job-quests.md` | `app-quests.js`／`tools/fetch-quest-qty.py`／`tools/job-quest-qty.json`／`tools/build_lib/**` | 職業任務：解包 vs 社群試算表的權威分工、HQ 徽章、商人、icon 取列 |
| `.claude/rules/wasm-engine.md` | `wasm/**`／`pkg/**`／`tools/sim-diff/**` | WASM 引擎：綁定與 `pkg/` 重建、差分閘、工具鏈釘日期、授權清單重產 |

---

## 🔒 工具鐵則（違反必阻擋）

- **`hqPercent()` 對照表勿改**（`app-render.js`）：斷點／缺口是遊戲真實值不是 bug；改前先舉「品質→HQ%」反例。
- **製作公式已對抗驗證**（`computeSettings`，spec §4）：改前先舉「錯誤輸入→輸出」反例；serde 對超界值**報錯而非截斷**，勿改 clamp。
- **遊戲資料一律來自 monorepo `game_ref.sqlite`** → `tools/build-data.py` 轉 `data/*.json`，**禁自建對照表**；三處機械守：
  - 技能繁中名／icon：`craft-actions.json` 鍵集合必 == `wasm/src/lib.rs` 的 Action 變體（`check-actions.py`）
  - 等級同步：`recipe_level_sync`（由 `Recipe.MaxAdjustableJobLevel` 解出）→ `level-sync.json`；**禁「rlv==690」形狀猜測**；換算只在 `app-level-sync.js`
  - 品質階段：`recipe_quality_stages`（由 `CollectableMetadata`＋`CollectableMetadataKey` 解出）→ `quality-stages.json`；只收已確證的 key 1／key 7，其餘 key **刻意不輸出**（B-041）；換算只在 `app-quality-stages.js`（T54）
- **繁中服至上**：顯示一律繁中正名（技能名走 game_ref、高難度=expert）；疑慮查 Lumina `ChineseSimplified.ScName` 或灰機 wiki，不自創。
- **codex 設計系統**：UI 元件一律走 portal CDN 的 `.codex-*`，勿 local 重寫；**改 UI/CSS 前先 Read** portal repo（`external/ffxiv-tw-tools-portal`）的 `_DESIGN-SYSTEM.md`（跨 repo 指標拆兩段寫，勿寫死磁碟機代號）。細則＝`.claude/rules/ui-design.md`。
- **monorepo 全域**：`except: pass` 禁止（至少 `console.warn`）；快取一律 bounded；新建原始碼檔 >500 行禁止。

---

## 🏗 架構

**模組 pattern（動任何一層前先懂）**：classic script 發佈 `globalThis.CraftXxx` ＋ `app.js` init 注入依賴 ＋ `app.js` 以**同名 proxy** 委派；「同名函式」不是重複實作。分層檔＝`app-{formula,data,flow,render,solve,browse,gear,recipe,nextcraft,quests,consumable,quality-stages,level-sync}.js`＋`crafting-list.js`＋`app.js`（唯一 `type=module` 入口），**各檔職責看該檔檔頭註解**；下表只列帶硬約束者。

| 路徑 | 硬約束 |
|------|------|
| `404.html` | 未知路徑回真 404，**不落 SPA fallback** |
| `tests/` | 跨檔靜態契約；`run-all.mjs` 自動掃描且有檔數下限 |
| `functions/` | 唯一伺服器端碼（CF Pages Functions）：`settings-api` 同源代理走 service binding 直呼，**不得改成 `fetch(URL)`**；`tests/settings-api.test.mjs` 守 |
| `wasm/`／`pkg/` | Rust 薄綁定（raphael-rs, Apache-2.0）＋ wasm-pack 輸出；公式在 JS 端算，WASM 只跑引擎。改動規則見 `.claude/rules/wasm-engine.md` |
| `data/` | recipes／items／ingredients／recipe_levels／craft-actions／meals／medicine／quality-stages／level-sync／job-quests／vendors，全由 `tools/build-data.py` 產 |
| `assets/` | `hq.png` **與 marketboard 同一張**，不自畫 |
| `tools/` | `build_lib/`＋`build-data.py`／`fetch-quest-qty.py`／`check-actions.py`／`build-wasm.ps1`／`build-notices.py`／`serve.py`／`test-formulas.mjs`（掃 `tools/tests/`） |
| `_headers` | CSP 完整分域＋快取一律 `must-revalidate`，**無 cachebust 腳本** |
| `_routes.json` | 只攔 API 代理路徑，每條 include 都是計費面；舊網址 301 走 CF 帳號層 Bulk Redirects，本 repo 無 middleware |
| `LICENSE-*.txt` | 散布 `pkg/*.wasm` 的授權義務；`build-notices.py` 自 `wasm/Cargo.lock` 產，**改依賴後必重跑並一起 commit** |

深連結 `?recipe=<id>`／`?item=<id>`＋`?stage=1|2|3`：**`stage` 只認階段序號、不收絕對品質數字**。

---

## ✅ VERIFY（改動後跑，未過不算完成）

**canonicalTest（safe-push 實跑；claude-skills `fleet.json` 逐字對照本行）**：

```bash
node tools/test-formulas.mjs && node tests/run-all.mjs && py -3.11 tools/check-actions.py
```

<!-- TEST-BASELINE cmd="node tools/test-formulas.mjs" match="(\d+) passed, \d+ failed" expect="684" label="test-formulas" -->
<!-- TEST-BASELINE cmd="py -3.11 tools/check-actions.py" match="(\d+) 個 Action 變體" expect="35" label="check-actions" -->
<!-- TEST-BASELINE cmd="cargo test" cwd="wasm" match="(\d+) passed" expect="5" label="cargo round-trip" -->
<!-- TEST-BASELINE cmd="node tests/run-all.mjs" match="(\d+)/\d+ 測試檔通過" expect="5" label="run-all" -->
<!-- ↑ B-013：宣告值 vs 實測值的機械比對（node tools/check-test-baseline.js --repo .）。改測試數量時這裡要一起改，否則 pre-commit gate 6 會擋。 -->

> 基線 **只准升不准降**；宣告值只在上方標記，散文不複述數字。

```bash
node --check *.js                # JS 語法（萬用字元；手維護清單會漏新模組）
node tools/test-formulas.mjs     # 純函式 golden + 機械哨兵（T0〜T65 在 tools/tests/）
py -3.11 tools/check-actions.py  # Action 變體 ＋ pkg/ 戳記 ＋ sim-diff 與 wasm 同一 tag
cd wasm && cargo test            # round-trip + 名稱唯一 + 神速技巧三條
```

- 改 `wasm/`／`pkg/`／`tools/sim-diff/` → 另有引擎差分閘、`pkg/` 重建與授權清單重產的必跑步驟，**全在 `.claude/rules/wasm-engine.md`**（太慢故都不進 pre-commit）。
- 改 `.js` / `.css` → **無 cachebust 步驟**。
- **手動 smoke**（改 UI／render／求解後）：`py -3.11 tools/serve.py`（:8809，勿用裸 `python -m http.server`）＋ `svc start portal`（:8774 供 codex CDN）→ 選配方 → 填數值 → 求解 → 複製巨集，零 console error。
- 純文件／規則檔改動：pre-commit gate 過 + 目視 diff 即足。

---

## 🛠 開發注意（可執行規則）

> 標了測試編號的條目**敘事在該測試自己的註解裡**——動那一區前先讀測試；其餘由來見 `docs/lessons.md`／`docs/rules-rationale.md`。新增條目前先問「能否固化成測試」（DEVLOOP §4.4.1）。
> **本節只放全 repo 適用的規則**；另四塊在檔頭索引表列的 `.claude/rules/*.md`，動那些路徑前務必讀。

### 資料與求解

- 宇宙探索配方 rlv 判準＝`Recipe.MaxAdjustableJobLevel`；**勿看 rlv 形狀、勿拿任務 LevelGroup 反推**；等級→rlv 取該職業等級最小 rlv。T20。
- 配方資料源＝tnze zh-CN＋item_lookup 繁中化，zh-TW 源停更**勿換回**；重建＝`tools/build-static-data.py` → `tools/build-data.py`；舊逐色染劑**勿當缺漏回補**。
- `build-data.py` 缺上游輸入＝exit 1：不覆蓋、也不得回報成功；新增輸入用 `problem()` 不用 `print`。
- 資料檔 ratchet **只准升不准降**（T31／T32／T54）。
- 求解上限唯一算式＝`recipeMaxes(recipe, rlv)`，顯示／求解／配方表共用；缺 rlv 顯「—」不顯 0。
- 最低能力擋閘唯一出口＝`app-formula.js` 的 `statShortfall`；基準 `effectiveStats`；求解鈕走 `aria-disabled`。T60／T61。
- 版本篩選選項**由資料生成**；版號一律 `parseFloat` 比較，**不可拆整數比**。T11。
- 高難度＝`is_expert` 屬性不是名字；**新增篩選控件要同時做三件事**：進 `filterKey()`、進「無符合配方」判斷、`app.js` 掛 `change`。T11。
- 改任一求解輸入 → `invalidateResults()` 集中失效；程式設值不觸發 input 者須手動呼叫。
- 巨集每段結尾要有帶音效 `/echo`（中段「第 N 段完成」、末段「製作完成」，單段 14 步）；例外＝末段剛好 15 步塞滿、或 `#macro-echo` 關（`ffxiv-crafter-macro-echo-v1`，回 15 步、切換不進 `invalidateResults()`）。T39。

### Git 邊界

commit 先知會、逐主題切；**push → CF Pages 自動部署對外可見 → STOP，由 Owner 跑** `bash ~/.claude/skills/process/tools/safe-push.sh --repo C:/FFXIVProject/external/ffxiv-crafter --reason "<原因>"`。裸 `git push` 被 hook 硬擋、不得繞，也不要改列 `!git push` 代跑。401＝在 git-bash 重跑。

---

## 開發循環（DEVLOOP）

正典：`~/.claude/process/DEVLOOP.md`。本 repo 工件：`CHANGELOG.md`、`docs/BACKLOG.md`、`docs/health-reviews/`（永久，豁免 docs 歸檔規則）；設計 spec 落 portal repo（見檔頭指標）。

### 🔒 部署面鐵則（勿回退）

CF Pages 部署**不是「發佈 repo 根目錄」**，而是由 `deploy-prepare.sh` 依 `deploy-allow.txt` 產出 `_site/`。CF dashboard 必須設 Build command = `sh deploy-prepare.sh`、Build output directory = `_site`。**本段是 external repo 共用權威版本**：改本段請同步全部副本，不得單邊移出。事故經過見 `docs/rules-rationale.md`。

- **允許清單而非排除清單**：頂層出現任何未列入 `deploy-allow.txt`／`deploy-deny.txt` 的項目 → **build 直接失敗**。分類閘另有兩條靜默放行（CF 容器 npm 產物 skip 清單、`git check-ignore`），它只是提醒層；**真正的邊界是第 2 段複製迴圈的 allow-list 比對**，該比對不可動、skip 清單不得用來繞分類。
- **新增站台資產** → 加 `deploy-allow.txt`；**新增內部資產** → 加 `deploy-deny.txt`。改完跑一次 `sh deploy-prepare.sh` 確認印出「✓ 部署輸出就緒」。
- **腳本改動禁忌**：① 只能用 POSIX 語法（CF 容器的 `sh` 是 dash，bashism 靜默失敗 ⇒ 整站 404）② 根層檔名不可無條件 `mkdir "$OUT/${f%/*}"` ③ 不得移除出貨前驗收閘（輸出 <3 檔／缺 index.html／內部檔混入 → 非零 exit，CF 保留前一版）④ **產物路徑不得假設獨佔**：建到 `_site.tmp.$$`、清單走 `mktemp`（repo 外）、換名段用 `mkdir "$_site.lock"` 序列化，哨兵＝`test_deploy_prepare_is_concurrency_safe`。
- **部署後驗（務必帶 cache-bust）**：`curl -sI "https://<repo>.pages.dev/AGENTS.md?cb=$(date +%s)"` → 回 `text/html` 正常；回 `text/markdown` ＝紅燈。⚠️ 不帶 cache-bust 會得到**假紅燈**（邊緣殘留 `CF-Cache-Status: HIT`＋大 `Age`）。

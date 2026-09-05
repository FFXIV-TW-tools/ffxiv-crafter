// tools/tests/61-repo-sentinels.test.mjs — repo 級不變量哨兵：local hardcode／移焦／晶體／分層守衛／資料不變量／CSP／授權／匯出死碼（T29・T47〜T49・T52〜T54・T63〜T65）
// 由 tools/test-formulas.mjs 依檔名序 import 跑；斷言計數器與共用 fixture 都在 ./_harness.mjs。
import { fs, path, ROOT, CSS_SRC, sandbox, T, check, eq } from './_harness.mjs';

// ===== T29：DOH / JOB_ICON 是刻意的 local hardcode（B-001）——用不變量取代上游 sync =====
// jobs.json 只散布 21 個戰鬥職、不含製作職 ⇒ 這兩份沒有權威源可對。防漂移改用「對得起實際資料」：
// 遊戲加/改製作職，或有人手滑改壞任一份，這裡就會紅。
{
  const recipes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'recipes.json'), 'utf8'));
  const rows = Array.isArray(recipes) ? recipes : (recipes.recipes || Object.values(recipes));
  const jobsInData = [...new Set(rows.map((r) => r.job))].sort();
  const doh = [...T.DOH].sort();
  eq('T29 DOH == recipes.json 實際出現的所有職業', doh.join('|'), jobsInData.join('|'));
  eq('T29 JOB_ICON 的鍵集合 == DOH', Object.keys(T.JOB_ICON).sort().join('|'), doh.join('|'));
  check('T29 JOB_ICON 每個值都是 icon 路徑',
    Object.values(T.JOB_ICON).every((v) => /^\/i\/\d{6}\/\d{6}\.png$/.test(v)));
}


// ===== T47：把玩家丟到別的分頁時要移焦（UX-08）＋ 收走最後一列要補空狀態（CF-05）=====
{
  // (a) 程式化切頁一律帶第二引數 true（移焦）。少了它，鍵盤／螢幕閱讀器使用者被丟回頁面開頭，
  //     而這幾條路徑全是「被擋下 → 去補資料」的補救動線，正是最需要焦點跟過去的時候。
  //     `switchTab('x')` 只允許出現在 tab 本身的 click handler（那裡焦點已經在 tab 上）。
  const srcs = ['app.js', 'app-solve.js', 'app-recipe.js', 'app-quests.js', 'crafting-list.js', 'app-browse.js'];
  const bare = [];
  for (const f of srcs) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const line of t.split(String.fromCharCode(10))) {
      if (!/switchTab\(\s*'[a-z]+'\s*\)/.test(line)) continue;
      if (/t\.dataset\.tab/.test(line)) continue;        // tablist 自己的 click handler
      if (/^\s*\/\//.test(line)) continue;                 // 註解裡提到函式名不算呼叫
      bare.push(f + ': ' + line.trim().slice(0, 70));
    }
  }
  check('T47 程式化切頁一律移焦（switchTab 帶第二引數）', bare.length === 0, bare.join(' | '));

  // (b) 「只顯示未完成」收走最後一列後必須補空狀態，否則玩家看到一片空白會以為壞了。
  //     局部移除那條路徑不會經過 questsHtml，所以要顯式偵測「清單已空 → 重繪」。
  const Q = fs.readFileSync(path.join(ROOT, 'app-quests.js'), 'utf8');
  check('T47 勾完最後一列 → 偵測清單已空並重繪（不留空白）',
    /querySelector\('\.crafter-qt-quest'\)\)\s*\{\s*render\(\);/.test(Q.replace(/\s+/g, ' ').replace(/ \{ /g, ' { '))
    || /!\$\('quest-body'\)\.querySelector\('\.crafter-qt-quest'\)/.test(Q));
}

// ===== T48：晶體判定只有一份實作（Q-02）＋ 硬編值不得繞過 token（DS-04/05）=====
{
  const js = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js'));
  const owners = js.filter((f) => /category === '水晶'/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  check('T48 晶體判定規則只在 app.js 定義一次（判準＝items.json 的 category，不再用名稱正則；健檢 R5 M14）',
    owners.length === 1 && owners[0] === 'app.js', `實際：${owners.join(', ') || '無'}`);
  for (const f of ['app-recipe.js', 'crafting-list.js']) {
    check(`T48 ${f} 走注入的 deps.isCrystal`, /deps\.isCrystal\(/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  }
  // DS-04：斑馬紋值要與本檔其餘處一致（原本 rgba(255,255,255,.02) 與共用層的 .035 也對不上）
  check('T48 食藥選單斑馬紋不得自寫 rgba（與本檔其餘斑馬紋同一個值）',
    !/crafter-cons__opt:nth-child\(even\)[^}]*rgba\(/.test(CSS_SRC));
  check('T48 icon 圓角走 token 不寫死 4px',
    !/crafter-cons__ico[^}]*border-radius:\s*4px/.test(CSS_SRC));
  // DS-05：錯誤橫幅不得用 inline style
  const APP48 = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  check('T48 資料載入失敗橫幅不用 inline style（走 tint panel + 具名 class）',
    !/資料載入失敗[^<]*<\/div>/.test(APP48.replace(/\s+/g, ' ')) || !/style="margin/.test(APP48));
}

// ===== T49：每一支分層 classic script 都要有硬失敗守衛（RES-02）=====
// 原本只有 gear/recipe/consumable/browse/flow 五支硬擋，solve/render/quests/stages/sync/list 是 `?.` 軟略過
// ⇒ 那些檔案 404 時玩家拿到的是「看起來正常、按下去無聲 TypeError」的頁面，而不是一句「部署不完整」。
// 這條掃 index.html 的 script 清單反推：新增分層檔而忘了加守衛會直接紅。
{
  const HTML49 = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const APP49 = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const files = [...HTML49.matchAll(/<script src="((?:app-|crafting-)[^"]+\.js)"><\/script>/g)].map((m) => m[1]);
  check('T49 掃到全部分層 script（至少 11 支，掃到 0 支也算失敗）', files.length >= 11, `${files.length} 支`);
  const missing = files.filter((f) => !APP49.includes(`throw new Error('${f} 未載入`));
  check('T49 每一支分層檔在 app.js 都有「未載入（部署不完整）」硬擋',
    missing.length === 0, `缺守衛：${missing.join(', ')}`);
}

// ===== T52：多職業可製作時要能換職業（Owner 2026-08-15）=====
// 實測 651 件物品有多個配方，宇宙探索的「統一規格的金屬板」3 職 12 張（同職多張的規則見上方 T52 接線段）。
// 只取「先出現者」等於幫玩家選了一個他可能沒練的職業，他按求解只會被擋在角色數值頁。
{
  const R = [
    { id: 10, item_id: 48251, item_name: '統一規格的合金', job: '鍛造', item_amount: 1 },
    { id: 11, item_id: 48251, item_name: '統一規格的合金', job: '甲冑', item_amount: 1 },
    { id: 12, item_id: 48251, item_name: '統一規格的合金', job: '金工', item_amount: 1 },
  ];
  const byId = Object.fromEntries(R.map((r) => [r.id, r]));
  const byItemAll = { 48251: [10, 11, 12] };
  const CR = sandbox.CraftRecipe;
  check('T52 CraftRecipe 導出 recipesForItem / pickRecipeForItem',
    typeof CR.recipesForItem === 'function' && typeof CR.pickRecipeForItem === 'function');
  void R; void byId; void byItemAll;
}

// ===== T54：食藥與品質階段的資料不變量（B-030）=====
// 這兩份資料的產生端都是 fail-open：查不到就寫 null／輸出新來源就照寫，`build-data.py` 一路 ✓。
// 消費端也不會出錯——食藥少了 icon 就是「那一列沒圖」，品質階段來源不認得就是 toQuality 回 0、
// 該檔從下拉裡消失。**兩邊都不報錯**，所以只有在這裡對資料本身斷言才擋得住。
{
  const readData = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));

  // (a) 食物／藥水：icon 與 item id 靠繁中名對 item_lookup，查無就寫 null（build 端不當錯誤）。
  //     現況 100/24 筆全中 ⇒ ratchet 直接釘在「一筆都不准缺」，退步時才有人知道。
  for (const [f, n] of [['meals.json', 100], ['medicine.json', 24]]) {
    const rows = readData(f);
    check(`T54 ${f} 筆數不得縮水（現況 ${n}）`, rows.length >= n, rows.length);
    const noIcon = rows.filter((e) => !e.icon);
    check(`T54 ${f} 每筆都要對到 icon（繁中名對帳退步時這裡會紅）`,
      noIcon.length === 0, noIcon.map((e) => e.name).join(','));
    check(`T54 ${f} 每筆都要對到 item id`, rows.every((e) => Number.isSafeInteger(e.id) && e.id > 0));
    check(`T54 ${f} icon 是 /i/NNNNNN/NNNNNN.png 形狀（iconUrl 轉 v2 CDN 靠這個形狀）`,
      rows.every((e) => /^\/i\/\d{6}\/\d{6}\.png$/.test(e.icon)),
      (rows.find((e) => !/^\/i\/\d{6}\/\d{6}\.png$/.test(e.icon)) || {}).icon);
    check(`T54 ${f} 每筆都有繁中品名`, rows.every((e) => e.name && String(e.name).trim()));
  }

  // (b) 品質階段：`src` 的字彙由**消費端** app-quality-stages.js 的 toQuality 決定。
  //     資料端哪天多輸出一種（如 root B-041 的 key 2/3/4/6），toQuality 走 `return 0`
  //     → 那一檔靜默從下拉消失，玩家看到的是「這個配方只能衝滿品質」而不是錯誤。
  //     故不在這裡寫死清單，改成從消費端原始碼抽出它認得的 src，再要求資料 ⊆ 它。
  const QS_SRC = fs.readFileSync(path.join(ROOT, 'app-quality-stages.js'), 'utf8');
  const known = new Set([...QS_SRC.matchAll(/src === '([a-z]+)'/g)].map((m) => m[1]));
  check('T54 抽得到 toQuality 認得的來源（抽不到＝這條哨兵失效，不是資料沒問題）', known.size >= 2, [...known].join(','));
  const qs = Object.values(readData('quality-stages.json'));
  const unknownSrc = [...new Set(qs.map((e) => e.src))].filter((s) => !known.has(s));
  check('T54 quality-stages.json 的每一種 src 前端都會換算（否則該檔靜默消失）',
    unknownSrc.length === 0,
    `前端認得 [${[...known].join(',')}]，資料出現 [${unknownSrc.join(',')}]`);
  check('T54 quality-stages.json 筆數不得縮水（現況 992）', qs.length >= 992, qs.length);
  check('T54 每筆恰好三檔門檻', qs.every((e) => Array.isArray(e.stages) && e.stages.length === 3));
  check('T54 門檻值是非負整數（0＝該配方沒有那一檔，負數/小數＝資料壞了）',
    qs.every((e) => e.stages.every((v) => Number.isSafeInteger(v) && v >= 0)));
  check('T54 門檻由低到高（順序反了會讓「二階」比「三階」還難）',
    qs.every((e) => e.stages.filter(Boolean).every((v, i, a) => i === 0 || v > a[i - 1])),
    JSON.stringify(qs.find((e) => e.stages.filter(Boolean).some((v, i, a) => i > 0 && v <= a[i - 1])) || null));
}

// ===== T53：CSP `unsafe-inline` 的依賴面不得無聲擴大（B-031）=====
// 移除 `unsafe-inline`（改 sha256）已被兩輪判為重報、本輪 verifier 也降 low —— 沒有新的可利用路徑。
// **唯一有增量價值的是這支哨兵**：`unsafe-inline` 之所以留著，理由是「head 那段 bootstrap 非留不可」。
// 那個理由只在段數不變時成立；哪天有人順手加第 2 段可執行 inline script，`unsafe-inline` 的實際依賴面
// 就從「一段查得到出處的 bootstrap」變成「任何人都能往頁面裡塞」，而 **CSP 檔一個字都不用改、零訊號**。
// 2026-09-05：舊網域交接那段隨交接機制退役刪除（301 已搬到 CF 帳號層 Bulk Redirects）⇒ 預期值 2 → 1。
// 加新的 inline script 不是不行，但要在這裡明講它是什麼、為什麼不能改成外部檔。
{
  const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const opens = HTML.match(/<script\b[^>]*>/g) || [];
  // 有 src 的是外部檔（CSP 走 host 白名單，不吃 unsafe-inline）；ld+json 是資料不是可執行碼。
  const inlineExec = opens.filter(t => !/\bsrc=/.test(t) && !/type=["']application\/ld\+json["']/.test(t));
  check('T53 index.html 的可執行 inline script 恰為 1 段（portal CDN bootstrap）',
    inlineExec.length === 1,
    `實測 ${inlineExec.length} 段：${inlineExec.join(' | ')}\n` +
    '→ 新增可執行 inline script 會擴大 CSP unsafe-inline 的依賴面。' +
    '能改成外部 .js 就改（外部檔走 script-src self，不需要 unsafe-inline）；' +
    '真的非 inline 不可（如必須在 CDN bootstrap 之前跑）就更新本條的預期值並在此註明用途。');
  // `unsafe-inline` 還在＝上面那段確實靠它；哪天 CSP 收緊了，這條會提醒回來重估本哨兵
  const csp = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8');
  check('T53 script-src 仍帶 unsafe-inline（本哨兵存在的前提）',
    /script-src[^;]*'unsafe-inline'/.test(csp));
}

// ===== T63：健檢 2026-09-05 批次 0 的靜態哨兵 =====
{
  const APP63 = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const HTML63 = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const ALLOW63 = fs.readFileSync(path.join(ROOT, 'deploy-allow.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
  // M8：AbortSignal.timeout 必伴存在性判斷（舊瀏覽器整站死在 fetch 之前，連 fetchOpt 的降級都吃不到）
  // fetch 那一段 2026-09-06 隨 loadData 拆到 app-data.js（app.js 只剩薄 proxy）→ 這兩條跟著改讀該檔
  const DATA63 = fs.readFileSync(path.join(ROOT, 'app-data.js'), 'utf8');
  eq('T63 AbortSignal.timeout 只有一個呼叫點', (DATA63.match(/AbortSignal\.timeout\(/g) || []).length, 1);
  check('T63 AbortSignal.timeout 呼叫前有存在性判斷（禁裸呼叫）', /AbortSignal\?\.timeout \? AbortSignal\.timeout\(/.test(DATA63));
  // M14：晶體判定走 items.json 的 category，不再用名稱正則
  check('T63 isCrystal 以 category === 水晶 判定', /category === '水晶'/.test(APP63));
  check('T63 isCrystal 不再用名稱正則（曾誤判 55 筆 id≥20 的物品）', !/晶簇\|水晶\|碎晶/.test(APP63));
  const ITEMS63 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/items.json'), 'utf8'));
  const crystals = Object.values(ITEMS63).filter((it) => it && it.category === '水晶').length;
  check(`T63 items.json 有 category=水晶 的資料可判（實測 ${crystals}）`, crystals >= 18);
  // M21：icon 來源 host 要 preconnect，且本站只用 <img> 故不得帶 crossorigin（帶了會開第二條連線池）
  const iconHost = (APP63.match(/https:\/\/([a-z0-9.-]+)\/api\/asset/) || [])[1];
  const pcTag = (HTML63.match(/<link rel="preconnect" href="https:\/\/[^"]+"[^>]*>/g) || []).find((t) => t.includes(`https://${iconHost}"`)) || '';
  check(`T63 icon host（${iconHost}）有 preconnect`, !!iconHost && !!pcTag);
  check('T63 icon host 的 preconnect 不帶 crossorigin', !!pcTag && !/crossorigin/.test(pcTag));
  // M4：頁尾與 LICENSE-MIT.txt 指向的授權檔都必須在部署允許清單（曾指向一個線上 404 的檔）
  const footerLic = [...HTML63.matchAll(/href="(LICENSE[^"]*)"/g)].map((m) => m[1]);
  check(`T63 頁尾連出的授權檔都在 deploy-allow（${footerLic.join(' ')}）`, footerLic.length >= 3 && footerLic.every((f) => ALLOW63.includes(f)));
  const mitRef = (fs.readFileSync(path.join(ROOT, 'LICENSE-MIT.txt'), 'utf8').match(/LICENSE-THIRD-PARTY\.txt/) || [])[0];
  check('T63 LICENSE-MIT.txt 指向的著作權人清單檔在 deploy-allow 且存在', !!mitRef && ALLOW63.includes(mitRef) && fs.existsSync(path.join(ROOT, mitRef)));
  check('T63 著作權人清單檔名走 LICENSE*.txt（命中 deploy-prepare.sh 的既有例外，共用腳本零改動）', /^LICENSE.*\.txt$/.test(mitRef || ''));
}

// ===== T64：分層模組匯出的每個函式都要有生產端呼叫點（B-032）=====
// 由來：`craftPlan` 在 app-recipe.js 匯出、T51 有 8 條全綠 golden、AGENTS.md 架構表把它列為製作鏈的實作——
// 但生產路徑上零呼叫（UI 走的是 craftIngredient／返回堆疊），而且它對鑽石依賴會重複計數。
// **一份看起來被驗證過的假護欄**比沒有更糟：測試越綠，越沒有人去看它有沒有人用。
// 判準：index.html 實際載入的每支 .js 裡，`globalThis.CraftXxx = { … }` 物件字面量匯出的每個名字，
// 至少要在**某支載入的 .js 的程式碼**（剝掉註解與字串）裡以呼叫或傳遞的形狀出現在定義行之外。
// 只被測試呼叫不算「有人用」——測試不是使用者。
{
  const HTML64 = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // 只認 src 是純相對檔名的真標籤；inline bootstrap 用 document.write 拼出來的 CDN 字串（`' + base + 'header.js'`）不是本地檔
  const loaded = [...HTML64.matchAll(/<script[^>]*\bsrc="([\w.-]+\.js)"/g)].map((m) => m[1]).filter((f) => fs.existsSync(path.join(ROOT, f)));
  check(`T64 index.html 載入的本地 .js 可列舉（${loaded.length} 支）`, loaded.length >= 13);
  // 只剝註解、不剝字串：巢狀 template literal（`${a ? `b` : ''}`）用 regex 剝不乾淨，剝錯會整段吞掉真的呼叫點；
  // 字串裡出現「name(」形狀的機率極低，留著換取判準可靠。`https://` 那種冒號後的雙斜線不是註解。
  const stripCode = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
  const code = Object.fromEntries(loaded.map((f) => [f, stripCode(fs.readFileSync(path.join(ROOT, f), 'utf8'))]));
  const dead = [];
  let exported = 0;
  for (const f of loaded) {
    const m = code[f].match(/globalThis\.(Craft\w+)\s*=\s*\{([\s\S]*?)\n\s*\};/);
    if (!m) continue;
    // 物件字面量的頂層鍵：巢狀括號內容先剝掉（方法體與參數列不是匯出），剩下的 `name,`／`name:`／`name(` 才是鍵
    let body = m[2], prev;
    do { prev = body; body = body.replace(/\([^()]*\)|\{[^{}]*\}/g, ''); } while (body !== prev);
    // `init` 由 app.js 統一呼叫；`_` 開頭＝明示的測試鉤（純函式給 golden 用，如 CraftStages._toQuality），不在「生產端必有人用」的範圍
    const names = [...body.matchAll(/(?:^|[,\n])\s*([A-Za-z_$][\w$]*)\s*(?=[,:\n])/g)].map((x) => x[1]).filter((n) => n !== 'init' && !n.startsWith('_'));
    for (const n of names) {
      exported++;
      const used = loaded.some((g) => {
        const src = code[g].replace(new RegExp(`function\\s+${n}\\s*\\(`, 'g'), '');   // 定義行不算
        return new RegExp(`(?:^|[^\\w$.])${n}\\s*\\(|\\.${n}\\s*(?:\\?\\.)?\\(|[:,(]\\s*${n}\\s*[,)]`).test(src);
      });
      if (!used) dead.push(`${f}:${m[1]}.${n}`);
    }
  }
  check(`T64 匯出的函式都有生產端呼叫點（掃到 ${exported} 個匯出）`, exported >= 40 && dead.length === 0, dead.join(' '));
}

// ===== T65：AGENTS.md 位元組數不得超過 R7 豁免當時的值（B-033 C）=====
// 由來：豁免落地時（2026-08-17，0ca22de）是 31,248 B；之後長到 38,974 B（+25%）而沒有任何閘會發現——
// check-devloop-artifacts 對「已豁免」與「超出豁免當時的值」印的是同一行 `⚠ R7 … > 20KB`，
// 那行從豁免那天起每次 commit 都在印，於是被合理地當成已知而略過。**修法必須讓兩者在機械上可分辨**：
// 這條只在「超過豁免當時的值」時紅。超標的處置是搬敘事到 docs/lessons.md、把有測試守的條目降成一行，
// **不是改這裡的數字**——改數字＝把護欄變 KPI。豁免撤銷（R7-exempt 行拿掉）時本條一併改成 20KB。
{
  const AGENTS_CAP = 31248;
  const agentsBytes = Buffer.byteLength(fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8'), 'utf8');
  const agentsSrc = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
  check(`T65 AGENTS.md 位元組數 ${agentsBytes} ≤ 豁免當時的 ${AGENTS_CAP}（超過＝搬敘事到 docs/lessons.md，不是改數字）`, agentsBytes <= AGENTS_CAP);
  check('T65 AGENTS.md 仍帶 R7-exempt 戳（豁免撤銷時本條的上限要改回 20KB）', /R7-exempt:\s*\d{4}-\d{2}-\d{2}/.test(agentsSrc));
}

// tools/tests/61-repo-sentinels.test.mjs — repo 級資料／部署不變量哨兵（T29・T53〜T54・T63）
// 由 tools/test-formulas.mjs 依檔名序 import 跑；斷言計數器與共用 fixture 都在 ./_harness.mjs。
import { fs, path, ROOT, T, check, eq } from './_harness.mjs';

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

  // (b) 品質階段資料：每筆都必須保有三檔門檻，且門檻順序與數值型別穩定。
  //     消費端遇到未知 src 會 fail-open；這裡只守生成資料本身，不把實作原始碼當答案。
  const qs = Object.values(readData('quality-stages.json'));
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

// ===== T63：資料與部署面哨兵 =====
{
  const HTML63 = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const ALLOW63 = fs.readFileSync(path.join(ROOT, 'deploy-allow.txt'), 'utf8').split(/\r?\n/).filter(Boolean);

  // M14：真實資料仍有 category=水晶 的項目，供公開資料層判定。
  const ITEMS63 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/items.json'), 'utf8'));
  const crystals = Object.values(ITEMS63).filter((it) => it && it.category === '水晶').length;
  check(`T63 items.json 有 category=水晶 的資料可判（實測 ${crystals}）`, crystals >= 18);

  // M4：頁尾與 LICENSE-MIT.txt 指向的授權檔都必須在部署允許清單（曾指向一個線上 404 的檔）
  const footerLic = [...HTML63.matchAll(/href="(LICENSE[^"]*)"/g)].map((m) => m[1]);
  check(`T63 頁尾連出的授權檔都在 deploy-allow（${footerLic.join(' ')}）`, footerLic.length >= 3 && footerLic.every((f) => ALLOW63.includes(f)));
  const mitRef = (fs.readFileSync(path.join(ROOT, 'LICENSE-MIT.txt'), 'utf8').match(/LICENSE-THIRD-PARTY\.txt/) || [])[0];
  check('T63 LICENSE-MIT.txt 指向的著作權人清單檔在 deploy-allow 且存在', !!mitRef && ALLOW63.includes(mitRef) && fs.existsSync(path.join(ROOT, mitRef)));
  check('T63 著作權人清單檔名走 LICENSE*.txt（命中 deploy-prepare.sh 的既有例外，共用腳本零改動）', /^LICENSE.*\.txt$/.test(mitRef || ''));
}



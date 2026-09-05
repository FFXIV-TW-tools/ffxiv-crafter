// tools/tests/60-ui-sentinels.test.mjs — UI／設計系統靜態哨兵：hidden 守衛／共用元件／內容井／表格／窄屏形狀（T21・T34〜T36・T44・T50・T55・T59）
// 由 tools/test-formulas.mjs 依檔名序 import 跑；斷言計數器與共用 fixture 都在 ./_harness.mjs。
import { fs, vm, path, ROOT, readAllCss, CSS_SRC, sandbox, T, check, eq, gear } from './_harness.mjs';

// ===== T21：`hidden` 屬性必須真的收得起來（[hidden] 守衛哨兵）=====
// UA 樣式的 [hidden]{display:none} 優先權最低，本地 `.x{display:flex}` 一寫就蓋掉它 →
// JS 設 `el.hidden = true` 完全沒作用，元素照樣顯示。這個坑在本 repo 反覆出現（`styles/` 已有 6 條
// 手寫守衛），且**用 `el.hidden` 斷言驗不出來**（屬性是 true、畫面是顯示）——2026-08-02 等級同步面板
// 就是這樣過了測試卻每個配方都顯示。故改成機械掃描：index.html 裡帶 hidden 的元素，其 id/class 若在
// `styles/` 被指定了非 none 的 display，就必須有對應的 `[hidden]` 守衛。
// 涵蓋範圍限本地 `styles/`（portal CDN 的 .codex-* 不在此檔，其守衛見 styles/10-base.css 檔頭 B-006 註）。
{
  const HTML_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sels = new Set();
  for (const m of HTML_SRC.matchAll(/<\w+\s([^>]*)>/g)) {
    const attrs = m[1];
    if (!/(^|\s)hidden(\s|$|=)/.test(attrs)) continue;
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    const cls = (attrs.match(/\bclass="([^"]+)"/) || [])[1];
    if (id) sels.add('#' + id);
    if (cls) cls.split(/\s+/).filter(Boolean).forEach((c) => sels.add('.' + c));
  }
  const unguarded = [];
  for (const s of sels) {
    const rule = CSS_SRC.match(
      new RegExp('(?:^|[,}\\s])' + s.replace(/[.#]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm'));
    if (!rule) continue;                                   // 本地 CSS 沒管這個選擇器 → UA 規則生效，安全
    const display = rule[1].match(/display\s*:\s*([^;!]+)/);
    if (!display || /none/.test(display[1])) continue;      // 沒設 display 或本來就 none → 蓋不到
    if (!CSS_SRC.includes(s + '[hidden]')) unguarded.push(`${s}(display:${display[1].trim()})`);
  }
  check(`T21 哨兵本身有效：掃到帶 hidden 的選擇器（實測 ${sels.size} 個）`, sels.size >= 20);
  eq('T21 帶 hidden 的元素若被本地 CSS 指定 display，必須有 [hidden] 守衛',
    unguarded.join(' '), '');
}

// ===== T34：複製品名鈕必須走 portal 共用元件（不自刻 emoji 鈕）=====
// 由來：複製鈕在 5 個 repo 各刻一份、glyph 四種不一致（📋/⧉/🔗），B-027 已把它升格成
// portal 的 `FFXIVIcons.btnHTML('copy', …)` ＋ `FFXIVClipboard.copy`。本站接上去時很容易
// 「順手寫個 📋 button」——那就白升格了，且 emoji 當功能性圖示會字型相依、拿不到 currentColor。
// 另一半是 HTML 合法性：素材列原本整列是 <a>，把 <button> 塞進去是非法嵌套，
// 而且點鈕會連帶跳頁（互動元素不得互套）。
{
  const QSRC = fs.readFileSync(path.join(ROOT, 'app-quests.js'), 'utf8');
  const mk = (withIcons) => {
    const calls = [];
    const ctx = { console, document: { getElementById: () => null }, localStorage: { getItem: () => null, setItem() {} } };
    if (withIcons) {
      ctx.FFXIVIcons = { btnHTML: (name, label, attrs) => { calls.push({ name, label, attrs }); return `<button class="codex-icon-btn" aria-label="${label}"><svg/></button>`; } };
    }
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(QSRC, ctx, { filename: 'app-quests-t34.js' });
    ctx.CraftQuests.init({ $: () => null, esc: (s) => String(s), iconUrl: () => '', toast() {}, mbItem: () => '#',
      selectRecipe: () => true, switchTab() {}, copyText() {}, getItems: () => ({}), getIngredients: () => ({}),
      getRecipesById: () => ({}), getRecipeByItem: () => ({}) });
    return { Q: ctx.CraftQuests, calls };
  };

  const shared = mk(true);
  const html = shared.Q.copyBtn('胡桃木材');
  eq('T34 有共用元件時一律走 FFXIVIcons.btnHTML（不自刻）', shared.calls.length, 1);
  eq('T34 用的是 copy 圖示', shared.calls[0].name, 'copy');
  check('T34 aria-label 帶得到品名（圖示鈕沒有可讀文字，SR 只剩這個）', /胡桃木材/.test(shared.calls[0].label));
  check('T34 品名寫進 data-copy-name（事件委派靠它取值）', shared.calls[0].attrs['data-copy-name'] === '胡桃木材');
  check('T34 產出的是 .codex-icon-btn', /codex-icon-btn/.test(html));

  // CDN 沒載到（本機沒開 portal svc）也要有一顆能按的鈕，功能不因此消失
  const bare = mk(false).Q.copyBtn('梣木木材');
  check('T34 無共用元件時退回可按的文字鈕、仍帶 aria-label 與 data-copy-name',
    /<button/.test(bare) && /aria-label=/.test(bare) && /data-copy-name="梣木木材"/.test(bare));
  check('T34 退場版不得用 emoji 當圖示（B-027 要收掉的正是這個）', !/📋|🔗/.test(bare));

  // 素材列結構：連結與按鈕同層，不得互套
  check('T34 素材列不再把整列包成 <a>（<a> 內不得放 <button>）',
    /class="crafter-qt-mat"/.test(QSRC) && /crafter-qt-mat__link/.test(QSRC));
  check('T34 複製鈕的點擊不得冒泡到旁邊的連結（preventDefault）',
    /data-copy-name/.test(QSRC) && /preventDefault\(\)/.test(QSRC));
  // 2026-08-15（DS-06）改為：分派（共用優先 → 本地退場）**只留在 copyText 一處**，
  // 各層一律走 deps.copyText。原本 app-quests 自己再判一次 FFXIVClipboard 是第二份同樣的邏輯。
  check('T34 複製走 deps.copyText（不在各層自己判一次 FFXIVClipboard）',
    /deps\.copyText\(/.test(QSRC) && !/FFXIVClipboard\s*&&/.test(QSRC));
  {
    const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    check('T34 共用優先的分派存在且只有一處（在 copyText 內）',
      /FFXIVClipboard\?\.copy|FFXIVClipboard\s*&&\s*|FFXIVClipboard\.copy/.test(APP));
    // 數**檔案數**不是出現次數：app.js 那支自然會提到兩次（一行註解 + 一行程式碼）。
    // 這條要擋的是「又有第二支檔案自己判一次共用實作在不在」。
    const files = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js'))
      .filter((f) => /FFXIVClipboard/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    check('T34 只有 app.js 提到 FFXIVClipboard（分派唯一出口，其餘層走 copyText）',
      files.length === 1 && files[0] === 'app.js', `實際：${files.join(', ') || '無'}`);
  }
}


// ===== T35：重複實作一律接共用（clipboard／移除鈕）=====
// Owner 2026-08-12：「有重複使用的請接共用」。portal 的 header.js 已有生態內最完整的
// clipboard（secure-context 判斷＋execCommand fallback＋toast）與功能性圖示組；本站原本各留一份。
// 這一組守的是「接了共用、但退場路徑仍在」——只接不留退場，本機沒開 portal svc 時複製會整個消失。
{
  // (a) app.js 的 copyText：有共用就用共用
  const calls = [];
  sandbox.window.FFXIVClipboard = { copy: (t, l) => { calls.push([t, l]); return true; } };
  try {
    T.copyText('/ac 製作 <wait.3>', '✓ 已複製巨集', '巨集');
    eq('T35 copyText 有共用實作時一律走 FFXIVClipboard.copy', calls.length, 1);
    eq('T35 文字原樣傳給共用實作', calls[0][0], '/ac 製作 <wait.3>');
    eq('T35 label 傳給共用實作當 toast 文字（不要兩套文案）', calls[0][1], '巨集');
  } finally {
    delete sandbox.window.FFXIVClipboard;
  }
  // 沒有共用時仍要能複製（退場路徑）——sandbox 無 navigator.clipboard → 走 execCommand 分支不得拋錯
  let threw = null;
  try { T.copyText('abc', '✓'); } catch (e) { threw = e; }
  check('T35 缺共用實作時退回本地 fallback，不得拋錯', threw === null);

  // (b) 純圖示鈕：清單移除鈕走共用 close 圖示，缺 CDN 退回字元鈕
  const LIST_SRC = fs.readFileSync(path.join(ROOT, 'crafting-list.js'), 'utf8');
  check('T35 清單移除鈕走共用 FFXIVIcons（close）', /FFXIVIcons(\?\.|\.)btnHTML\('close'/.test(LIST_SRC));
  check('T35 移除鈕保留 cl-del class（事件綁定靠它）', /class: 'cl-del'/.test(LIST_SRC));
  check('T35 缺 CDN 時仍有可按的移除鈕（退場路徑）', /aria-label="\$\{deps\.esc\(label\)\}">✕<\/button>/.test(LIST_SRC));

  // (c) 帶文字的動作鈕**刻意保留 emoji**：AGENTS「icon 節制」管的是身分/主操作，B-027 只收功能性小圖示。
  //     這條是負向哨兵——別哪天「順手統一」把它們也換成 SVG。
  check('T35 帶文字的動作鈕維持 emoji（📋 加入清單／📋 複製清單）',
    /📋 加入清單/.test(fs.readFileSync(path.join(ROOT, 'app-recipe.js'), 'utf8')) &&
    /📋 複製清單/.test(LIST_SRC));
}

// ===== T36：中性分組容器走共用 .codex-tint-panel--neutral（portal B-017d／B3 消費端遷移）=====
// 三個容器（.filter-group／.cfg-card／.cl-card）的幾何——8px 圓角／1px 中性邊／底色——
// 由 portal header.css 的 `.codex-tint-panel--neutral` 提供，底色以 `--panel-bg` 傳參。
// **守的是回退**：這種遷移最容易被「順手」還原成本地 background/border/border-radius，
// 而還原後畫面完全正常（值一樣），只是幾何又分岔成第二份事實源 ⇒ 日後 portal 調 8px 這裡不會跟上。
// padding 與外距**刻意留本地**（共用版的 8/12px 是給資訊盒用的），故不在此斷言。
{
  const HTML_SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const LIST2_SRC = fs.readFileSync(path.join(ROOT, 'crafting-list.js'), 'utf8');
  const NEUTRAL = 'codex-tint-panel codex-tint-panel--neutral';

  // (a) 四個容器都要掛上共用 class（cl-card 由 crafting-list.js 動態產出，兩張卡都要）
  check('T36 .filter-group 掛共用中性面板', HTML_SRC.includes(`${NEUTRAL} filter-group`));
  // .result-summary 是 2026-08-13 那輪漏掉的第四個（幾何與共用版逐項相同，B-027 補遷）
  check('T36 .result-summary 掛共用中性面板', HTML_SRC.includes(`${NEUTRAL} result-summary`));
  eq('T36 兩張 .cfg-card 都掛共用中性面板',
    (HTML_SRC.match(new RegExp(`${NEUTRAL} cfg-card`, 'g')) || []).length, 2);
  eq('T36 兩張 .cl-card 都掛共用中性面板',
    (LIST2_SRC.match(new RegExp(`${NEUTRAL} cl-card`, 'g')) || []).length, 2);

  // (b) 本地不得再宣告這三個屬性（遷移的意義就在這裡；宣告了＝幾何有兩份）
  const bodyOf = (sel) => {
    const m = CSS_SRC.match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`));
    return m ? m[1] : null;
  };
  // 消費端清單由 markup 反推（同 T49 的做法），不手維護：手寫清單曾漏掉唯一巢狀的 .consumables（健檢 R5 M20）
  const NEUTRAL_SELS = [...new Set([...(HTML_SRC + LIST2_SRC).matchAll(new RegExp(`${NEUTRAL} ([a-z-]+)`, 'g'))].map((m) => '.' + m[1]))];
  check(`T36 掃到的中性面板消費端 ≥5（實測 ${NEUTRAL_SELS.length}：${NEUTRAL_SELS.join(' ')}）`, NEUTRAL_SELS.length >= 5);
  for (const sel of NEUTRAL_SELS) {
    const body = bodyOf(sel);
    check(`T36 ${sel} 規則存在（padding 與外距仍留本地）`, body !== null);
    check(`T36 ${sel} 不再本地宣告 background（底色走 --panel-bg）`,
      body !== null && !/(^|;)\s*background\s*:/.test(body));
    check(`T36 ${sel} 不再本地宣告 border（描邊走共用）`,
      body !== null && !/(^|;)\s*border\s*:/.test(body));
    check(`T36 ${sel} 不再本地宣告 border-radius（圓角走共用）`,
      body !== null && !/border-radius\s*:/.test(body));
  }

  // (c) 需要非預設底色的兩個要傳 --panel-bg；.cl-card 用共用預設（--color-surface）故刻意不傳
  check('T36 .filter-group 以 --panel-bg 傳底色', /--panel-bg:\s*var\(--color-surface-hover\)/.test(bodyOf('.filter-group')));
  check('T36 .cfg-card 以 --panel-bg 傳底色', /--panel-bg:\s*var\(--color-bg-deep/.test(bodyOf('.cfg-card')));
  check('T36 .cl-card 不傳 --panel-bg（用共用預設 --color-surface）', !/--panel-bg/.test(bodyOf('.cl-card')));
  check('T36 .result-summary 以 --panel-bg 傳底色', /--panel-bg:\s*var\(--color-bg-deep/.test(bodyOf('.result-summary')));
  // .consumables 2026-08-15 也遷了（Owner 拍板把剩下的一起做）：圓角由 6px 統一成共用版的 8px，
  // 那是唯一的視覺變化。它用共用預設底色故不傳 --panel-bg。
  check('T36 .consumables 掛共用中性面板', HTML_SRC.includes(`${NEUTRAL} consumables`));
  check('T36 .consumables 不再本地宣告 background／border／border-radius',
    !/(^|;)\s*(background|border|border-radius)\s*:/.test(bodyOf('.consumables') || ''));
  // --panel-bg 會繼承：巢狀在 .cfg-card（傳 bg-deep）裡不顯式指定就會吃到父層的深色底，
  // 正好抵銷「展開後與卡片背景分開」的原意。遷移當下實測踩到過，這條釘住。
  check('T36 巢狀的 .consumables 必須顯式傳 --panel-bg（否則繼承父層 .cfg-card 的深色底）',
    /--panel-bg:\s*var\(--color-surface\)/.test(bodyOf('.consumables') || ''));
}

// ===== T44：職業任務交付物列的窄屏形狀（B-029）=====
// CSS 文字比對驗不了 layout（同 T26 的教訓），所以這裡只擋**已知會壞的那個形狀**：
// 單列 flex 裡右側 .crafter-qt-item__src 是 `flex: 0 0 auto`（不收縮），而品名是唯一能縮的
// ⇒ 窄屏時品名吸收全部不足。2026-08-15 實測：≤560px 開始截斷、**≤390px 全部 27 筆的品名寬度是 0**
// （玩家看到「圖 + ×1 + 複製鈕 + 徽章」而沒有品名）。修法＝窄屏讓它落到第二行、品名拿回整行。
// 真正的驗收是量測（同源 iframe 定寬 10 種寬度，截斷數全為 0），紀錄在 CHANGELOG；這條防的是被順手改回去。
{
  const srcRules = (CSS_SRC.match(/\.crafter-qt-item__src\s*\{[^}]*\}/g) || []).join('\n');
  check('T44 .crafter-qt-item__src 規則存在', srcRules.length > 0);
  check('T44 窄屏必須把右側動作群釋放成整行（否則品名會被壓成 0 寬）',
    /flex:\s*1\s+1\s+100%/.test(srcRules), srcRules);
  const media = CSS_SRC.match(/@media \(max-width: (\d+)px\)\s*\{[^@]*crafter-qt-item/);
  check('T44 窄屏規則掛在既有的 760px 斷點上（不另發明數字）', !!media && media[1] === '760',
    media ? media[1] : '找不到含 crafter-qt-item 的 @media');
  check('T44 窄屏要允許換行（flex-wrap: wrap）',
    /@media \(max-width: 760px\)[\s\S]{0,500}?crafter-qt-item\s*\{[^}]*flex-wrap:\s*wrap/.test(CSS_SRC));
}

// ===== T59：三個「內容井」共用同一份幾何（Owner 2026-08-19：看不清主次）=====
// 配方表本來就是深底＋accent 染框，製造清單那兩張卡卻直接把列鋪在 panel 上 ⇒ 內外不分。
// 抽成 `.crafter-well` 後最容易回流的錯是「在本地再寫一次 background/border」——
// 值一樣時**畫面完全看不出差別**，但事實源就分岔了（同 .codex-tint-panel--neutral 的既有教訓）。
{
  const CSS = readAllCss();
  const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const CL = fs.readFileSync(path.join(ROOT, 'crafting-list.js'), 'utf8');
  const well = (CSS.match(/\.crafter-well \{[^}]*\}/) || [''])[0];
  check('T59 .crafter-well 定義了深底＋染框＋圓角', /background:[^;]*--color-bg/.test(well)
    && /border:[^;]*--accent/.test(well) && /border-radius/.test(well), well);
  check('T59 配方表消費共用井（index.html）', /id="recipe-table"[^>]*crafter-well/.test(HTML));
  check('T59 配方清單與素材格都消費共用井（crafting-list.js）',
    /cl-rows crafter-well/.test(CL) && /cl-mats crafter-well/.test(CL));
  // 本地不得再宣告同樣三個屬性（padding／grid 屬於版面特化，允許）
  const ruleOf = (sel) => { const k = CSS.indexOf(sel + ' {'); return k < 0 ? '' : CSS.slice(k, CSS.indexOf('}', k) + 1); };
  for (const sel of ['.recipe-table', '.cl-rows', '.cl-mats']) {
    const rule = ruleOf(sel);
    check(`T59 ${sel} 不得再本地重寫 background／border／border-radius`,
      !!rule && !/background:|border:|border-radius:/.test(rule), rule);
  }
}

// ===== T50：三張表都消費共用 .codex-table（DS-01）=====
// 重點不是「少寫幾行 CSS」，是 .rt 原本自刻的 sticky 重現了 portal 已文件化並修掉的坑：
// `border-collapse: collapse` 下 th 的 border-bottom 由 table 畫、**不跟著 sticky 移動**
// ⇒ 捲動時列直接穿到表頭下方、沒有分隔線（2026-08-15 截圖實證）。
// `.codex-table--sticky` 用 border-collapse: separate 解掉它，消費端不必記得那三個坑。
{
  const marks = [
    ['app-browse.js', '.rt', /class="codex-table codex-table--fixed codex-table--sticky rt"/],
    ['app-render.js', '.wt-table', /class="codex-table wt-table"/],
    ['app-gear.js', '.gear-table', /class="codex-table codex-table--fixed gear-table"/],
  ];
  for (const [f, sel, re] of marks) {
    check(`T50 ${sel} 掛共用 .codex-table`, re.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  }
  // 本地不得再宣告共用版已提供的基底（width / border-collapse）——那是第二份事實源
  for (const sel of ['.rt', '.wt-table', '.gear-table']) {
    const m = CSS_SRC.match(new RegExp('[.]' + sel.slice(1) + '[ ]*[{]([^}]*)[}]'));
    check(`T50 ${sel} 本地不再宣告 width／border-collapse／table-layout（走共用與變體）`,
      // `min-width` 不算重複宣告：共用版沒有它，那是 .gear-table 窄螢幕內部橫捲的特化
      !!m && !/(^|;|\s)(width|border-collapse|table-layout)\s*:/.test(m[1]), m ? m[1].trim().slice(0, 90) : '(無規則)');
  }
  // .rt 的 sticky 必須來自共用變體，本地不得再自刻 position: sticky
  const rtThead = (CSS_SRC.match(/\.rt thead th\s*\{[^}]*\}/) || [''])[0];
  check('T50 .rt 表頭 sticky 走共用 --sticky 變體（本地不再自刻 position: sticky）',
    !/position:\s*sticky/.test(rtThead), rtThead.slice(0, 90));
}

// ===== T55：配方詳情標題列不得被動作鈕壓垮（Owner 2026-08-16 回報）=====
// 與 T44（交付物列）同一個形狀：一列 flex 裡動作群是 `flex: 0 1 auto`、品名欄是唯一能縮的東西，
// 而 `min-width: 0` 讓它可以縮到 0 ⇒ 製作鏈把「← 回『長配方名』」加成第 4 顆鈕之後，
// 品名被壓成一個字寬、直排，三個數值各自折行。實測（欄寬 618px，配方＝卡扎納爾錠）：
//   min-width:0 → .ri-name 寬 27px、.ri-head 高 248px
//   有下限     → .ri-name 寬 553px、.ri-head 高 104px（動作群整條換到下一行）
// 真正的驗收是量測（同源 iframe 1400→320px 十種寬度：零水平溢出、品名寬 276–590px），紀錄在 CHANGELOG；
// 這條防的是被順手改回 `min-width: 0`。**CSS 文字比對驗不了 layout**（同 T26／T44 的教訓）。
{
  const main = (CSS_SRC.match(/^\.ri-main\s*\{[\s\S]*?\}/m) || [''])[0];
  check('T55 .ri-main 規則存在', main.length > 0);
  check('T55 品名欄不得可縮到 0（min-width: 0 正是壓垮它的那一行）',
    !/min-width:\s*0\s*[;}]/.test(main), main);
  check('T55 品名欄要有收縮下限（min-width 帶實際長度）',
    /min-width:\s*min\(\s*\d+px/.test(main) || /min-width:\s*\d+px/.test(main), main);
  check('T55 動作群仍可整條換行（放不下時退回獨佔一列，而不是繼續擠品名）',
    /\.ri-head\s*\{[^}]*flex-wrap:\s*wrap/.test(CSS_SRC));
}

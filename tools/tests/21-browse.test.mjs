// tools/tests/21-browse.test.mjs — 配方瀏覽層 app-browse.js：篩選／分頁／表格幾何（T11）
// 由 tools/test-formulas.mjs 依檔名序 import 跑；斷言計數器與共用 fixture 都在 ./_harness.mjs。
import { fs, vm, path, ROOT, CSS_SRC, check, eq } from './_harness.mjs';

// ===== T11：app-browse.js 配方瀏覽層（對抗審 codex/grok：拆分後瀏覽層需真測，非靠 app.js 公式閘背書）=====
{
  const AB_SRC = fs.readFileSync(path.join(ROOT, 'app-browse.js'), 'utf8');
  const els = {};
  const abEl = () => ({ value: '', textContent: '', innerHTML: '', dataset: {},
    classList: { toggle() {}, add() {}, remove() {} },
    querySelector() { return null; }, querySelectorAll() { return []; },
    appendChild() {}, addEventListener() {}, onclick: null, onkeydown: null });
  const $ = (id) => els[id] || (els[id] = abEl());
  const ab = { console, document: { createElement: abEl, getElementById: $ } };
  ab.globalThis = ab;
  vm.createContext(ab);
  vm.runInContext(AB_SRC, ab, { filename: 'app-browse.js' });
  const CB = ab.CraftBrowse;
  const DOH = ['木工', '鍛造', '甲冑', '金工', '皮革', '裁縫', '鍊金', '烹調'];
  const DEP = { $, esc: (s) => String(s), iconUrl: () => '', DOH, JOB_ICON: {},
    NAME_COLLATOR: new Intl.Collator('zh-Hant'), getRINDEX: () => rindex, getSelected: () => null,
    selectRecipe: () => {}, toast: () => {} };

  // init 缺依賴 assert（grok F5）
  let threwMiss = false;
  try { CB.init({ $ }); } catch (e) { threwMiss = /缺依賴/.test(e.message); }
  check('T11 init 缺依賴 → 早炸（注入契約不變量）', threwMiss);

  let rindex = [
    { id: 1, name: '青銅錠', nameSc: '青铜锭', job: '鍛造', rlv: 10, level: 5, icon: null, category: '金屬', diff: 1200, qual: 3400, patch: '7.31' },
    { id: 2, name: '橡木材', nameSc: '橡木材', job: '木工', rlv: 20, level: 15, icon: null, category: '木材', diff: 300, qual: 900, expert: true, patch: '2.0' },
    { id: 3, name: '亞麻布', nameSc: '亚麻布', job: '裁縫', rlv: 30, level: 25, icon: null, category: '布料', diff: null, qual: null, patch: '7.05' },
  ];
  CB.init(DEP);

  CB.renderChips();
  eq('T11 renderChips → 9 顆職業按鈕（全部+8 DoH）', ($('job-chips').innerHTML.match(/job-btn/g) || []).length, 9);

  const rowCount = () => ($('recipe-table').innerHTML.match(/class="rt-row/g) || []).length;
  $('recipe-search').value = ''; $('level-filter').value = ''; $('rlv-filter').value = '';
  CB.renderTable();
  eq('T11 renderTable 無篩選 → 3 列', rowCount(), 3);
  eq('T11 recipe-count 顯示總數', $('recipe-count').textContent, '3 個配方');
  eq('T11 種類獨立欄渲染（rt-cat）', /rt-cat[^>]*>金屬</.test($('recipe-table').innerHTML), true);

  // 2026-08-19（Owner：名稱跟類別擠在一起、空間沒用滿）：種類由名稱副行拉成獨立欄，並補難度／品質。
  // 欄數是 CSS 那組 `nth-child` 百分比寬的隱性契約 —— 只加 <td> 不改 CSS 的話最後一欄會被擠掉，
  // 而畫面只是「有點怪」不會報錯 ⇒ 這裡把兩邊一起釘住。
  {
    const html = $('recipe-table').innerHTML;
    eq('T11 表頭 9 欄（名稱/種類/職業/Lv/配方等級/難度/品質/版本/加入）', (html.match(/<th[ >]/g) || []).length, 9);   // [ >] 才不會把 <thead 也算進去
    const cssCols = (CSS_SRC.match(/\.rt th:nth-child\(\d\)/g) || []).length;
    eq('T11 CSS 的欄寬宣告數 == 表頭欄數（漏一欄＝版面靜默走鐘）', cssCols, 9);
    check('T11 難度／品質欄有值（來自 RINDEX 的 recipeMaxes 快照）', /<td data-label="難度">1200<\/td><td data-label="品質">3400<\/td>/.test(html), html.slice(0, 400));
    check('T11 名稱不再有副行 wrapper（rt-nmwrap 已退場）', !/rt-nmwrap/.test(html) && !/rt-nmwrap/.test(CSS_SRC));
    // 缺 rlv 列時 app.js 給 null ⇒ 顯「—」而不是假的 0（0 難度會被讀成「這配方超簡單」）
    check('T11 難度／品質缺值 → 顯「—」不顯 0', /<td data-label="難度">—<\/td><td data-label="品質">—<\/td>/.test(html), html.slice(0, 400));
    // 四個純數字欄的 data-label 是**手機堆疊版的欄名來源**（`.rt td[data-label]::before` 讀它）。
    // 拿掉它們桌面完全看不出來（桌面有 thead），手機才會退化成「90 / 690 / 5280 / 15200」四個無名數字
    // ⇒ 兩邊互鎖：markup 有 data-label、CSS 有 attr(data-label)，缺一即紅（2026-08-26 行動適配）。
    check('T11 數字欄帶 data-label ＋ CSS 有對應的 attr() 消費端（手機堆疊版欄名）',
      (() => { const n = (html.match(/<td[^>]*data-label="/g) || []).length;   // 屬性順序不限（.rt-patch 是 class 在前）
               // 五個非自描述欄（Lv／配方等級／難度／品質／版本）都要帶 label：版本欄曾漏掉，堆疊後是裸數字「2.35」（健檢 R5 M20）
               return n > 0 && n % 5 === 0 && /content:\s*attr\(data-label\)/.test(CSS_SRC); })(), html.slice(0, 400));
    // 加入鈕改內嵌向量（全形「＋」的重量／垂直位置隨系統字型跑）
    check('T11 加入鈕是向量不是字元', /class="[^"]*rt-add[^"]*"[^>]*>\s*<svg/.test(html) && !/>＋</.test(html));
    check('T11 加入鈕仍是 ghost 圖示鈕（列級豁免：不參賽 primary）',
      /rt-add/.test(html) && !/codex-btn--primary[^>]*rt-add|rt-add[^>]*codex-btn--primary/.test(html));
    check('T11 SVG 有本地尺寸（.codex-btn--icon 不管內嵌 svg 大小）', /\.rt-add > svg[^}]*width:/.test(CSS_SRC));
    check('T11 index.html 有 #expert-filter（app-browse 直接讀它，缺了 renderTable 當場炸）',
      /id="expert-filter"/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
    // 實測踩過：控件加進 index.html、篩選邏輯也寫了，但**沒接 change** ⇒ 畫面上有一顆按了沒反應的下拉，
    // 且 console 全乾淨（T11 的 renderTable 直呼測試也照樣綠）。接線只有原始碼斷言擋得住。
    check('T11 #expert-filter 有接 change → renderTable（有控件沒接線＝按了沒反應）',
      /\$\('expert-filter'\)\.addEventListener\('change'/.test(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8')));
  }

  // 高難度（expert）＝**配方屬性**不是名字（Owner 2026-08-19 特別澄清）：遊戲內製作狀態隨機，
  // 靜態巨集只能當參考 ⇒ 想練的人要找得到、想避的人要濾得掉，而它在列表上原本完全沒有痕跡。
  {
    check('T11 高難度配方掛徽章', /rt-expert[^>]*>高難度</.test($('recipe-table').innerHTML));
    eq('T11 沒掛徽章的列不會被誤標', ($('recipe-table').innerHTML.match(/rt-expert/g) || []).length, 1);
    $('expert-filter').value = 'only'; CB.renderTable();
    eq('T11 只看高難度 → 1 列', rowCount(), 1);
    check('T11 只看高難度 → 留下的是那筆 expert', /橡木材/.test($('recipe-table').innerHTML));
    $('expert-filter').value = 'hide'; CB.renderTable();
    eq('T11 排除高難度 → 2 列', rowCount(), 2);
    check('T11 排除高難度 → 那筆 expert 不在', !/橡木材/.test($('recipe-table').innerHTML));
    // 只設高難度篩選而 0 命中時要說「無符合配方」，不是一片空白（同 rlvVal 那條的既有教訓）
    $('expert-filter').value = 'only';
    rindex = [{ id: 1, name: '青銅錠', job: '鍛造', rlv: 10, level: 5, icon: null, category: '金屬' }];
    CB.renderTable();
    eq('T11 僅高難度篩選 0 命中 → 「無符合配方」', $('recipe-count').textContent, '無符合配方');
    $('expert-filter').value = '';
    rindex = [
      { id: 1, name: '青銅錠', nameSc: '青铜锭', job: '鍛造', rlv: 10, level: 5, icon: null, category: '金屬', diff: 1200, qual: 3400, patch: '7.31' },
      { id: 2, name: '橡木材', nameSc: '橡木材', job: '木工', rlv: 20, level: 15, icon: null, category: '木材', diff: 300, qual: 900, expert: true, patch: '2.0' },
      { id: 3, name: '亞麻布', nameSc: '亚麻布', job: '裁縫', rlv: 30, level: 25, icon: null, category: '布料', diff: null, qual: null, patch: '7.05' },
    ];
    CB.renderTable();
    // 篩選指紋漏掉新控件的話：切篩選不回第 1 頁，玩家會停在不存在的頁而看到空表
    check('T11 高難度篩選有進 filterKey（切換會回第 1 頁）', /expert-filter/.test(AB_SRC.split('function filterKey')[1].slice(0, 300)));
  }

  // ===== 版本篩選（Owner 2026-08-19：繁中服開服即 7.0 ⇒ 7.0 以前併一項、之後按實際版號分）=====
  // 版號比較是這裡唯一會靜默出錯的地方：拆成 (major, minor) 整數比會把 7.15 排到 7.5 後面
  // （minor 15 > 5），而下拉看起來仍然「有排序」⇒ 只有逐項對答案才看得出來。
  {
    rindex = [
      { id: 1, name: 'A', job: '鍛造', rlv: 10, level: 5, category: '', patch: '7.5' },
      { id: 2, name: 'B', job: '鍛造', rlv: 10, level: 5, category: '', patch: '7.15' },
      { id: 3, name: 'C', job: '鍛造', rlv: 10, level: 5, category: '', patch: '7.51' },
      { id: 4, name: 'D', job: '鍛造', rlv: 10, level: 5, category: '', patch: '7.0' },
      { id: 5, name: 'E', job: '鍛造', rlv: 10, level: 5, category: '', patch: '2.0' },
      { id: 6, name: 'F', job: '鍛造', rlv: 10, level: 5, category: '', patch: '6.55' },
    ];
    $('recipe-search').value = ''; $('expert-filter').value = ''; $('patch-filter').value = '';
    CB.renderPatchOptions();
    const opts = [...$('patch-filter').innerHTML.matchAll(/value="([^"]*)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]);
    eq('T11 版本選項＝全部 ＋ 4 個 ≥7.0 版號 ＋ 7.0 以前', opts.length, 6);
    eq('T11 版號由新到舊（7.51 > 7.5 > 7.15 > 7.0；整數比會把 7.15 排錯）',
      opts.slice(1, 5).map((o) => o[0]).join(','), '7.51,7.5,7.15,7.0');
    eq('T11「7.0 以前」殿後並帶筆數（2.0 ＋ 6.55 ＝ 2）', opts[5].join('|'), 'pre7|7.0 以前（2）');
    check('T11 版本選項帶該版筆數', /7\.51（1）/.test($('patch-filter').innerHTML));
    $('patch-filter').value = '7.5'; CB.renderTable();
    eq('T11 選 7.5 → 只有 7.5（不含 7.51）', rowCount(), 1);
    check('T11 選 7.5 命中的是 A', />A</.test($('recipe-table').innerHTML));
    $('patch-filter').value = 'pre7'; CB.renderTable();
    eq('T11 選「7.0 以前」→ 2 列（7.0 本身不算在內）', rowCount(), 2);
    $('patch-filter').value = '7.99'; CB.renderTable();
    eq('T11 僅版本篩選 0 命中 → 「無符合配方」', $('recipe-count').textContent, '無符合配方');
    $('patch-filter').value = ''; CB.renderTable();
    eq('T11 清掉版本篩選 → 6 列', rowCount(), 6);
    check('T11 版本欄有渲染', /rt-patch[^>]*>7\.5</.test($('recipe-table').innerHTML));
    check('T11 版本篩選有進 filterKey（切換會回第 1 頁）',
      /patch-filter/.test(AB_SRC.split('function filterKey')[1].slice(0, 400)));
    check('T11 #patch-filter 有接 change（有控件沒接線＝按了沒反應）',
      /\$\('patch-filter'\)\.addEventListener\('change'/.test(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8')));
    // 重繪選項不得把使用者選的版本吃掉（loadData 會重新 render）
    $('patch-filter').value = '7.0'; CB.renderPatchOptions();
    eq('T11 重繪版本選項保留當前選擇', $('patch-filter').value, '7.0');
    $('patch-filter').value = '';
    rindex = [
      { id: 1, name: '青銅錠', nameSc: '青铜锭', job: '鍛造', rlv: 10, level: 5, icon: null, category: '金屬', diff: 1200, qual: 3400, patch: '7.31' },
      { id: 2, name: '橡木材', nameSc: '橡木材', job: '木工', rlv: 20, level: 15, icon: null, category: '木材', diff: 300, qual: 900, expert: true, patch: '2.0' },
      { id: 3, name: '亞麻布', nameSc: '亚麻布', job: '裁縫', rlv: 30, level: 25, icon: null, category: '布料', diff: null, qual: null, patch: '7.05' },
    ];
    CB.renderTable();
  }

  $('recipe-search').value = '青銅'; CB.renderTable();
  eq('T11 搜尋「青銅」→ 1 列', rowCount(), 1);

  // 簡中搜尋：很多人記的是陸服名或直接從簡中攻略貼過來，打簡體查不到會以為工具沒這個配方。
  // **只比對、不顯示**——顯示一律繁中（繁中服至上）。
  $('recipe-search').value = '青铜'; CB.renderTable();
  eq('T11 搜尋簡中「青铜」→ 1 列（簡繁都查得到）', rowCount(), 1);
  eq('T11 簡中命中仍顯示繁中名', /青銅錠/.test($('recipe-table').innerHTML), true);
  $('recipe-search').value = '亚麻'; CB.renderTable();
  eq('T11 搜尋簡中「亚麻」→ 1 列', rowCount(), 1);
  // nameSc 缺失（舊資料／查無簡中名）不得炸掉搜尋
  rindex = [{ id: 9, name: '無簡名物', job: '鍛造', rlv: 10, level: 5, icon: null, category: '金屬' }];
  $('recipe-search').value = '無簡名'; CB.renderTable();
  eq('T11 nameSc 缺失時搜尋仍可用', rowCount(), 1);
  rindex = [
    { id: 1, name: '青銅錠', nameSc: '青铜锭', job: '鍛造', rlv: 10, level: 5, icon: null, category: '金屬' },
    { id: 2, name: '橡木材', nameSc: '橡木材', job: '木工', rlv: 20, level: 15, icon: null, category: '木材' },
    { id: 3, name: '亞麻布', nameSc: '亚麻布', job: '裁縫', rlv: 30, level: 25, icon: null, category: '布料' },
  ];

  // rlvVal 空狀態修正（codex/grok：僅 rlv 篩選 0 命中 → 「無符合配方」非空白）
  $('recipe-search').value = ''; $('rlv-filter').value = '999'; CB.renderTable();
  eq('T11 僅 rlv 篩選 0 命中 → 「無符合配方」', $('recipe-count').textContent, '無符合配方');

  // 分頁（PER_PAGE=60，取代舊的 CAP 120 硬截斷）：130 筆 → 3 頁
  $('rlv-filter').value = '';
  rindex = Array.from({ length: 130 }, (_, i) => ({ id: i + 1, name: '物' + i, job: '鍛造', rlv: 10, level: 5, icon: null, category: '金屬' }));
  CB.renderTable();
  eq('T11 130 筆 → 第 1 頁 60 列', rowCount(), 60);
  eq('T11 recipe-count 顯示總數與頁碼', $('recipe-count').textContent, '130 個配方（第 1 / 3 頁）');
  check('T11 翻頁器渲染上/下一頁 + 頁數資訊',
    /data-pg="prev"/.test($('recipe-pager').innerHTML) && /data-pg="next"/.test($('recipe-pager').innerHTML)
    && /共 130 個配方/.test($('recipe-pager').innerHTML));
  check('T11 第 1 頁「上一頁」停用（不得可按）', /data-pg="prev" disabled/.test($('recipe-pager').innerHTML));

  // 翻到最後一頁：130 = 60+60+10
  const nextBtn = { dataset: { pg: 'next' }, disabled: false, closest: () => nextBtn };
  const fire = () => $('recipe-pager').onclick({ target: nextBtn });
  fire(); eq('T11 翻到第 2 頁 → 仍 60 列', rowCount(), 60);
  fire(); eq('T11 翻到第 3 頁（末頁）→ 餘 10 列', rowCount(), 10);
  check('T11 末頁「下一頁」停用', /data-pg="next" disabled/.test($('recipe-pager').innerHTML));

  // 篩選變更必須回第 1 頁（否則使用者搜完停在不存在的第 3 頁 → 空白表）
  $('recipe-search').value = '物'; CB.renderTable();
  eq('T11 篩選變更 → 回第 1 頁（結果仍跨 3 頁）', $('recipe-count').textContent, '130 個配方（第 1 / 3 頁）');
  $('recipe-search').value = ''; CB.renderTable();
  eq('T11 清空篩選 → 回第 1 頁 60 列', rowCount(), 60);

  // 單頁時翻頁器收起（不留空條、不誤導還有別頁）
  rindex = rindex.slice(0, 10); CB.renderTable();
  eq('T11 只有一頁 → 翻頁器清空', $('recipe-pager').innerHTML, '');
  eq('T11 只有一頁 → recipe-count 不顯示頁碼', $('recipe-count').textContent, '10 個配方');

  // ===== 就地取消（Owner 2026-08-19：「不要一定得到清單才能取消，＋右邊多一個取消不就好了」）=====
  // markListState 是 in-place 更新（不重建表）⇒ − 鈕必須**先 render 再用 hidden 收合**，
  // 不能「不在清單就不 render」——那會在每次清單變動時重建 DOM、把焦點吃掉。
  {
    rindex = [{ id: 1, name: '青銅錠', job: '鍛造', rlv: 10, level: 5, icon: null, category: '金屬', diff: 1, qual: 2 }];
    $('recipe-search').value = ''; $('expert-filter').value = '';
    // markListState 要能真的抓到列與鈕 → 這裡給一個會回傳假 tr/鈕的表格節點
    const delBtn = { hidden: false, dataset: { id: '1' } };
    const badgeLine = { querySelector: () => null, appendChild() {} };
    const tr = { dataset: { id: '1' }, classList: { toggle() {} },
      querySelector: (sel) => (sel === '.rt-del' ? delBtn : badgeLine) };
    const tbl = $('recipe-table');
    tbl.querySelectorAll = (sel) => (sel === '.rt-row' ? [tr] : []);
    CB.renderTable();
    const html = tbl.innerHTML;
    check('T11 每列都渲染 − 鈕（預設 hidden，不是不 render）', /rt-del[^>]*hidden|hidden[^>]*rt-del/.test(html), html.slice(0, 600));
    check('T11 − 鈕不是 danger（列級豁免：一表 60 顆紅 ✕＝紅色的狼來了）', !/rt-del[^>]*--danger|--danger[^>]*rt-del/.test(html));
    ab.CraftList = { count: () => 0, removeOne() {}, add() {} };
    CB.markListState();
    eq('T11 不在清單 → − 收起（不留一顆按了沒反應的鈕）', delBtn.hidden, true);
    ab.CraftList.count = () => 2;
    CB.markListState();
    eq('T11 已在清單 → − 出現', delBtn.hidden, false);
    // Owner 2026-08-19：− 出現／消失都不得推動 ＋。槽位固定＝兩欄定寬 grid（flex 會在 − 收掉時重新置中，
    // ＋ 往左跳一格 ⇒ 剛按完「加入」的游標正好停在 − 上，下一下就誤點成移除）。
    check('T11 ＋− 是固定兩格槽位（− 收掉時 ＋ 不位移）',
      /\.rt-act \.rt-actwrap\s*\{[^}]*inline-grid[^}]*grid-template-columns:\s*repeat\(2,/.test(CSS_SRC), 'CSS 未定義定寬兩欄槽位');
    // 點 − 要打到 removeOne（不是 add，也不是選配方進詳情）
    let removed = null, added = null, selected2 = null;
    ab.CraftList = { count: () => 1, removeOne: (id) => { removed = id; }, add: (id) => { added = id; } };
    const target = { closest: (sel) => (sel === '.rt-del' ? { dataset: { id: '1' } } : null) };
    DEP.selectRecipe = (id) => { selected2 = id; };
    CB.init(DEP); CB.renderTable();
    tbl.onclick({ target });
    eq('T11 點 − → removeOne(該配方)', removed, 1);
    check('T11 點 − 不會順便 add，也不會進配方詳情', added === null && selected2 === null);
    delete ab.CraftList;
  }

  // ===== 表格高度＝當前螢幕還剩多少（Owner 2026-08-19：只捲表格、不要連外層一起捲）=====
  // 實測踩過的坑：拿 `document.scrollHeight` 反推「表格下方佔多高」會**越縮越小**——portal 的 body
  // 公式是 `min-height:100vh` ＋ `padding-top:64px`，文件高度恆為 100vh+64、與內容無關 ⇒ 每量一次
  // 就多扣一截（實測 489→419→349）。症狀是「視窗縮放幾次後表格只剩一條縫」，不會有任何錯誤訊息。
  {
    check('T11 fitHeight 不得用 document.scrollHeight 反推（body 公式使文件高度與內容無關）',
      !/scrollHeight/.test(AB_SRC.split('function fitHeight')[1].split('function renderTable')[0]));
    const rect = { top: 100, height: 400, bottom: 500 };
    const host = { getBoundingClientRect: () => ({ bottom: 600 }) };
    const el = $('recipe-table');
    el.style = {}; el.offsetParent = {}; el.getBoundingClientRect = () => rect;
    el.closest = (sel) => (sel === 'main' ? host : null);
    el.querySelector = () => null;
    ab.window = { innerHeight: 800, addEventListener() {} };
    CB.fitHeight();
    eq('T11 表格高度＝視窗高 − 上緣 − 下方佔用 − 呼吸空隙', el.style.maxHeight, '592px');
    CB.fitHeight(); CB.fitHeight();
    eq('T11 連呼三次高度不變（冪等，不會越縮越小）', el.style.maxHeight, '592px');
    ab.window.innerHeight = 400;   // 極矮視窗：算出來會是負的 → 收在下限，不得把表格壓成一條縫
    CB.fitHeight();
    eq('T11 極矮視窗 → 收在最小高度（約 6 列）', el.style.maxHeight, '240px');
    delete el.getBoundingClientRect; delete el.offsetParent; delete el.closest; el.querySelector = () => null;
  }

  // markListState 無 CraftList → 守衛不拋錯（grok F4/F2）
  let threwMLS = false;
  try { CB.markListState(); } catch (e) { threwMLS = true; }
  check('T11 markListState 無 CraftList → 守衛早退不拋錯', !threwMLS);
}

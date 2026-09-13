// tools/tests/60-ui-sentinels.test.mjs — UI runtime sentinels（T34〜T35）
// 由 tools/test-formulas.mjs 依檔名序 import 跑；斷言計數器與共用 fixture 都在 ./_harness.mjs。
import { fs, vm, path, ROOT, sandbox, T, check, eq } from './_harness.mjs';


// ===== T34：複製品名鈕必須走 portal 共用元件（不自刻 emoji 鈕）=====
// 由來：複製鈕在 5 個 repo 各刻一份、glyph 四種不一致（📋/⧉/🔗），B-027 已把它升格成
// portal 的 `FFXIVIcons.btnHTML('copy', …)` ＋ `FFXIVClipboard.copy`。本站接上去時很容易
// 「順手寫個 📋 button」——那就白升格了，且 emoji 當功能性圖示會字型相依、拿不到 currentColor。
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
}







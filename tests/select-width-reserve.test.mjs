/* select-width-reserve.test.mjs — 「選項由 JS 填的下拉，盒子必須先定案」。
 *
 * 2026-08-25 由來（monorepo CLS 密集掃 800px 0.1973 POOR）：
 * `#patch-filter` 的 <option> 由 `app-browse.renderPatchOptions()` 依資料生成 ⇒ 首次繪製時
 * 它是空的，只有 `.filter-row .codex-select` 的 `min-width:130px` 地板；填完實測 **130 → 174px**。
 *
 * **min-width 是地板，不是實際寬度**：多出的 44px 把 `#expert-filter` 擠到第二列，
 * `.filter-row` 1 列變 2 列，`#recipe-table` 整塊下推 46px ⇒ 單筆 layout shift 0.1973
 * （`.grow` 順帶吃掉多出來的空間，所以等級／配方等級也跟著平移，看起來像整排在跳）。
 *
 * 零回饋訊號：CSS 語法正確、無警告、653 條 formula 測試全綠、畫面只是「載入時抖一下」。
 * 而且失效頻帶只有一格寬（840 ✓／800 ✗／760 ✓）—— 挑「常見寬度」取樣的探測必然跳過。
 *
 * ⚠️ 為什麼守在本 repo 而不是跨 repo 靜態哨兵（2026-08-26 試過並放棄）：判斷「哪條規則真的
 * 套用在這個 select 上」需要 DOM 祖先資訊；沒有 DOM 的版本會把別處的
 * `.someParent .codex-select { width: … }` 當成本元素有 width ⇒ 連原始 bug 都抓不到。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(ROOT, "index.html"), "utf8");
// 工具樣式已拆成 `styles/NN-*.css` 序載（B-034，2026-09-06）：依檔名序掃描串接（== index.html 的 <link> 順序
// == 層疊順序），**不手維護清單**——漏一支的症狀是「該檔的規則被刪掉仍全綠」。
// 先剝註解：本檔與 styles/ 的說明都寫著這些選擇器名，不剝的話規則被刪掉仍會全綠。
const cssDir = join(ROOT, "styles");
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).sort()
  .map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

/** 取選擇器**最後一個 compound** 命中 `#id` 的所有規則 body（祖先部分不影響命中）。 */
function bodiesFor(id) {
  const out = [];
  for (const chunk of css.split("}")) {
    const i = chunk.indexOf("{");
    if (i < 0) continue;
    for (const sel of chunk.slice(0, i).split(",")) {
      const last = sel.trim().split(/[\s>+~]+/).filter(Boolean).pop() || "";
      if (last.split(/(?=[.#:])/).includes("#" + id)) out.push(chunk.slice(i + 1));
    }
  }
  return out;
}
const decl = (body, prop) => {
  for (const part of body.split(";")) {
    const i = part.indexOf(":");
    if (i > 0 && part.slice(0, i).trim() === prop) return part.slice(i + 1).trim();
  }
  return null;
};

const tag = /<select\b[^>]*\bid="patch-filter"[^>]*>([\s\S]*?)<\/select>/.exec(html);
assert.ok(tag, "index.html 找不到 #patch-filter ⇒ 反推失效，本檔會空綠");
assert.equal((tag[1].match(/<option\b/g) || []).length, 0,
  "#patch-filter 現在在 HTML 裡有 option 了 ⇒ 前提改變，請重新確認本檔還守不守得住原本的東西");

const bodies = bodiesFor("patch-filter");
assert.ok(bodies.length, "#patch-filter 的專屬規則不見了 ⇒ 800px 的 0.1973 位移會回來");
const widths = bodies.map((b) => decl(b, "width")).filter(Boolean);
assert.ok(widths.length,
  "版本篩選沒有明確 width ⇒ 只靠 .filter-row .codex-select 的 min-width 地板，"
  + "而地板擋不住比它長的版號清單（實測 130→174px），800px 會回到 0.20 的位移。");

console.log("  ✓ #patch-filter 盒子在首次繪製就定案（width " + widths[0] + "）");

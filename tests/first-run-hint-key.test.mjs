// tests/first-run-hint-key.test.mjs — 首屏提示的 localStorage key 兩份不得漂移（2026-08-23）
//
// 【由來】`#first-run-hint` 的顯隱只看 localStorage，是同步就能決定的事，但原本要等
//   `app.js`（`type=module` ⇒ defer）跑到 `updateHint()` 才決定 ⇒ **首次繪製之後**才長出
//   80px，把流程軸與整個求解面板往下推。實測載入期 CLS 1366/900/390px＝0.044/0.069/0.094
//   全部來自這一發，而畫面上只是「提示晚一點才出現」——零回饋訊號。
//   修法是在 index.html 的解析階段先判一次（早於首次繪製，也早於所有 app-*.js）。
//
// 【為什麼會有兩份 key】那支 inline script 跑的時候 `CraftGear.anyGear()` 還不能用
//   （它要等 app.js 注入 deps，而那正是要避開的時機）⇒ 只能自己讀 localStorage。
//   於是 key 字串在 `app-gear.js`（GEAR_KEY）與 `index.html`（inline）各有一份。
//
// 【漂移的症狀是靜默的】改了 GEAR_KEY 而沒改 inline：老使用者的資料讀不到 ⇒ inline 判定
//   「新使用者」把提示打開 ⇒ app.js 在 ~450ms 再把它關掉 ⇒ **位移回來了**，而且沒有任何
//   錯誤、畫面看起來也只是提示閃一下。所以要有這支。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const gearJs = stripJs(readFileSync(join(ROOT, 'app-gear.js'), 'utf8'));
const m = gearJs.match(/GEAR_KEY\s*=\s*['"]([^'"]+)['"]/);
assert.ok(m, 'app-gear.js 找不到 GEAR_KEY —— 常數改名了，inline 那份要跟著對齊');
const key = m[1];

// first-run-hint.js 也要剝註解再比對：註解裡剛好寫著同一個 key，
// 不剝的話「那一行被刪掉」也會通過（portal 2026-08-22 實踩過同型的假綠燈）。
const early = stripJs(readFileSync(join(ROOT, 'first-run-hint.js'), 'utf8'));

assert.ok(early.includes(`'${key}'`) || early.includes(`"${key}"`),
  `first-run-hint.js 沒有用 app-gear.js 的 GEAR_KEY（${key}）——`
  + '兩份漂移的症狀是靜默的：老使用者會被判成新使用者，提示先開後關，位移原封不動回來。');

assert.ok(/\.hidden\s*=\s*false/.test(early),
  'first-run-hint.js 必須真的把 #first-run-hint 打開（hidden = false）——只讀 localStorage 不動 DOM 等於沒修');

// 它必須是 parser-blocking 的外部 classic script 且掛在提示的正下方：
// 改成 defer／module／搬到 body 尾端，都會讓它跑在首次繪製之後 ⇒ 位移原樣回來而測試仍綠。
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const after = html.slice(html.indexOf('id="first-run-hint"'), html.indexOf('crafter-flow-wrap'));
const tag = (after.match(/<script[^>]*first-run-hint\.js[^>]*>/) || [''])[0];
assert.ok(tag, 'index.html 的 #first-run-hint 與流程軸之間找不到 first-run-hint.js 的 <script>');
assert.ok(!/(defer|async)/.test(tag) && !/type=["']module["']/.test(tag),
  `first-run-hint.js 必須是 parser-blocking 的 classic script（不得 defer／async／module）：${tag}`);

console.log(`✓ first-run-hint-key: first-run-hint.js 與 app-gear.js 共用同一個 key（${key}），且為 parser-blocking`);

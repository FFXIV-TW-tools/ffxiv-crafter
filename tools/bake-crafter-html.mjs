// 把 portal 正典產出的本站圖示與冷啟動流程烤進 HTML；--check 防靜態片段漂移。
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const js = fs.readFileSync(path.join(root, 'crafter-icons.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(js, sandbox);
const icons = sandbox.window.CrafterIcons;
const flow = { globalThis: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'app-flow.js'), 'utf8'), flow);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const htmlFile = path.join(root, 'index.html');
const old = fs.readFileSync(htmlFile, 'utf8');
let found = 0;
let html = old.replace(/(<!-- crafter-icon:([a-z-]+) -->)[\s\S]*?(<!-- \/crafter-icon -->)/g, (_, start, name, end) => {
  if (!icons[name]) throw new Error(`HTML 圖示缺正典鍵：${name}`);
  found++;
  return `${start}<svg class="${name === 'magnifying-glass' ? 'codex-search__icon' : 'codex-ico'}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">${icons[name]}</svg>${end}`;
});
if (!found) throw new Error('index.html 沒有 crafter-icon 具名區');
const cold = flow.globalThis.CraftFlow.flowHtml({}, esc);
const between = (name, content) => {
  const re = new RegExp(`(<!-- crafter-${name}:start -->)[\\s\\S]*?(<!-- crafter-${name}:end -->)`);
  if (!re.test(html)) throw new Error(`缺少 crafter-${name} 具名區`);
  html = html.replace(re, (_, start, end) => start + content + end);
};
between('flow-steps', cold.steps);
between('flow-next', cold.next);
if (process.argv.includes('--check')) {
  if (html !== old) { console.error('index.html 靜態圖示或流程與生成物不一致；請重跑 node tools/bake-crafter-html.mjs'); process.exitCode = 1; }
  else console.log(`✓ index.html ${found} 顆靜態圖示與冷啟動流程一致`);
} else {
  fs.writeFileSync(htmlFile, html);
  console.log(`✓ 烤入 ${found} 顆靜態圖示與冷啟動流程`);
}

// 把 ffxiv-crafter 的 JS 公式（computeSettings 的 base_progress/base_quality、hqPercent）
// 與 ffxiv-crafting(Tnze) 產出的 golden 值逐格對帳。
// 用法：node compare-js.mjs <crafter repo 路徑> <golden.json>
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = process.argv[2];
const golden = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const dom = {};
const makeEl = () => ({
  checked: false, value: '', innerHTML: '', textContent: '', hidden: true, disabled: false,
  max: '', min: '', placeholder: '', dataset: {}, style: {},
  classList: { toggle() {}, add() {}, remove() {} },
  setAttribute() {}, getAttribute() { return null; },
  addEventListener() {}, removeEventListener() {},
  querySelectorAll() { return []; }, querySelector() { return null; },
  appendChild() {}, removeChild() {}, insertAdjacentHTML() {},
  focus() {}, scrollIntoView() {}, select() {}, onclick: null, onkeydown: null,
});
const getEl = (id) => dom[id] || (dom[id] = makeEl());
const sandbox = {
  console,
  document: { getElementById: getEl, querySelector: () => null, querySelectorAll: () => [], createElement: makeEl, body: makeEl() },
  location: { hostname: 'localhost', search: '' },
  window: {},
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  Worker: function () { this.postMessage = () => {}; this.terminate = () => {}; },
  fetch: () => Promise.reject(new Error('no network')),
  setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['app-gear.js', 'app-recipe.js', 'app-render.js']) vm.runInContext(read(f), sandbox, { filename: f });
vm.runInContext(read('app.js') + '\n;globalThis.__t={computeSettings,hqPercent:globalThis.CraftRender.hqPercent};', sandbox, { filename: 'app.js' });
const T = sandbox.__t;

// computeSettings 讀的 DOM 輸入固定成「預設、無食藥、無專家之證」
getEl('specialist').checked = false;
getEl('solve-mode').value = 'quality';
getEl('target-quality').value = '';
getEl('opt-manip').checked = true;
getEl('opt-heart').checked = false;
getEl('opt-qi').checked = false;
getEl('opt-backload').checked = false;
getEl('opt-adv').checked = false;

let bad = 0, n = 0;
const samples = [];
for (const g of golden.base) {
  const rlv = {
    id: g.rlv, class_job_level: g.cjl, difficulty: 4400, quality: 9000, durability: 70,
    progress_divider: g.pdiv, quality_divider: g.qdiv, progress_modifier: g.pmod, quality_modifier: g.qmod,
  };
  const recipe = { difficulty_factor: 100, quality_factor: 100, durability_factor: 100, is_expert: false };
  const s = T.computeSettings(recipe, rlv, { level: g.level, cms: g.cms, ctrl: g.ctrl, cp: 600 });
  n++;
  if (s.base_progress !== g.bp || s.base_quality !== g.bq) {
    bad++;
    if (samples.length < 8) samples.push(`rlv${g.rlv} lv${g.level} cms${g.cms} ctrl${g.ctrl}: JS bp=${s.base_progress} bq=${s.base_quality} / Tnze bp=${g.bp} bq=${g.bq}`);
  }
}
console.log(`base_progress / base_quality：比對 ${n} 組，分歧 ${bad}`);
samples.forEach((s) => console.log('   ' + s));

// hqPercent：Tnze 的表在某些百分比是「無值」（None → 這裡輸出 -1），比對時只驗有值的格
let hbad = 0, hn = 0, hgap = 0;
const hs = [];
for (let p = 0; p <= 100; p++) {
  const want = golden.hq[p];
  const got = T.hqPercent(p, 100); // 品質 p / 滿品質 100 → 百分比 p
  if (want === -1) { hgap++; continue; }
  hn++;
  if (got !== want) {
    hbad++;
    if (hs.length < 10) hs.push(`品質 ${p}%：JS=${got} / Tnze=${want}`);
  }
}
console.log(`hqPercent：Tnze 表有值的 ${hn} 格中分歧 ${hbad}（Tnze 表本身缺口 ${hgap} 格，未比對）`);
hs.forEach((s) => console.log('   ' + s));

process.exit(bad || hbad ? 1 : 0);

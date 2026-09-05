#!/usr/bin/env node
// tests/deploy-prepare.test.mjs — 部署腳本本機先跑一次（健檢 R5 B-037：「第一次執行永遠在 CF 上」）
//
// 【為什麼這支要存在】
// `deploy-prepare.sh` 是 CF Pages 的 build command，也是對外邊界的 allow-list 閘。它原本不在 canonicalTest、
// 也不在 pre-commit ⇒ 任何一次「加了新頂層檔卻忘了歸類」「腳本本身被改壞」都要等 push 之後在 CF 的 build log
// 才看得到——而那時 CF 會保留前一版，症狀只是「怎麼線上沒更新」。放進 canonicalTest 的 tests/ 讓 safe-push
// 之前就跑一次：頂層未分類項目、輸出缺 index.html、內部檔混入，都在本機紅。
// 不直接把 `sh deploy-prepare.sh` 接在 canonicalTest 尾巴：fleet-check 對 canonicalTest 有 /\bdeploy\b/ 防呆
// （canonicalTest 必須是測試命令），包成測試檔才是對的形狀。
// ⚠ 腳本寫固定的 `_site/`（gitignored）：本 repo 目前沒有排程／並行寫入者，若日後有，照 ranking 的做法改成
//   `_site.tmp.$$`＋鎖（AGENTS.md「部署面鐵則」④）。
//
// 跑法：node tests/deploy-prepare.test.mjs（或 node tests/run-all.mjs 自動納入）
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const ok = (c, m, extra) => { console.log((c ? '✓ ' : '✗ ') + m + (c || !extra ? '' : `  ${extra}`)); if (!c) fail++; };

const r = spawnSync('sh', ['deploy-prepare.sh'], { cwd: ROOT, encoding: 'utf8' });
const out = `${r.stdout || ''}${r.stderr || ''}`;
ok(r.status === 0, 'sh deploy-prepare.sh exit 0（頂層未分類項目／輸出驗收不過都會非零）', out.trim().split('\n').slice(-4).join(' | '));
ok(/部署輸出就緒/.test(out), '印出「✓ 部署輸出就緒」（腳本的最後一道驗收有跑到）');
ok(existsSync(join(ROOT, '_site', 'index.html')), '_site/index.html 存在（/ 不會 404）');
// 對外邊界的核心：內部檔不得出現在輸出（allow-list 是結構，這裡再從結果面驗一次）
for (const internal of ['AGENTS.md', 'deploy-prepare.sh', 'tests', 'tools', 'wasm', 'docs']) {
  ok(!existsSync(join(ROOT, '_site', internal)), `_site/ 不含內部資產 ${internal}`);
}
// 允許清單裡的站台資產每一項都真的出貨了（清單寫了但檔不存在＝線上 404，本機看不出來）
const allow = readFileSync(join(ROOT, 'deploy-allow.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
const missing = allow.filter((a) => !existsSync(join(ROOT, '_site', a)));
ok(missing.length === 0, `deploy-allow.txt 的 ${allow.length} 項全部出現在 _site/`, missing.join(', '));

console.log(fail ? `\n✗ deploy-prepare: ${fail} 條失敗` : '\n✓ deploy-prepare: 全綠');
process.exit(fail ? 1 : 0);

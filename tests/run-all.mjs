// tests/run-all.mjs — 一鍵跑全部測試：node tests/run-all.mjs（任一 fail → exit 1）
// 發佈前驗證入口（取代逐檔記得 node tests/xxx）。新增測試放 tests/*.test.{js,mjs} 即自動納入。
// 每個測試檔各起獨立 node 子行程（避免 global 瀏覽器 stub 互相污染）。
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter((f) => /\.test\.(js|mjs)$/.test(f)).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [join(dir, f)], { stdio: 'inherit' });
  if (r.status !== 0) { failed++; console.error(`✗ ${f} FAILED (exit ${r.status})`); }
}
console.log(`\n${files.length - failed}/${files.length} 測試檔通過`);
// 檔數下限：0 個檔也印「0/0 通過」並 exit 0 ＝ 刪光測試仍全綠（健檢 R5 M6）。宣告值另由 AGENTS.md 的 TEST-BASELINE 標記對帳。
const MIN_FILES = 5;
if (files.length < MIN_FILES) { console.error(`✗ tests/ 只掃到 ${files.length} 個測試檔（基線 ${MIN_FILES}）——有測試檔被刪或改名`); process.exit(1); }
process.exit(failed ? 1 : 0);

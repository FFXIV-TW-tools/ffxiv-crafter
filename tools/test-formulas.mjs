// node tools/test-formulas.mjs — 前端純函式 golden 回歸 + 健檢機械哨兵（無框架、vm sandbox）的**入口**。
// B-039（2026-09-06）把原本 3290 行的單檔按主題拆到 `tools/tests/`：共用底座＝`tools/tests/_harness.mjs`
// （原始碼字串／DOM stub／主 sandbox／迷你斷言框架／共用 fixture），各主題檔只放斷言。
// 入口只做三件事：掃描 → 依檔名序 import → 印總數。**檔名前綴的數字＝執行順序**（主 sandbox 是共用可變狀態，
// 順序是契約：改檔名等於改執行順序）。
// ⚠ 清單靠掃描產生、不手寫——手維護的清單漏一支的症狀是「該檔的斷言被刪掉仍全綠」。
// 掃不到檔／檔數低於下限一律 exit 1（0 個檔也印「0 passed, 0 failed」＝刪光測試仍全綠，同 tests/run-all.mjs 的教訓）。
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { getCounts } from './tests/_harness.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'tests');
const files = readdirSync(DIR).filter((f) => f.endsWith('.test.mjs')).sort();
const MIN_FILES = 13;   // 拆完的主題檔數；新增主題檔時連同這裡一起加
if (files.length < MIN_FILES) {
  console.error(`✗ tools/tests/ 只掃到 ${files.length} 支主題測試檔（基線 ${MIN_FILES}）——有測試檔被刪或改名`);
  process.exit(1);
}
for (const f of files) await import(pathToFileURL(join(DIR, f)).href);

const { pass, fail } = getCounts();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

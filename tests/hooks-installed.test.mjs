#!/usr/bin/env node
// tests/hooks-installed.test.mjs — 這個 clone 的 pre-commit 閘真的裝著（健檢 R5 B-037 ④）
//
// 【為什麼這支要存在】
// 本 repo 的機械閘（secret 掃描／檔案大小鐵則／DEVLOOP 工件格式／測試基線對帳）全部住在 monorepo 的
// `tools/git-hooks/pre-commit`，靠 `.git/config` 的 `core.hooksPath` 指過去——那是 repo **外**的絕對路徑，
// 而 `.git/config` 不進 git。新 clone、換機、或哪天有人 `git config --unset core.hooksPath`，
// 閘就靜默消失：commit 照常成功、什麼都不會紅，repo 內沒有任何東西會發現。
// 這支跑在 canonicalTest 裡（`node tests/run-all.mjs` 自動掃到），所以 safe-push 之前一定會問一次
// 「閘還在嗎」——答不出來就推不出去，缺口從「靜默」變成「明確失敗」。
//
// 跑法：node tests/hooks-installed.test.mjs（或 node tests/run-all.mjs 自動納入）
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute, resolve } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const ok = (c, m, extra) => { console.log((c ? '✓ ' : '✗ ') + m + (c || !extra ? '' : `  ${extra}`)); if (!c) fail++; };

// 只看**這個 repo 自己的** config：pre-commit 由 git 啟動時會 export GIT_DIR 等變數給整棵 process 樹，
// 不剝掉的話這裡讀到的是外層那次 commit 的 repo（check-test-baseline.js 的 childEnv 已剝，這裡再保險一次）
const env = { ...process.env };
for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
let hooksPath = '';
try { hooksPath = execSync('git config --get core.hooksPath', { cwd: ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { hooksPath = ''; }

ok(hooksPath !== '', 'core.hooksPath 有設定（未設＝這個 clone 零閘門；照 monorepo tools/git-hooks/README.md 裝回）');
const dir = hooksPath && (isAbsolute(hooksPath) ? hooksPath : resolve(ROOT, hooksPath));
const hook = dir && join(dir, 'pre-commit');
ok(!!hook && existsSync(hook) && statSync(hook).isFile(), 'hooksPath 底下有 pre-commit 檔', hooksPath);
// 內容要是那支共用閘，不是隨便一個空殼（空殼同樣 exit 0、同樣「裝著」）
const src = hook && existsSync(hook) ? readFileSync(hook, 'utf8') : '';
for (const needle of ['check-devloop-artifacts', 'check-test-baseline', 'FFXIV_SIZE_GATE']) {
  ok(src.includes(needle), `pre-commit 內含 ${needle}（確認是 monorepo 那支共用閘，不是空殼）`);
}

console.log(fail ? `\n✗ hooks-installed: ${fail} 條失敗` : '\n✓ hooks-installed: 全綠');
process.exit(fail ? 1 : 0);

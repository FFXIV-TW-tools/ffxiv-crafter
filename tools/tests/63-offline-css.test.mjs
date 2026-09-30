// portal checkout 缺席時明示跳過；有正典時不得放行離線頁樣式漂移。
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, check } from './_harness.mjs';
const portal = join(ROOT, '..', 'ffxiv-tw-tools-portal');
if (existsSync(portal)) {
  const gen = join(portal, 'tools', 'gen-offline-css.mjs');
  const r = spawnSync(process.execPath, [gen, '--config', 'tools/offline.config.json', '--check'], { cwd: ROOT, encoding: 'utf8' });
  check('404 inline CSS 與 portal 離線頁正典一致', r.status === 0, r.stdout + r.stderr);
} else console.log('portal checkout 缺席，跳過離線 CSS 正典比對');

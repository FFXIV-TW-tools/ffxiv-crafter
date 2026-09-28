// 靜態圖示與首屏流程的來源漂移哨兵；CI 缺 portal checkout 時只跳過正典比對。
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, check } from './_harness.mjs';
const gen = join(ROOT, '..', 'ffxiv-tw-tools-portal', 'tools', 'gen-site-icons.mjs');
if (existsSync(gen)) {
  const r = spawnSync(process.execPath, [gen, '--config', 'tools/icons.config.json', '--check'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status === 2) console.log(`⊘ 圖示正典缺席，跳過：${(r.stderr || '').trim()}`);
  else check('CrafterIcons 與 portal Phosphor 正典一致', r.status === 0, r.stdout + r.stderr);
} else console.log('⊘ portal 圖示產生器缺席，跳過正典比對');
const html = spawnSync(process.execPath, ['tools/bake-crafter-html.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
check('靜態 HTML 圖示與冷啟動步驟同生成物', html.status === 0, html.stdout + html.stderr);

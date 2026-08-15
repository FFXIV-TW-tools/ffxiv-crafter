#!/usr/bin/env node
// tests/settings-api.test.mjs — 設定 API 同源代理的契約（健檢 2026-08-15 tests A3）
//
// 【為什麼這支要存在】
// `functions/settings-api/[[path]].js` 的檔頭自己寫著「🔴 這是本檔最重要的一條，改壞了完全沒有訊號」：
// 用 `fetch('https://…workers.dev/…')` 取代 service binding，會讓請求重新入境 CF 網路 ⇒ 上游收到的
// `CF-Connecting-IP` 變成本 Function 所在 colo 的位址，於是**全站所有使用者共用一個 per-IP 配額**，
// 症狀只是「偶爾有人被 429」——查不到、也對不上任何一次改動。
// 那條紅線先前**沒有任何機械守**（`export const __test` 甚至沒有消費端）。這支就是那個守。
//
// 跑法：node tests/settings-api.test.mjs（或 node tests/run-all.mjs 自動納入）
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MOD = join(ROOT, 'functions', 'settings-api', '[[path]].js');
const { onRequest, __test } = await import(pathToFileURL(MOD).href);
const { UPSTREAM } = __test;
const SRC = readFileSync(MOD, 'utf8');

let fail = 0;
const ok = (c, m, extra) => { console.log((c ? '✓ ' : '✗ ') + m + (c || !extra ? '' : `  ${extra}`)); if (!c) fail++; };

// 代理不得自己上網：任何一次 global fetch 都是那條紅線被踩到
let globalFetchCalls = 0;
globalThis.fetch = (...a) => { globalFetchCalls += 1; throw new Error('代理不得呼叫 global fetch：' + a[0]); };

const mkCtx = ({ url = 'https://crafter.xivtc.com/settings-api/u/abc/doc1?x=1', method = 'GET',
  headers = {}, body = null, binding = true, upstream } = {}) => {
  const seen = {};
  const env = binding ? {
    SETTINGS_API: {
      fetch(req) {
        seen.url = req.url; seen.method = req.method; seen.headers = req.headers;
        if (upstream === 'throw') throw new Error('upstream boom');
        return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json', ETag: 'W/"v3"' } });
      },
    },
  } : {};
  const init = { method, headers };
  if (body != null) { init.body = body; init.duplex = 'half'; }
  return { context: { request: new Request(url, init), env }, seen };
};

// ---------- ① service binding 是唯一出口 ----------
{
  const { context, seen } = mkCtx();
  const res = await onRequest(context);
  ok(res.status === 200, '有 binding → 直接回上游狀態碼', `status=${res.status}`);
  ok(globalFetchCalls === 0, '全程不得呼叫 global fetch（那條路會蓋掉 client IP，讓 per-IP 額度變全站共用）');
  ok(seen.url === `${UPSTREAM}/u/abc/doc1?x=1`,
    'target ＝ UPSTREAM + 去掉 /settings-api 前綴的路徑 + 原 query', `got=${seen.url}`);
}

// ---------- ② 原 request 逐字沿用（method / If-Match / body）----------
{
  const { context, seen } = mkCtx({ method: 'PUT', body: '{"a":1}',
    headers: { 'If-Match': 'W/"v2"', 'Content-Type': 'application/json' } });
  await onRequest(context);
  ok(seen.method === 'PUT', '寫入方法原樣送到上游（全方法開放，不是只代理 GET）', `got=${seen.method}`);
  // If-Match 掉了 → 樂觀鎖退化成「靜默覆蓋」：兩台裝置同時改設定，後到的無聲蓋掉先到的
  ok(seen.headers.get('If-Match') === 'W/"v2"', 'If-Match 必須逐字穿透（掉了＝樂觀鎖退化成靜默覆蓋）');
}

// ---------- ③ 缺 binding 一律 fail-closed，不偷偷走 URL fallback ----------
{
  const { context } = mkCtx({ binding: false });
  const res = await onRequest(context);
  const j = await res.json();
  ok(res.status === 503, '缺 binding → 503（明講，不降級）', `status=${res.status}`);
  ok(j.error === 'binding_missing', '缺 binding → 可辨識的錯誤碼', JSON.stringify(j));
  ok(globalFetchCalls === 0, '缺 binding 時**尤其**不得 fetch fallback —— fallback 看起來像韌性，實際是無聲放回紅線');
}

// ---------- ④ 上游炸掉要分得出「後端掛了」與「代理掛了」----------
{
  const { context } = mkCtx({ upstream: 'throw' });
  const res = await onRequest(context);
  const j = await res.json();
  ok(res.status === 502, '上游 fetch 失敗 → 502（不靜默吞）', `status=${res.status}`);
  ok(j.error === 'proxy_upstream_failed', '502 要帶得出是代理這一跳失敗', JSON.stringify(j));
}

// ---------- ⑤ 使用者資料任何快取都不對 ----------
{
  const { context } = mkCtx();
  const res = await onRequest(context);
  ok(res.headers.get('Cache-Control') === 'no-store', '回應一律 no-store（使用者設定不得被任何一層快取）');
  ok(res.headers.get('ETag') === 'W/"v3"', '上游的 ETag 要保留（樂觀鎖靠它）');
  ok(/^upstream;dur=\d+$/.test(res.headers.get('Server-Timing') || ''),
    'Server-Timing 帶上這一跳的實測成本（當初決定架構的就是這個數字）');
}

// ---------- ⑥ 源碼哨兵：不得出現第二條出境路徑 ----------
{
  const body = SRC.replace(/^\s*\/\/.*$/gm, '');   // 註解裡本來就會提到 fetch('https://…')，只掃程式碼
  ok(!/\bfetch\s*\(\s*['"`]https?:/.test(body) && !/\bfetch\s*\(\s*UPSTREAM/.test(body),
    '程式碼裡不得有對 URL 的 fetch（唯一出口是 env.SETTINGS_API.fetch）');
  ok(/env\.SETTINGS_API\.fetch\s*\(/.test(body), 'service binding 直呼必須存在（負對照：整段被改寫時這條會紅）');
}

console.log(fail ? `\n✗ ${fail} 項失敗` : '\n✓ settings-api: 全綠');
process.exit(fail ? 1 : 0);

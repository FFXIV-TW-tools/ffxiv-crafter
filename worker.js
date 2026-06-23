// Web Worker：載入 raphael WASM，跑 solve（自動求解最佳手法）。
import init, { solve } from './pkg/crafter_wasm.js';

const ready = init(); // 抓 pkg/crafter_wasm_bg.wasm（同源）

self.onmessage = async (e) => {
  const { input } = e.data || {};
  try {
    await ready;
    self.postMessage({ ok: true, result: solve(input) });
  } catch (err) {
    self.postMessage({ ok: false, error: String((err && err.message) || err) });
  }
};

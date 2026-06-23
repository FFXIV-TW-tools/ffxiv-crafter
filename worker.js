// Web Worker：載入 raphael WASM，依 cmd 跑 solve（自動求解）或 simulate（手動序列重放）。
import init, { solve, simulate } from './pkg/crafter_wasm.js';

const ready = init(); // 抓 pkg/crafter_wasm_bg.wasm（同源）

self.onmessage = async (e) => {
  const { cmd, input } = e.data || {};
  try {
    await ready;
    const result = cmd === 'simulate' ? simulate(input) : solve(input);
    self.postMessage({ ok: true, cmd, result });
  } catch (err) {
    self.postMessage({ ok: false, cmd, error: String((err && err.message) || err) });
  }
};

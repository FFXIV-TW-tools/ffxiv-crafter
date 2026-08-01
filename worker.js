// Web Worker：載入 raphael WASM，跑 solve（自動求解最佳手法）。
import init, { solve } from './pkg/crafter_wasm.js';

const ready = init(); // 抓 pkg/crafter_wasm_bg.wasm（同源）

self.onmessage = async (e) => {
  // gen＝這次求解的身分，原樣回傳讓主執行緒丟棄過期結果（app-solve.js 的世代守衛；
  // 沒有它的話換配方後晚回的舊結果會渲染在新配方標題下）。只跑 solve；simulate（WASM 有導出）尚未接 UI。
  const { input, gen } = e.data || {};

  try {
    await ready;
  } catch (err) {
    self.postMessage({ ok: false, gen, kind: 'init', error: String((err && err.message) || err) });
    return;
  }

  try {
    self.postMessage({ ok: true, gen, result: solve(input) });
  } catch (err) {
    self.postMessage({ ok: false, gen, kind: 'solve', error: String((err && err.message) || err) });
  }
};

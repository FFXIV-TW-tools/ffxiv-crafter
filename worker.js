// Web Worker：載入 raphael WASM，跑 solve（自動求解最佳手法）。
import init, { solve } from './pkg/crafter_wasm.js';

// 引擎以 WebAssembly SIMD 編譯（tools/build-wasm.ps1 的 +simd128）。不支援的瀏覽器會在 init 編譯時失敗，
// 錯誤字串各家不同、看不出是「瀏覽器太舊」⇒ 先用最小的 SIMD 模組探測（一個回傳 v128.const 的函式，43 bytes），
// 不支援就不去下載引擎，直接回報哨兵字串 NO_WASM_SIMD（文案在 app-solve.js 的 solveErrorMessage）。
const SIMD_PROBE = new Uint8Array([
  0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,          // magic + version
  1, 5, 1, 0x60, 0, 1, 0x7b,                // type：() -> v128
  3, 2, 1, 0,                               // function：1 個，type 0
  10, 0x16, 1, 0x14, 0, 0xfd, 0x0c,         // code：v128.const
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0x0b,                                     // end
]);
const ready = WebAssembly.validate(SIMD_PROBE)
  ? init() // 抓 pkg/crafter_wasm_bg.wasm（同源）
  : Promise.reject(new Error('NO_WASM_SIMD'));

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
    // WebAssembly.RuntimeError＝引擎 trap（panic→abort，多半是記憶體用盡）：之後這個 instance 的狀態不可信
    // （記憶體用盡那種實測之後每次呼叫都立即失敗），回報 kind:'crash' 讓主執行緒丟掉整個 worker 重建；
    // 一般求解失敗（NoSolution 等）是 Rust 回傳的錯誤，instance 仍可用。
    const kind = err instanceof WebAssembly.RuntimeError ? 'crash' : 'solve';
    self.postMessage({ ok: false, gen, kind, error: String((err && err.message) || err) });
  }
};

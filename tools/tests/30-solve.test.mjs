// tools/tests/30-solve.test.mjs — 求解編排 app-solve.js：世代守衛／引擎初始化失敗／求解計時（T13／T27／T28）
// 由 tools/test-formulas.mjs 依檔名序 import 跑；斷言計數器與共用 fixture 都在 ./_harness.mjs。
import { fs, vm, path, ROOT, CSS_SRC, makeEl, check, eq } from './_harness.mjs';

// ===== T13：飛行中求解的世代守衛（2026-07-25 健檢 HIGH）=====
// doSolve 原本只 postMessage(settings)、不帶任何身分；onWorkerMsg 收到就 render。
// 換配方 / 改設定不會取消飛行中的 job（selectRecipe 不 cancelSolve；invalidateResults 在
// results.hidden 時 early return，而求解中正是 hidden）→ 舊配方的結果會蓋在新配方的標題下，
// 玩家可能複製到「配方 A 的手法 + 配方 B 的標題」錯綁巨集。
{
  const SOLVE_SRC = fs.readFileSync(path.join(ROOT, 'app-solve.js'), 'utf8');
  const sent = [];            // worker 收到的訊息
  let onmsg = null;           // app-solve 掛上的 onmessage
  const rendered = [];        // CraftRender.render 的呼叫

  const sbDom = {};
  const sbEl = (id) => sbDom[id] || (sbDom[id] = makeEl());
  const sb = {
    console,
    document: { getElementById: sbEl, createElement() { return makeEl(); } },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Worker: function () {
      this.postMessage = (m) => sent.push(m);
      this.terminate = () => {};
      Object.defineProperty(this, 'onmessage', { set(fn) { onmsg = fn; }, get() { return onmsg; } });
      Object.defineProperty(this, 'onerror', { set() {}, get() { return null; } });
    },
  };
  sb.globalThis = sb;
  sb.CraftRender = { render: (r) => rendered.push(r) };
  vm.createContext(sb);
  vm.runInContext(SOLVE_SRC, sb, { filename: 'app-solve.js' });

  sb.CraftSolve.init({
    statShortfall: () => ({ need: { cms: 0, ctrl: 0 }, cms: 0, ctrl: 0, ok: true }),
    $: sbEl,
    toast: () => {},
    PH_HTML: '',
    getSelected: () => ({ recipe: { job: '木工' }, rlv: 700 }),
    gearFor: () => ({ craftsmanship: 4000, control: 4000, cp: 600 }),
    computeSettings: () => ({ base_progress: 100, base_quality: 100 }),
    switchTab: () => {},
  });

  sb.CraftSolve.doSolve();
  const gen1 = sent.at(-1) && sent.at(-1).gen;
  check('T13 doSolve 送出的訊息帶世代號（身分依據）', gen1 !== undefined, `got=${JSON.stringify(sent.at(-1))}`);

  sb.CraftSolve.doSolve();          // 使用者換配方後重新求解
  const gen2 = sent.at(-1) && sent.at(-1).gen;
  check('T13 第二次求解的世代號遞增（新舊可區分）', gen2 !== undefined && gen2 !== gen1, `gen1=${gen1} gen2=${gen2}`);

  // 舊世代（配方 A）的結果晚回 → 必須丟棄
  onmsg({ data: { ok: true, gen: gen1, result: { steps: ['舊配方結果'] } } });
  eq('T13 過期世代的結果不得渲染（否則舊手法配新標題）', rendered.length, 0);

  // 當前世代正常渲染
  onmsg({ data: { ok: true, gen: gen2, result: { steps: ['當前結果'] } } });
  eq('T13 當前世代的結果正常渲染', rendered.length, 1);

  // 取消後，該次求解的結果回來也不得渲染
  sb.CraftSolve.doSolve();
  const gen3 = sent.at(-1).gen;
  sb.CraftSolve.cancelSolve();
  onmsg({ data: { ok: true, gen: gen3, result: { steps: ['已取消的結果'] } } });
  eq('T13 已取消的求解結果不得渲染', rendered.length, 1);

  // 錯誤幀同樣要判世代（舊配方的 NoSolution 不該汙染新配方的 UI）
  let toasted = 0;
  sb.CraftSolve.init({
    statShortfall: () => ({ need: { cms: 0, ctrl: 0 }, cms: 0, ctrl: 0, ok: true }),
    $: sbEl, toast: () => { toasted++; }, PH_HTML: '',
    getSelected: () => ({ recipe: { job: '木工' }, rlv: 700 }),
    gearFor: () => ({}), computeSettings: () => ({ base_progress: 100, base_quality: 100 }),
    switchTab: () => {},
  });
  sb.CraftSolve.doSolve();
  const gen4 = sent.at(-1).gen;
  sb.CraftSolve.doSolve();
  onmsg({ data: { ok: false, gen: gen4, error: 'NoSolution' } });
  eq('T13 過期世代的錯誤幀不得 toast（不汙染新求解的 UI）', toasted, 0);

  // 【求解中改設定】invalidateInFlight 必須作廢當前世代（2026-07-27 外審【高】）：
  // invalidateResults 的 early return 看的是 results.hidden，而求解期間正是 hidden →
  // 若不在那之前先作廢，舊 worker 回來時 gen 未變、守衛放行 → 舊設定算的手法配新設定的畫面。
  {
    let toasted2 = 0, focused = 0;
    const btn = sbEl('solve-btn'); btn.focus = () => { focused++; };
    sb.CraftSolve.init({
    statShortfall: () => ({ need: { cms: 0, ctrl: 0 }, cms: 0, ctrl: 0, ok: true }),
      $: sbEl, toast: () => { toasted2++; }, PH_HTML: '',
      getSelected: () => ({ recipe: { job: '木工' }, rlv: 700 }),
      gearFor: () => ({}), computeSettings: () => ({ base_progress: 100, base_quality: 100 }),
      switchTab: () => {},
    });
    const before = rendered.length;
    sb.CraftSolve.doSolve();
    const genA = sent.at(-1).gen;
    sbEl('cancel-btn').hidden = false;                    // setSolving(true) 的效果（stub 不自動連動）
    eq('T13 求解中 invalidateInFlight → 回報真的取消了', sb.CraftSolve.invalidateInFlight(), true);
    onmsg({ data: { ok: true, gen: genA, result: { steps: ['改設定前算的舊結果'] } } });
    eq('T13 改設定作廢後，舊世代結果不得渲染', rendered.length, before);
    // 自動作廢**不得**搶焦點：使用者可能正在打字改目標品質
    eq('T13 自動作廢不移焦到求解鈕（不打斷輸入）', focused, 0);
    eq('T13 自動作廢不跳「已取消求解」toast（非使用者主動取消）', toasted2, 0);
    sbEl('cancel-btn').hidden = true;
    eq('T13 未求解時 invalidateInFlight → false（不做事）', sb.CraftSolve.invalidateInFlight(), false);
  }

  // worker.js 契約：必須把 gen 原樣回傳，否則主執行緒無從比對
  const WORKER_SRC = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8');
  check('T13 worker.js 回傳訊息帶回 gen（世代守衛的另一半）',
    /gen/.test(WORKER_SRC) && /postMessage\(\s*\{[^}]*gen/.test(WORKER_SRC),
    'worker.js 未回傳 gen → 主執行緒收到的訊息無身分，守衛失效');
}

// ===== T27：WASM 引擎初始化失敗必須可辨識且可重試（B-012）=====
// init() 的 Promise 在 worker 模組層級只建立一次；若把 await ready 與 solve() 共用 catch，
// 該 worker 會永久卡在 reject，玩家只能重新整理。這裡鎖住分流、誠實訊息與「abortSolve→重建 worker」契約。
{
  const SOLVE_SRC = fs.readFileSync(path.join(ROOT, 'app-solve.js'), 'utf8');
  const WORKER_SRC = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8');
  const sent = [];
  let onmsg = null;
  let workerCount = 0;
  const rendered = [];
  const toasted = [];
  const sbDom = {};
  const sbEl = (id) => sbDom[id] || (sbDom[id] = makeEl());
  const sb = {
    console,
    document: { getElementById: sbEl, createElement() { return makeEl(); } },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Worker: function () {
      workerCount++;
      this.postMessage = (m) => sent.push(m);
      this.terminate = () => {};
      Object.defineProperty(this, 'onmessage', { set(fn) { onmsg = fn; }, get() { return onmsg; } });
      Object.defineProperty(this, 'onerror', { set() {}, get() { return null; } });
    },
  };
  sb.globalThis = sb;
  sb.CraftRender = { render: (r) => rendered.push(r) };
  vm.createContext(sb);
  vm.runInContext(SOLVE_SRC, sb, { filename: 'app-solve.js' });
  sb.CraftSolve.init({
    statShortfall: () => ({ need: { cms: 0, ctrl: 0 }, cms: 0, ctrl: 0, ok: true }),
    $: sbEl,
    toast: (msg) => toasted.push(msg),
    PH_HTML: '',
    getSelected: () => ({ recipe: { job: '木工' }, rlv: 700 }),
    gearFor: () => ({ craftsmanship: 4000, control: 4000, cp: 600 }),
    computeSettings: () => ({ base_progress: 100, base_quality: 100 }),
    switchTab: () => {},
  });

  check('T27 solveErrorMessage 已匯出供分類測試', typeof sb.CraftSolve.solveErrorMessage === 'function');
  for (const raw of ['Failed to fetch', 'expected magic word', 'WebAssembly.instantiate']) {
    const msg = sb.CraftSolve.solveErrorMessage(raw);
    check(`T27 ${raw} → 引擎/網路訊息且不導向調整設定`, /引擎|網路/.test(msg) && !/調整設定/.test(msg), `msg=${msg}`);
  }

  check('T27 worker init/solve 兩種失敗型別都原樣帶回 gen',
    /ok:\s*false,\s*gen,\s*kind:\s*["']init/.test(WORKER_SRC)
      && /ok:\s*false,\s*gen,\s*kind:\s*["']solve/.test(WORKER_SRC));

  sb.CraftSolve.doSolve();
  const failedGen = sent.at(-1).gen;
  onmsg({ data: { ok: false, gen: failedGen, kind: 'init', error: 'Failed to fetch' } });
  // 訊息用 textContent 寫入（純文字，不進 innerHTML）；文案唯一來源＝solveErrorMessage
  check('T27 kind:init → 顯示引擎失敗與重試鈕，不走一般求解失敗文案',
    /求解引擎載入失敗（可能是網路問題）/.test(sbEl('solve-status').textContent)
      && sbEl('solve-retry-btn').hidden === false
      && !/調整設定/.test(sbEl('solve-status').textContent));
  // 2026-08-02 實測：抽掉 pkg/*.wasm 時 Chrome 吐的是這句，只比對 `WebAssembly.instantiate` 會漏掉
  check('T27 實測過的真實引擎失敗字串也要分類為引擎問題',
    /引擎|網路/.test(sb.CraftSolve.solveErrorMessage(
      "Failed to execute 'compile' on 'WebAssembly': HTTP status code is not ok")));
  eq('T27 kind:init → 不跳一般求解失敗 toast', toasted.length, 0);

  const workersBeforeRetry = workerCount;
  sbEl('solve-retry-btn').onclick();
  const retryGen = sent.at(-1).gen;
  check('T27 重試 → abortSolve 先遞增世代、再重建 worker 並送出新世代',
    workerCount === workersBeforeRetry + 1 && retryGen === failedGen + 2,
    `workers=${workerCount} retryGen=${retryGen} failedGen=${failedGen}`);
  eq('T27 重試不 toast「已取消求解」', toasted.filter((msg) => /已取消求解/.test(msg)).length, 0);

  onmsg({ data: { ok: true, gen: failedGen, result: { steps: ['舊結果'] } } });
  eq('T27 重試後舊世代結果不得渲染', rendered.length, 0);
}

// ===== T28：求解計時不應每秒重建 aria-live 節點 + listbox 焦點不可消失（B-014）=====
// live region 的狀態節點必須固定；這裡用 T28 專用 DOM stub 保留節點物件參照，
// 不改共用 makeEl()，避免把其他 sandbox 一起改成「看不出 innerHTML 重建」的假綠。
{
  const SOLVE_SRC = fs.readFileSync(path.join(ROOT, 'app-solve.js'), 'utf8');
  let now = 0;
  let tick = null;
  const els = {};

  function solveNode(text = '', attrs = {}) {
    let value = String(text);
    const attributes = { ...attrs };
    const el = {
      checked: false, value: '', hidden: true, disabled: false, dataset: {}, style: {},
      classList: { toggle() {}, add() {}, remove() {} },
      setAttribute(name, v) { attributes[name] = String(v); },
      getAttribute(name) { return attributes[name] ?? null; },
      querySelector() { return null; }, querySelectorAll() { return []; },
      appendChild() {}, removeChild() {}, focus() {},
      textWrites: 0,
    };
    Object.defineProperty(el, 'textContent', {
      get() { return value; },
      set(v) { value = String(v); el.textWrites++; },
    });
    return el;
  }

  const status = solveNode();
  let statusMarkup = '';
  status.markupWrites = 0;
  Object.defineProperty(status, 'innerHTML', {
    get() { return statusMarkup; },
    set(v) {
      statusMarkup = String(v);
      status.markupWrites++;
      status.messageNode = solveNode('求解中…（高難度配方可能數十秒）');
      status.elapsedNode = solveNode('已耗時 0 秒', { 'aria-hidden': 'true' });
    },
  });
  status.querySelector = (selector) => selector === '.crafter-solve-status__message'
    ? status.messageNode
    : selector === '.crafter-solve-status__elapsed' ? status.elapsedNode : null;
  els['solve-status'] = status;
  const sbEl = (id) => els[id] || (els[id] = solveNode());
  const sb = {
    console,
    Date: { now: () => now },
    document: { getElementById: sbEl, createElement() { return solveNode(); } },
    setInterval(fn) { tick = fn; return 1; },
    clearInterval() { tick = null; },
    Worker: function () { this.postMessage = () => {}; this.terminate = () => {}; },
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(SOLVE_SRC, sb, { filename: 'app-solve.js' });
  sb.CraftSolve.init({
    statShortfall: () => ({ need: { cms: 0, ctrl: 0 }, cms: 0, ctrl: 0, ok: true }),
    $: sbEl, toast() {}, PH_HTML: '',
    getSelected: () => ({ recipe: { job: '木工' }, rlv: 700 }),
    gearFor: () => ({ craftsmanship: 4000, control: 4000, cp: 600 }),
    computeSettings: () => ({ base_progress: 100, base_quality: 100 }),
    switchTab() {},
  });

  sb.CraftSolve.doSolve();
  const firstMessage = status.messageNode;
  const firstElapsed = status.elapsedNode;
  const initialElapsed = firstElapsed.textContent;
  eq('T28 求解開始只建立一次狀態結構', status.markupWrites, 1);
  eq('T28 秒數節點帶 aria-hidden="true"', firstElapsed.getAttribute('aria-hidden'), 'true');

  now = 2000; tick();
  now = 3000; tick();
  eq('T28 多次計時後狀態文字仍是同一個節點', status.messageNode, firstMessage);
  eq('T28 多次計時後秒數節點仍是同一個節點', status.elapsedNode, firstElapsed);
  check('T28 每秒只改秒數節點的 textContent', firstElapsed.textContent !== initialElapsed
    && firstElapsed.textContent === '已耗時 3 秒');

  now = 60000; tick();
  const overtimeWrites = firstMessage.textWrites;
  now = 61000; tick();
  eq('T28 跨過 60 秒仍不重建狀態文字節點', status.messageNode, firstMessage);
  eq('T28 ≥60 秒升級文案只寫一次', firstMessage.textWrites, overtimeWrites);

  // CSS 哨兵只擋「已知會壞的形狀」；文字比對驗不了 ring 是否真的在視覺上可見，須用鍵盤實測。
  const optRules = [...CSS_SRC.matchAll(/\.crafter-cons__opt[^{}]*\{([^}]*)\}/g)]
    .map((m) => m[1]).join('\n');
  check('T28 食藥 listbox focus 規則不得 outline:none', !/outline\s*:\s*none\b/.test(optRules),
    `實際規則：${optRules}`);
}

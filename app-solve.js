// app-solve.js — 求解編排層：worker 生命週期 / doSolve / 求解計時（軟提示不殺 worker）/ 結果回傳分派 / 取消 / setSolving。
// classic script（同 crafting-list.js / app-render.js 手法）：發佈 globalThis.CraftSolve，app.js init 注入依賴。
// worker / solveClock 為本層私有狀態（僅本層使用）。結果渲染委派 globalThis.CraftRender.render。
// 註：invalidateResults 留在 app.js —— 它被 gear/原料/求解輸入等多處「外部」呼叫，且本層內部不呼叫它。
(function () {
  let deps = null; // { $, toast, PH_HTML, getSelected, gearFor, computeSettings, switchTab }
  let worker = null;
  let solveClock = null;  // 求解計時器（interval）：每秒更新已耗時；≥60s 升級可取消軟提示（不殺 worker，正常長求解仍在跑）
  // 求解世代號（2026-07-25 健檢 HIGH）：每次 doSolve 遞增並隨 postMessage 送出，worker 原樣回傳。
  // onWorkerMsg 只採用 gen === solveGen 的結果 —— 換配方 / 改設定 / 取消後，飛行中的舊求解回來會被丟棄。
  // 沒有這道守衛時：selectRecipe 不 cancel in-flight job，且 invalidateResults 在 results.hidden 時
  // early return（求解中正是 hidden）→ 舊配方的手法會渲染在新配方的標題下，玩家可能複製到錯綁巨集。
  let solveGen = 0;

  function newWorker() {
    if (worker) worker.terminate();
    worker = new Worker('worker.js', { type: 'module' });
    worker.onmessage = onWorkerMsg;
    worker.onerror = () => {                    // module/worker 載入失敗
      worker = null;                            // 設 null → 下次 doSolve 的 if(!worker) 重建，不卡在壞掉的 worker
      stopSolveClock();
      setSolving(false);
      deps.toast('求解器載入失敗，請重新整理頁面後再試', 'error');
    };
  }
  function doSolve() {
    const { toast, getSelected, gearFor, computeSettings, switchTab } = deps;
    const selected = getSelected();
    if (!selected) return;
    const gear = gearFor(selected.recipe.job);
    if (!gear) { toast('請先設定「' + selected.recipe.job + '」的角色數值', 'error'); switchTab('stats'); return; }
    const settings = computeSettings(selected.recipe, selected.rlv, gear);
    if (settings.base_progress <= 0 || settings.base_quality <= 0) { toast('作業/加工數值過低', 'error'); return; }
    setSolving(true);
    if (!worker) newWorker();
    // gen 是這次求解的身分；worker 原樣回傳，onWorkerMsg 據此丟棄過期結果
    worker.postMessage({ input: settings, gen: ++solveGen }); // worker 只跑 solve（simulate 尚未接 UI），無需 cmd dispatch 欄
    startSolveClock();
  }
  // 求解計時：每秒更新已耗時（求解跑在 worker，主執行緒空閒故計數不凍結）；≥60s 升級為可取消軟提示。
  // 軟提示不殺 worker（正常長求解仍在跑）；成功/取消/載入失敗三路徑均 stopSolveClock（別讓計數殘留）。
  function startSolveClock() {
    const { $ } = deps;
    stopSolveClock();
    const t0 = Date.now();
    const paint = () => {
      if ($('cancel-btn').hidden) { stopSolveClock(); return; }  // 已結束的保險
      const secs = Math.floor((Date.now() - t0) / 1000);
      const overtime = secs >= 60 ? ' — 仍在計算中，可繼續等待或按「取消」' : '';
      $('solve-status').innerHTML = `<span class="codex-spinner"></span> 求解中… 已耗時 ${secs} 秒（高難度配方可能數十秒）${overtime}`;
    };
    paint();
    solveClock = setInterval(paint, 1000);
  }
  function stopSolveClock() { if (solveClock) { clearInterval(solveClock); solveClock = null; } }
  // SolverException（raphael）3 變體 + serde 反序列化錯誤 → 繁中人話 + 下一步
  function solveErrorMessage(raw) {
    const s = String(raw || '');
    if (s === 'NoSolution') return '以目前數值無法完成此配方 — 試著提升作業精度／加工精度／等級、開啟食物藥水或專家之證，或降低目標品質後再求解。';
    if (s === 'Interrupted') return '求解被中斷，請再試一次。';
    if (/internal error|bug report/i.test(s)) return '求解器內部錯誤，請稍後再試（技術細節已記錄於主控台）。';
    if (/invalid value|expected u\d|integer/i.test(s)) return '角色數值超出合理範圍 — 請確認作業精度／加工精度／CP／等級的數字是否正確。';
    return '求解失敗，請調整設定後再試一次。';
  }
  function onWorkerMsg(e) {
    const { $, toast, PH_HTML } = deps;
    // 過期世代（使用者已換配方 / 改設定 / 取消）→ 整幀丟棄：不渲染、不 toast、不動 UI 狀態，
    // 因為當前可能已有另一次求解在跑，動 UI 會把「求解中」錯誤地收掉。
    if (e.data.gen !== solveGen) return;
    stopSolveClock();
    setSolving(false);
    if (!e.data.ok) {
      console.warn('[crafter] 求解失敗:', e.data.error);   // 技術原文進主控台，不丟給玩家
      toast(solveErrorMessage(e.data.error), 'error');
      return;
    }
    try {
      globalThis.CraftRender.render(e.data.result, true);  // 結果渲染委派 app-render.js
    } catch (err) {                             // WASM Output 契約漂移等 → 有可見降級而非空白
      console.error('[crafter] 結果渲染失敗:', err);
      toast('結果解析失敗，請重新求解', 'error');
      $('results').hidden = true;
      $('results-placeholder').hidden = false;
      $('results-placeholder').innerHTML = PH_HTML;
    }
  }
  // 中止飛行中的求解：遞增世代讓 in-flight 結果失效（terminate 之外的第二道保險——terminate 與訊息投遞有 race），
  // 再換新 worker 釋放 CPU。
  // reason='user'（按取消鈕）才 toast + 移焦回求解鈕；reason='invalidated'（換配方／改設定自動作廢）
  // **刻意不移焦**——使用者可能正在打字改目標品質，搶焦點會直接打斷輸入。
  function abortSolve(reason) {
    solveGen++; stopSolveClock(); newWorker(); setSolving(false);
    if (reason === 'user') { deps.toast('已取消求解', 'warn'); deps.$('solve-btn').focus(); }
  }
  function cancelSolve() { abortSolve('user'); }
  function setSolving(on) {
    const { $, PH_HTML } = deps;
    $('solve-btn').hidden = on;
    $('cancel-btn').hidden = !on;
    if (on) {
      $('results').hidden = true;
      $('results-placeholder').hidden = false;
      $('results-placeholder').innerHTML = '<span class="codex-spinner"></span> 求解中…';
    } else if (!$('results') || $('results').hidden) {
      $('results-placeholder').innerHTML = PH_HTML; // 取消/錯誤結束 → 還原提示（成功時 render 會隱藏）
    }
    $('solve-status').innerHTML = on ? '<span class="codex-spinner"></span> 求解中…（高難度配方可能數十秒）' : '';
    globalThis.CraftFlow?.update?.();   // 步驟軸 ③ 進行中/退回（選擇性呼叫：測試 sandbox 無本層時不炸）
  }

  // 供外部（換配方 / 返回配方列表）在「求解中」時作廢當前求解：
  // 世代守衛已保證舊結果不會被渲染，但 UI 狀態（solve-btn 藏著、cancel-btn 亮著）會殘留到新配方頁面，
  // 且舊求解還在燒 CPU。回傳是否真的取消了（沒在求解時不做事、也不 toast）。
  function invalidateInFlight() {
    if (!deps || deps.$('cancel-btn').hidden) return false;
    abortSolve('invalidated');
    return true;
  }

  globalThis.CraftSolve = {
    init(d) { deps = d; },
    newWorker,   // 預熱 WASM（app.js init 提前呼叫，讓 WASM download 與資料 fetch 並行）
    doSolve, cancelSolve, invalidateInFlight,
  };
})();

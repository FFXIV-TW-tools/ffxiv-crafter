// first-run-hint.js — 首次使用提示的顯隱，在解析階段先定案一次（2026-08-23，CLS）
//
// 【為什麼要有這支】`#first-run-hint` 只看 localStorage，是**同步就能決定**的事，但原本要等
//   `app.js`（`type="module"` ⇒ defer）跑到 `updateHint()` 才決定 ⇒ **首次繪製之後**才長出
//   80px，把流程軸與整個求解面板往下推。實測載入期 CLS 1366/900/390px＝0.044/0.069/0.094
//   全部來自這一發，而畫面上只是「提示晚一點才出現」——零回饋訊號。
//
// 【為什麼是外部檔而不是 inline】inline 會擴大 CSP `unsafe-inline` 的依賴面（`unsafe-inline`
//   留著的理由是「head 那兩段 bootstrap 非留不可」，多一段這個理由就不成立了）。
//   `tools/test-formulas.mjs` 的 T53 當場擋下第一版的 inline 寫法——它是對的。
//   外部檔走 `script-src 'self'`，而 parser-blocking 的 classic script 一樣跑在首次繪製之前。
//
// 【為什麼不叫 CraftGear.anyGear()】它要等 app.js 注入 deps 才能用，而那正是要避開的時機。
//   所以這裡只做**寬鬆版**判斷（key 有沒有內容）；跟 anyGear() 的嚴格判斷偶有出入時，
//   app.js 會在 ~450ms 修正回來——那是罕見情況，換掉的是每一次首訪都必然發生的位移。
//   ⚠️ key 與 app-gear.js 的 GEAR_KEY 是兩份，漂移哨兵＝tests/first-run-hint-key.test.mjs。
(function () {
  try {
    var raw = localStorage.getItem('ffxiv-crafter-gearsets-v1');
    var o = raw ? JSON.parse(raw) : null;
    if (o && typeof o === 'object' && Object.keys(o).length) return;   // 有資料＝老使用者，維持 hidden
    document.getElementById('first-run-hint').hidden = false;
  } catch (e) {
    // 無痕/私密模式讀不到 ⇒ 維持 HTML 預設的 hidden，交給 app.js 決定（那時會有一次位移，
    // 但那是本來就會發生的，不是這支造成的）。不靜默吞（AGENTS「except: pass 禁止」同精神）。
    console.warn('[crafter] 首屏提示讀不到 localStorage，改由 app.js 決定顯隱', e);
  }
})();

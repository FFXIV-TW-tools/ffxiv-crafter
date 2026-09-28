// 本站動態向量圖示與指標磚的唯一 markup 出口；path 來自 portal 產生的 crafter-icons.js。
(function () {
  function iconSVG(name, className = 'codex-ico') {
    const path = globalThis.CrafterIcons[name];
    if (!path) throw new Error(`缺少圖示：${name}`);
    return `<svg class="${className}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">${path}</svg>`;
  }
  function pageIcon(name) {
    return `<span class="codex-view-title__ico" aria-hidden="true">${iconSVG(name)}</span>`;
  }
  function kpi(icon, label, value) {
    return `<div class="codex-kpi"><span class="codex-kpi__icon" aria-hidden="true">${iconSVG(icon)}</span>` +
      `<span class="codex-kpi__label">${label}</span><span class="codex-kpi__value">${value}</span></div>`;
  }
  globalThis.CrafterVisual = Object.freeze({ iconSVG, pageIcon, kpi });
})();

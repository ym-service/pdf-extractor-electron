// expired.js
window.addEventListener('DOMContentLoaded', () => {
  const byId = (id) => document.getElementById(id);

  const wire = (id, fnName) => {
    const el = byId(id);
    if (!el) return;
    el.addEventListener('click', () => {
      if (window.electronAPI && typeof window.electronAPI[fnName] === 'function') {
        window.electronAPI[fnName]();
      } else {
        console.warn(`electronAPI.${fnName} недоступен (проверь preload.js и webPreferences.preload).`);
      }
    });
  };

  wire('minimize-btn', 'minimize');
  wire('maximize-btn', 'maximize');
  wire('close-btn', 'close');
});

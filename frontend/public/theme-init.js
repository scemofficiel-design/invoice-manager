// Applique le thème avant le rendu pour éviter un flash (script externe : compatible CSP stricte).
(function () {
  try {
    var t = localStorage.getItem('im-theme') || 'system';
    var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();

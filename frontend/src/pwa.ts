/** Mode hors connexion : le service worker garde l'application en cache sur l'appareil. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const register = () =>
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch((e) => console.warn('Service worker', e));
  // Le démarrage (chargement de SQLite) se termine souvent après l'événement « load ».
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(async (registration) => {
        // 首次访问时 SW 接管前页面资源已加载完毕，把当前资源清单补发进缓存，
        // 保证离线时可完整加载应用外壳（hash 资源无法在 install 时预知）。
        await navigator.serviceWorker.ready;
        const urls = performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((url) => {
            try {
              return new URL(url).origin === location.origin;
            } catch {
              return false;
            }
          });
        registration.active?.postMessage({ type: 'PRECACHE', urls });
      })
      .catch((error) => {
        console.error('[pwa] service worker registration failed:', error);
      });
  });
}

registerServiceWorker();

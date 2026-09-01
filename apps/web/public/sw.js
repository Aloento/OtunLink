// PWA Service Worker：预缓存应用外壳，静态资源 stale-while-revalidate，导航 network-first。
// 跨源请求（API、MSAL 等）不拦截、不缓存，避免将响应混入缓存。
const CACHE_VERSION = 'otunlink-v1';

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.png',
  '/icons/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 页面导航：网络优先，离线回退缓存的 index.html（SPA fallback）。
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // 同源静态资源：stale-while-revalidate。
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

// 页面加载后由客户端上报当前已加载的资源 URL，补全首访时未进缓存的 hash 资源。
self.addEventListener('message', (event) => {
  const data = event.data;
  if (data?.type !== 'PRECACHE' || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await Promise.all(
        data.urls.map((url) => {
          try {
            const parsed = new URL(url);
            if (parsed.origin !== self.location.origin) return undefined;
            return cache.add(url).catch(() => undefined);
          } catch {
            return undefined;
          }
        }),
      );
    })(),
  );
});

// PWA Service Worker：预缓存应用外壳，静态资源 stale-while-revalidate，导航 network-first。
// 跨源请求（API、MSAL 等）不拦截、不缓存，避免将响应混入缓存。
// v3：给哈希资源缓存设上限 —— 每次发版都会新增一批 hash 资源，不修剪的话
//     手机上的缓存会随发版次数无限增长（几十次发版就是几百 MB）。
const CACHE_VERSION = 'otunlink-v3';

// 哈希资源是内容寻址的：旧文件永远不会再被引用，留着只占地方。
// 上限按「当前构建 + 上一版」留够余量，超出的按插入顺序（最旧）删掉。
const MAX_CACHED_ASSETS = 60;

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

/** 修剪哈希资源缓存：保留 PRECACHE 里的外壳文件，其余超过上限的按最旧删除。 */
async function trimAssets(cache) {
  const shell = new Set(PRECACHE.map((path) => new URL(path, self.location.origin).href));
  const keys = await cache.keys();
  const assets = keys.filter((request) => !shell.has(request.url));
  const excess = assets.length - MAX_CACHED_ASSETS;
  for (let i = 0; i < excess; i += 1) {
    await cache.delete(assets[i]);
  }
}

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
          if (response.ok) {
            caches.open(CACHE_VERSION).then((cache) => cache.put('/index.html', copy));
          }
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
            caches
              .open(CACHE_VERSION)
              .then((cache) => cache.put(request, copy).then(() => trimAssets(cache)))
              .catch(() => undefined);
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

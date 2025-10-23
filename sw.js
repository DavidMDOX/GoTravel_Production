// 简易缓存（PWA）—— 统一版本 v7，避免旧脚本被缓存顶住
const CACHE = 'gt-pwa-v7';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll([
      '/',
      '/index.html?v=7',
      '/app.js?v=7',
      '/manifest.json?v=7'
    ]))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const { request } = e;
  // 对 API 走网络优先，静态文件走缓存优先
  if (request.url.includes('/api/')) {
    e.respondWith(fetch(request).catch(() => caches.match(request)));
  } else {
    e.respondWith(
      caches.match(request).then(res => res || fetch(request))
    );
  }
});

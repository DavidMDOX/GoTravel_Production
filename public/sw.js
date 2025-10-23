const CACHE="gt-pwa-v6";
// 只缓存不带查询参数的核心文件，配合 index.html 去掉 ?v
const CORE=["/","/index.html","/app.js","/manifest.json"];

self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate",e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE?caches.delete(k):null)))
  );
  self.clients.claim();
});

self.addEventListener("fetch",e=>{
  const url = new URL(e.request.url);
  if(url.origin!==self.location.origin) return;

  // 对于带查询参数的相同路径，尽量匹配不带参数的缓存版本
  const noSearchRequest = new Request(url.origin + url.pathname, { method: e.request.method, headers: e.request.headers, mode: e.request.mode, credentials: e.request.credentials, redirect: e.request.redirect });

  e.respondWith(
    fetch(e.request)
      .then(res=>{
        caches.open(CACHE).then(c=>c.put(e.request, res.clone())).catch(()=>{});
        return res;
      })
      .catch(()=>{
        return caches.match(e.request).then(m=> m || caches.match(noSearchRequest).then(n=> n || caches.match("/")));
      })
  );
});

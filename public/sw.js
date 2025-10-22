const CACHE="gt-pwa-v5"; const CORE=["/","/index.html","/app.js","/manifest.json"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));self.skipWaiting();});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE?caches.delete(k):null))));self.clients.claim();});
self.addEventListener("fetch",e=>{const url=new URL(e.request.url); if(url.origin!==self.location.origin) return;
  e.respondWith(fetch(e.request).then(res=>{caches.open(CACHE).then(c=>c.put(e.request,res.clone()));return res;})
    .catch(()=>caches.match(e.request).then(m=>m||caches.match("/"))));});

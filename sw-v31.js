const CACHE = 'gastos-cache-v31-' + Date.now();
const ASSETS = [
  './','./index.html','./styles.css','./app.js?v=32','./manifest.webmanifest',
  './icons/icon-192.png','./icons/icon-512.png'
];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const req = event.request;
  if(req.method!=='GET'){ return; }
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req).then(res=>{
      cache.put(req,res.clone()).catch(()=>{});
      return res;
    }).catch(()=>cached);
    return cached || fetchPromise;
  })());
});
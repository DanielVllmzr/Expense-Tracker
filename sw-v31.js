const CACHE_NAME='gastos-cache-v31-' + Date.now();
const ASSETS=['./','./index.html','./styles.css','./app.js?v=33','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./firestore-data.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS))); self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(r=>{const f=fetch(e.request).then(res=>{caches.open(CACHE_NAME).then(c=>c.put(e.request,res.clone()));return res;}).catch(()=>r);return r||f;}));});
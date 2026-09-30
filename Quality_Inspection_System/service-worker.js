const CACHE='dk-quality-phase18-v1';
const CORE=['./','./index.html','./style.css','./app.js','./sticker-parser.js','./phase13-cloud-sync.js','./phase14-roles.js','./phase15-ocr.js','./phase16-scanner.js','./phase18-draft-recovery.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);
 if(u.origin!==location.origin)return;
 e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{
   const copy=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); return r;
 }).catch(()=>caches.match('./index.html'))));
});
const CACHE_NAME = 'servelect-pontaj-offline-v4.2-20260720';
const CORE_REQUIRED = ['./', './index.html', './config.json', './manifest.webmanifest'];
const CORE_OPTIONAL = [
  './favicon.png','./background.jpg','./departments.csv','./employees.csv',
  './employee_norms.csv','./projects.csv','./locations.csv','./roster_template.csv',
  './admin.html','./reports.html','./fix-day.html','./self.html'
];

self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await cache.addAll(CORE_REQUIRED);
    await Promise.allSettled(CORE_OPTIONAL.map(u=>cache.add(u)));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;
  const networkFirst=/(?:index\.html|config\.json|\.csv)$/i.test(url.pathname)||req.mode==='navigate';
  if(networkFirst){
    event.respondWith(fetch(req).then(resp=>{
      if(resp&&resp.ok){const copy=resp.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy));}
      return resp;
    }).catch(async()=>await caches.match(req)||await caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(resp=>{
    if(resp&&resp.ok){const copy=resp.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy));}
    return resp;
  })));
});

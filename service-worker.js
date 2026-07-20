const BUILD='offline-first-v4.7-20260720-1';
const CACHE_PREFIX='servelect-pontaj-';
const CACHE_NAME=CACHE_PREFIX+BUILD;
const CORE=['./','./index.html','./config.json','./version.json','./manifest.webmanifest','./favicon.png','./background.jpg','./departments.csv','./employees.csv','./employee_norms.csv','./projects.csv','./locations.csv','./roster_template.csv','./admin.html','./reports.html','./fix-day.html','./self.html'];
const DB='servelect-pontaj-v47',STORE='sync';
function openDb(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE);};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function getVal(k){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(k);r.onsuccess=()=>{db.close();res(r.result);};r.onerror=()=>{db.close();rej(r.error);};});}
async function putVal(k,v){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(v,k);tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();rej(tx.error);};});}
async function clearOldCaches(deleteCurrent){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&(deleteCurrent||k!==CACHE_NAME)).map(k=>caches.delete(k)));}
async function cacheFreshAsset(cache,url){try{const bust=url+(url.includes('?')?'&':'?')+'__build='+encodeURIComponent(BUILD);const resp=await fetch(new Request(bust,{cache:'reload'}));if(resp&&resp.ok)await cache.put(url,resp.clone());}catch{}}
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE_NAME);await Promise.all(CORE.map(u=>cacheFreshAsset(c,u)));await self.skipWaiting();})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{await clearOldCaches(false);await self.clients.claim();const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});clients.forEach(client=>client.postMessage({type:'PONTAJ_CACHE_ACTIVATED',build:BUILD}));})()));
self.addEventListener('message',e=>{const d=e.data||{};if(d.type==='SKIP_WAITING')self.skipWaiting();if(d.type==='CLEAR_OLD_CACHES')e.waitUntil(clearOldCaches(!!d.deleteCurrent));});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==self.location.origin)return;const networkFirst=req.mode==='navigate'||/(?:index\.html|config\.json|version\.json|manifest\.webmanifest|\.csv)$/i.test(url.pathname);if(networkFirst){e.respondWith((async()=>{try{const resp=await fetch(req,{cache:'no-store'});if(resp&&resp.ok){const c=await caches.open(CACHE_NAME);const canonical=new Request(url.origin+url.pathname);c.put(canonical,resp.clone()).catch(()=>{});}return resp;}catch{const hit=await caches.match(req,{ignoreSearch:true});return hit||await caches.match('./index.html',{ignoreSearch:true});}})());return;}e.respondWith((async()=>{const hit=await caches.match(req,{ignoreSearch:true});if(hit)return hit;const resp=await fetch(req);if(resp&&resp.ok){const c=await caches.open(CACHE_NAME);c.put(new Request(url.origin+url.pathname),resp.clone()).catch(()=>{});}return resp;})());});
async function wakeClientsForSync(){
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  clients.forEach(client=>client.postMessage({type:'PONTAJ_SYNC_WAKE',build:BUILD}));
}
self.addEventListener('sync',e=>{if(e.tag==='pontaj-sync-v47'||e.tag==='pontaj-sync-v45'||e.tag==='pontaj-sync-v44')e.waitUntil(wakeClientsForSync());});
self.addEventListener('periodicsync',e=>{if(e.tag==='pontaj-periodic-v47'||e.tag==='pontaj-periodic-v45'||e.tag==='pontaj-periodic-v44')e.waitUntil(wakeClientsForSync());});

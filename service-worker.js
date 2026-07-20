'use strict';

const BUILD='offline-first-v4.8.1-enterprise-ui-20260720-1';
const CACHE_PREFIX='servelect-pontaj-';
const CACHE_NAME=CACHE_PREFIX+BUILD;
const CORE=[
  './','./index.html','./config.json','./version.json','./manifest.webmanifest',
  './favicon.png','./background.jpg','./departments.csv','./employees.csv',
  './employee_norms.csv','./projects.csv','./locations.csv','./roster_template.csv',
  './admin.html','./reports.html','./fix-day.html','./self.html','./reset-cache.html','./admin-auth.json',
  './audio/chime.mp3','./audio/stage1.mp3','./audio/stage2.mp3','./audio/stage3.mp3'
];

function canonicalRequest(url){
  return new Request(url.origin+url.pathname,{method:'GET'});
}

async function cacheFreshAsset(cache,path){
  try{
    const url=new URL(path,self.registration.scope);
    url.searchParams.set('__build',BUILD);
    const response=await fetch(new Request(url.toString(),{cache:'reload',credentials:'same-origin'}));
    if(response&&response.ok)await cache.put(canonicalRequest(url),response.clone());
  }catch(_error){
    // O resursă auxiliară indisponibilă nu trebuie să anuleze instalarea shell-ului.
  }
}

async function deleteOldCaches(){
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)));
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await Promise.all(CORE.map(path=>cacheFreshAsset(cache,path)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    await deleteOldCaches();
    await self.clients.claim();
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    clients.forEach(client=>client.postMessage({type:'PONTAJ_CACHE_ACTIVATED',build:BUILD}));
  })());
});

self.addEventListener('message',event=>{
  const data=event.data||{};
  if(data.type==='SKIP_WAITING')event.waitUntil(self.skipWaiting());
  if(data.type==='GET_BUILD'&&event.source)event.source.postMessage({type:'PONTAJ_SW_BUILD',build:BUILD});
});

async function networkFirst(request,url,navigation){
  const cache=await caches.open(CACHE_NAME);
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response&&response.ok)cache.put(canonicalRequest(url),response.clone()).catch(()=>{});
    return response;
  }catch(error){
    const cached=await cache.match(canonicalRequest(url));
    if(cached)return cached;
    if(navigation){
      const shell=await cache.match(new Request(new URL('./index.html',self.registration.scope).toString()));
      if(shell)return shell;
    }
    throw error;
  }
}

async function cacheFirstRevalidate(request,url){
  const cache=await caches.open(CACHE_NAME);
  const key=canonicalRequest(url);
  const cached=await cache.match(key);
  const refresh=fetch(request).then(response=>{
    if(response&&response.ok)cache.put(key,response.clone()).catch(()=>{});
    return response;
  });
  if(cached){refresh.catch(()=>{});return cached;}
  return refresh;
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  const navigation=request.mode==='navigate';
  const mutable=navigation||/(?:\/|^)(?:index\.html|config\.json|version\.json|manifest\.webmanifest|[^/]+\.csv)$/i.test(url.pathname);
  event.respondWith(mutable?networkFirst(request,url,navigation):cacheFirstRevalidate(request,url));
});

'use strict';

const BUILD='offline-first-v4.9.21-apps-script-jsonp-first-cors-fix-20260722-1';
const CACHE_PREFIX='servelect-pontaj-';
const CACHE_NAME=CACHE_PREFIX+BUILD;
const CORE=[
  './','./index.html','./config.json','./version.json','./manifest.webmanifest',
  './robot-pet.css','./robot-pet.js','./assets/robot-pet-fallback.png',
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
    await processPontajQueueV484({soft:true,reason:'activate'}).catch(()=>{});
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
  // Fallback pentru browsere fără SyncManager: la orice revenire/navigare care
  // pornește service worker-ul încercăm și coada, fără a bloca răspunsul paginii.
  if(navigation)event.waitUntil(processPontajQueueV484({soft:true,reason:'navigation-start'}).catch(()=>{}));
});

/* ================= OFFLINE ACTION BACKGROUND SYNC V4.9.7 ================= */
const PONTAJ_SYNC_TAG_V484='servelect-pontaj-sync-v48';
const PONTAJ_DB_V484='servelect-pontaj-v48';
const PONTAJ_DB_VERSION_V484=1;
const PONTAJ_ACTIVE_STORE_V484='activeActions';
const PONTAJ_META_STORE_V484='meta';
const PONTAJ_TERMINAL_STORE_V484='terminalJournal';
const PONTAJ_LEASE_KEY_V484='syncLease';
const PONTAJ_PROTOCOL_V484='servelect-pontaj-sync/v4.8';
const PONTAJ_SW_OWNER_V484='service-worker-v4.9.7';
const PONTAJ_SW_LEASE_MS_V484=45000;
const PONTAJ_FINAL_ACCEPTED_V484=new Set(['accepted','already_processed','accepted_duplicate','deleted_manually','tombstoned']);
const PONTAJ_FINAL_REJECTED_V484=new Set(['rejected','cancelled','retired']);

function openPontajDbV484(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(PONTAJ_DB_V484,PONTAJ_DB_VERSION_V484);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(PONTAJ_ACTIVE_STORE_V484)){
        const store=db.createObjectStore(PONTAJ_ACTIVE_STORE_V484,{keyPath:'requestId'});
        store.createIndex('nextAttemptAt','nextAttemptAt',{unique:false});
      }
      if(!db.objectStoreNames.contains(PONTAJ_META_STORE_V484))db.createObjectStore(PONTAJ_META_STORE_V484,{keyPath:'key'});
      if(!db.objectStoreNames.contains(PONTAJ_TERMINAL_STORE_V484)){
        const store=db.createObjectStore(PONTAJ_TERMINAL_STORE_V484,{keyPath:'requestId'});
        store.createIndex('terminalAt','terminalAt',{unique:false});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('IndexedDB open failed'));
  });
}

function idbRequestV484(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function idbTxV484(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('IndexedDB transaction aborted'));});}

async function readActiveActionsV484(){
  const db=await openPontajDbV484();
  const tx=db.transaction(PONTAJ_ACTIVE_STORE_V484,'readonly');const done=idbTxV484(tx);
  const rows=await idbRequestV484(tx.objectStore(PONTAJ_ACTIVE_STORE_V484).getAll());
  await done;db.close();return rows||[];
}

async function patchActiveActionV484(requestId,patch){
  const db=await openPontajDbV484();
  const tx=db.transaction(PONTAJ_ACTIVE_STORE_V484,'readwrite');const done=idbTxV484(tx);
  const store=tx.objectStore(PONTAJ_ACTIVE_STORE_V484);
  const item=await idbRequestV484(store.get(requestId));
  let updated=null;
  if(item){updated=Object.assign({},item,patch||{},{updatedAt:Date.now()});store.put(updated);}
  await done;db.close();return updated;
}

async function acquireSwLeaseV484(){
  const db=await openPontajDbV484();
  const tx=db.transaction(PONTAJ_META_STORE_V484,'readwrite');const done=idbTxV484(tx);
  const store=tx.objectStore(PONTAJ_META_STORE_V484);
  const current=await idbRequestV484(store.get(PONTAJ_LEASE_KEY_V484));
  const now=Date.now();let acquired=false;
  if(!current||Number(current.expiresAt||0)<=now||current.owner===PONTAJ_SW_OWNER_V484){
    store.put({key:PONTAJ_LEASE_KEY_V484,owner:PONTAJ_SW_OWNER_V484,expiresAt:now+PONTAJ_SW_LEASE_MS_V484,updatedAt:now});acquired=true;
  }
  await done;db.close();return acquired;
}

async function renewSwLeaseV484(){
  const db=await openPontajDbV484();
  const tx=db.transaction(PONTAJ_META_STORE_V484,'readwrite');const done=idbTxV484(tx);
  const store=tx.objectStore(PONTAJ_META_STORE_V484);
  const current=await idbRequestV484(store.get(PONTAJ_LEASE_KEY_V484));let renewed=false;
  if(current&&current.owner===PONTAJ_SW_OWNER_V484){store.put(Object.assign({},current,{expiresAt:Date.now()+PONTAJ_SW_LEASE_MS_V484,updatedAt:Date.now()}));renewed=true;}
  await done;db.close();return renewed;
}

async function releaseSwLeaseV484(){
  const db=await openPontajDbV484();
  const tx=db.transaction(PONTAJ_META_STORE_V484,'readwrite');const done=idbTxV484(tx);
  const store=tx.objectStore(PONTAJ_META_STORE_V484);
  const current=await idbRequestV484(store.get(PONTAJ_LEASE_KEY_V484));
  if(current&&current.owner===PONTAJ_SW_OWNER_V484)store.delete(PONTAJ_LEASE_KEY_V484);
  await done;db.close();
}

async function terminalizeActionV484(item,status,ack){
  const terminal={requestId:item.requestId,status,terminalAt:Date.now(),action:item.snapshot&&item.snapshot.action||'',clientTimestamp:item.snapshot&&item.snapshot.clientTimestamp||'',name:item.snapshot&&item.snapshot.name||'',reason:String(ack&&((ack.reason||ack.message))||''),rowNumber:Number(ack&&ack.rowNumber)||null,source:'service-worker-v4.9.7',attempts:Number(item.attempts||0)};
  const db=await openPontajDbV484();
  const tx=db.transaction([PONTAJ_ACTIVE_STORE_V484,PONTAJ_TERMINAL_STORE_V484],'readwrite');const done=idbTxV484(tx);
  tx.objectStore(PONTAJ_ACTIVE_STORE_V484).delete(item.requestId);
  tx.objectStore(PONTAJ_TERMINAL_STORE_V484).put(terminal);
  await done;db.close();
}

function compareActionsV484(a,b){
  const ax=Number(a&&a.snapshot&&a.snapshot.clientTimestampMs||0),bx=Number(b&&b.snapshot&&b.snapshot.clientTimestampMs||0);
  if(ax!==bx)return ax-bx;
  const as=String(a&&a.snapshot&&(a.snapshot.localSequence||a.snapshot.clientSequence)||''),bs=String(b&&b.snapshot&&(b.snapshot.localSequence||b.snapshot.clientSequence)||'');
  return as.localeCompare(bs)||String(a.requestId||'').localeCompare(String(b.requestId||''));
}

async function endpointV484(){
  const url=new URL('./config.json?sw_sync='+Date.now(),self.registration.scope);
  const response=await fetch(url.toString(),{cache:'no-store'});
  if(!response.ok)throw new Error('CONFIG_HTTP_'+response.status);
  const cfg=await response.json();
  const endpoint=String(cfg.syncEndpoint||cfg.stateEndpoint||cfg.guardEndpoint||'').replace(/\?.*$/,'').trim();
  if(!/^https:\/\/script\.google\.com\/macros\/s\//i.test(endpoint))throw new Error('SYNC_ENDPOINT_INVALID');
  return endpoint;
}

function actionPayloadV484(item){
  const s=item.snapshot||{},g=Object.assign({},s.gps||{},item.enrichment&&item.enrichment.gps||{});
  const hasCoordinates=Number.isFinite(Number(g.lat))&&Number.isFinite(Number(g.lon));
  const notesBase=String(s.notesPayload||'').trim();
  const markers='[[REQUEST_ID::'+s.requestId+']] [[CLIENT_TS::'+s.clientTimestamp+']] [[CLIENT_SEQUENCE::'+String(s.localSequence||s.clientSequence||'')+']]';
  return {fn:'offlineActionV48',protocol:PONTAJ_PROTOCOL_V484,protocolVersion:'4.8',version:BUILD,requestId:s.requestId,REQUEST_ID:s.requestId,action:String(s.action||''),clientTimestamp:s.clientTimestamp,clientTimestampMs:Number(s.clientTimestampMs),timestamp:s.clientTimestamp,localSequence:String(s.localSequence||s.clientSequence||''),clientSequence:String(s.localSequence||s.clientSequence||''),createdAt:new Date(Number(s.createdAt||s.clientTimestampMs||Date.now())).toISOString(),createdAtMs:Number(s.createdAt||s.clientTimestampMs||Date.now()),clientTimezone:String(s.clientTimezone||'Europe/Bucharest'),clientUtcOffsetMinutes:Number(s.clientUtcOffsetMinutes||0),name:String(s.name||''),department:String(s.department||''),activity:String(s.activity||''),location:String(s.location||''),project:String(s.project||''),notes:(notesBase?notesBase+' ':'')+markers,latitude:hasCoordinates?String(g.lat):'',longitude:hasCoordinates?String(g.lon):'',accuracy:g.acc==null?'':String(g.acc),gpsCapturedAt:g.capturedAt?new Date(Number(g.capturedAt)).toISOString():'',device:String(s.device||''),mapsLink:hasCoordinates?'https://maps.google.com/?q='+g.lat+','+g.lon:''};
}

async function postActionV484(endpoint,item){
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),25000);
  try{
    const response=await fetch(endpoint+'?fn=offlineActionV48',{method:'POST',cache:'no-store',redirect:'follow',credentials:'omit',headers:{'Content-Type':'text/plain;charset=utf-8','Accept':'application/json'},body:JSON.stringify(actionPayloadV484(item)),signal:ctrl.signal});
    const text=await response.text();
    if(!response.ok)throw new Error('HTTP_'+response.status);
    if(/^\s*</.test(text))throw new Error('ACK_HTML_REJECTED');
    const ack=JSON.parse(text);const status=String(ack&&ack.status||'').toLowerCase();
    if(!ack||ack.protocol!==PONTAJ_PROTOCOL_V484||String(ack.requestId||ack.REQUEST_ID||'')!==item.requestId)throw new Error('ACK_INVALID');
    if(!PONTAJ_FINAL_ACCEPTED_V484.has(status)&&!PONTAJ_FINAL_REJECTED_V484.has(status))throw new Error('ACK_STATUS_INVALID');
    return Object.assign({},ack,{status});
  }finally{clearTimeout(timer);}
}

async function notifyClientsV484(payload){
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  clients.forEach(client=>client.postMessage(Object.assign({type:'PONTAJ_SYNC_UPDATED',build:BUILD},payload||{})));
}

function sleepV491(ms){return new Promise(resolve=>setTimeout(resolve,Math.max(0,Number(ms||0))));}

async function acquireSwLeaseWithRetryV491(maxWaitMs){
  const started=Date.now(),limit=Math.max(0,Number(maxWaitMs||0));
  do{
    if(await acquireSwLeaseV484())return true;
    if(Date.now()-started>=limit)return false;
    await sleepV491(500);
  }while(true);
}

async function scheduleNextBackgroundSyncV491(){
  try{
    if(self.registration&&self.registration.sync&&typeof self.registration.sync.register==='function'){
      await self.registration.sync.register(PONTAJ_SYNC_TAG_V484);
      return true;
    }
  }catch(_){ }
  return false;
}

async function processPontajQueueV484(options){
  const opts=options||{},soft=!!opts.soft,startedAt=Date.now(),MAX_RUN_MS=28000;
  let initial=(await readActiveActionsV484()).filter(item=>item&&!item.migrationProbeOnly).sort(compareActionsV484);
  if(!initial.length)return {ok:true,empty:true};
  if(!await acquireSwLeaseWithRetryV491(soft?1500:12000)){
    await scheduleNextBackgroundSyncV491();
    if(soft)return {ok:false,busy:true};
    throw new Error('SYNC_LEASE_BUSY');
  }
  try{
    const endpoint=await endpointV484();
    while(Date.now()-startedAt<MAX_RUN_MS){
      if(!await renewSwLeaseV484())throw new Error('SYNC_LEASE_LOST');
      let rows=(await readActiveActionsV484()).filter(item=>item&&!item.migrationProbeOnly).sort(compareActionsV484);
      if(!rows.length){await notifyClientsV484({status:'queue-empty'});return {ok:true,empty:true};}
      let item=rows[0];const now=Date.now();
      if(item.status==='sending'&&Number(item.sendingExpiresAt||0)>now&&item.sendingOwner!==PONTAJ_SW_OWNER_V484){
        // Pagina poate fi suspendată exact în timpul requestului. Așteptăm puțin
        // să apară ACK-ul; dacă lease-ul expiră, retrimiterea are același ID și
        // este sigură datorită idempotency-ului server-side.
        const remaining=Math.min(1500,Math.max(150,Number(item.sendingExpiresAt||0)-now));
        await sleepV491(remaining);
        continue;
      }
      if(item.status==='failed-retryable'||item.status==='sending')item=await patchActiveActionV484(item.requestId,{status:'queued',sendingOwner:'',sendingExpiresAt:0,nextAttemptAt:0});
      const attempts=Number(item.attempts||0)+1;
      item=await patchActiveActionV484(item.requestId,{status:'sending',attempts,lastAttemptAt:now,sendingOwner:PONTAJ_SW_OWNER_V484,sendingExpiresAt:now+PONTAJ_SW_LEASE_MS_V484,nextAttemptAt:now+PONTAJ_SW_LEASE_MS_V484,lastErrorCode:'',lastErrorMessage:''});
      try{
        const ack=await postActionV484(endpoint,item);
        await terminalizeActionV484(item,ack.status,ack);
        await notifyClientsV484({requestId:item.requestId,status:ack.status,name:item.snapshot&&item.snapshot.name||''});
      }catch(error){
        const wait=Math.min(300000,2000*Math.pow(2,Math.min(8,Math.max(0,attempts-1))));
        await patchActiveActionV484(item.requestId,{status:'failed-retryable',sendingOwner:'',sendingExpiresAt:0,nextAttemptAt:Date.now()+wait,lastErrorCode:String(error&&error.message||error).slice(0,80),lastErrorMessage:'Sincronizarea din fundal va fi reluata.'});
        await notifyClientsV484({requestId:item.requestId,status:'failed-retryable',name:item.snapshot&&item.snapshot.name||''});
        await scheduleNextBackgroundSyncV491();
        if(soft)return {ok:false,error:String(error&&error.message||error)};
        throw error;
      }
    }
    await scheduleNextBackgroundSyncV491();
    return {ok:false,deferred:true};
  }finally{await releaseSwLeaseV484().catch(()=>{});}
}

self.addEventListener('sync',event=>{
  if(event.tag===PONTAJ_SYNC_TAG_V484)event.waitUntil(processPontajQueueV484({reason:'background-sync'}));
});

self.addEventListener('message',event=>{
  const data=event.data||{};
  if(data.type==='PONTAJ_SYNC_NOW')event.waitUntil(processPontajQueueV484({soft:true,reason:data.reason||'message'}).catch(()=>{}));
});

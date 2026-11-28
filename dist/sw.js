const CACHE='kharcha-v13';
const ASSETS=['./','index.html','styles.css','app.js','sync.js','firebase-config.js','manifest.webmanifest','icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>Promise.all(ASSETS.map(async asset=>{
  const response=await fetch(asset,{cache:'no-store'});
  if(!response.ok)throw new Error(`Could not cache ${asset}`);
  await cache.put(asset,response);
}))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('kharcha-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin){
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{
    if(response&&response.ok){
      const copy=response.clone();
      event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));
    }
    return response;
  }).catch(()=>caches.match(event.request,{ignoreSearch:true}).then(r=>{
    if(r)return r;
    if(event.request.mode==='navigate')return caches.match('./index.html').then(m=>m||caches.match('./'));
    return caches.match('./');
  })));
});

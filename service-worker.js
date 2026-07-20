const CACHE_NAME = 'servelect-pontaj-offline-v4-20260719';
const CORE = [
  './', './index.html', './config.json', './manifest.webmanifest',
  './favicon.png', './background.jpg', './departments.csv', './employees.csv',
  './employee_norms.csv', './projects.csv', './locations.csv', './roster_template.csv'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const networkFirst = /(?:index\.html|config\.json|\.csv)$/i.test(url.pathname) || req.mode === 'navigate';
  if (networkFirst){
    event.respondWith(
      fetch(req).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return resp;
      }).catch(async () => (await caches.match(req)) || (await caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      return resp;
    }))
  );
});

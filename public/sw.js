const CACHE = 'kaixu-v10';
const PRECACHE = [
  '/',
  '/index.html',
  '/gateway.html',
  '/Intro.html',
  '/InnerSanctum.html',
  '/kAIxUchat.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

const OFFLINE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Offline — kAIxU</title><style>body{font-family:Arial,sans-serif;background:#05050a;color:#f0f0f8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0} .card{padding:20px;border:1px solid rgba(255,255,255,.15);border-radius:12px;background:rgba(255,255,255,.04);box-shadow:0 20px 60px rgba(0,0,0,.45);max-width:360px;text-align:center} h1{margin:0 0 10px;font-size:20px} p{margin:0;color:#b8b8cc}</style></head><body><div class="card"><h1>Offline</h1><p>No network. Cached pages are still available.</p></div></body></html>`;

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept API calls — always go live to the Worker
  if (url.hostname.includes('workers.dev')) return;

  // Network-first for navigation, cache-first for assets
  if (e.request.mode === 'navigate') {
    const bustedUrl = new URL(e.request.url);
    bustedUrl.searchParams.set('sw-cache', CACHE);
    const bustedRequest = new Request(bustedUrl.toString(), {
      method: e.request.method,
      headers: e.request.headers,
      mode: e.request.mode,
      credentials: e.request.credentials,
      redirect: e.request.redirect,
      cache: 'no-store'
    });

    e.respondWith(
      fetch(bustedRequest)
        .then(r => {
          const clone = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return r;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('/kAIxUchat.html') || new Response(OFFLINE_HTML,{headers:{'Content-Type':'text/html'}})))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(r => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return r;
        });
      })
    );
  }
});

const CACHE = 'kaixu-v4';
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
        .catch(() => caches.match(e.request).then(r => r || caches.match('/kAIxUchat.html')))
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

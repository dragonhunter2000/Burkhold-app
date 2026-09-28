// Burkhold Apps service worker: lets the site and dashboard open with no signal.
// Only same-origin pages/files are cached. API calls (a different origin) are never
// cached, so job data is never stored here. The dashboard keeps its own on-device copy.
const CACHE = 'burkhold-v2';
const APP_SHELL = ['/', '/index.html', '/dashboard.html'];

// Store a clean copy (a cached redirected response can't be used to answer a page load)
async function cleanCopy(response){
  if(!response.redirected) return response;
  return new Response(await response.blob(), {status: response.status, statusText: response.statusText, headers: response.headers});
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(APP_SHELL.map(async url => {
      try {
        const res = await fetch(url, {cache: 'reload'});
        if(res.ok) await cache.put(url, await cleanCopy(res));
      } catch(e){ /* offline during install: cached on next visit */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for(const key of await caches.keys()) if(key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if(req.method !== 'GET' || url.origin !== self.location.origin) return;  // API + fonts: straight to network

  // Network first so updates show immediately; fall back to the cached copy when offline.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if(res.ok) cache.put(req, await cleanCopy(res.clone()));
      return res;
    } catch(e){
      const hit = await cache.match(req, {ignoreSearch: true});
      if(hit) return hit;
      if(req.mode === 'navigate'){
        const page = url.pathname.startsWith('/dashboard') ? '/dashboard.html' : '/index.html';
        const fallback = await cache.match(page);
        if(fallback) return fallback;
      }
      return new Response('You are offline and this page has not been saved yet.', {status: 503, headers: {'Content-Type': 'text/plain'}});
    }
  })());
});

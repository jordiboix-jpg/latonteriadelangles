// Service Worker — La Tonteria de l'Anglès
const CACHE = 'tonteria-v75';
const PRECACHE = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,400;1,700&family=Source+Serif+4:ital,opsz,wght@0,8..60,300;0,8..60,400;0,8..60,600;1,8..60,400&family=DM+Mono:wght@400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
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

  // Ignorar esquemes no-http (chrome-extension, etc.)
  if (!url.protocol.startsWith('http')) return;

  // Supabase: sempre xarxa, sense cache
  if (url.hostname.includes('supabase.co')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', {status: 503})));
    return;
  }

  // index.html: SEMPRE xarxa primer — mai servir versió antiga de la cache
  // (cache:'no-cache' evita la còpia de 10 minuts que guarda el navegador amb GitHub Pages)
  if (url.pathname === '/' || url.pathname === '/index.html') {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' })
        .then(r => {
          if (r && r.status === 200) {
            const c = r.clone();
            caches.open(CACHE).then(cache => cache.put(e.request, c));
          }
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // sw.js: sempre xarxa (per permetre actualitzacions del SW)
  if (url.pathname === '/sw.js') {
    e.respondWith(fetch(e.request));
    return;
  }

  // Tile de Leaflet (mapa): network-first amb fallback cache
  if (url.hostname.includes('tile.openstreetmap')) {
    e.respondWith(
      fetch(e.request)
        .then(r => { const c = r.clone(); caches.open(CACHE).then(cache => cache.put(e.request, c)); return r; })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Resta (fonts, icones, libs): cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(r => {
        if (r && r.status === 200 && r.type !== 'opaque') {
          const c = r.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, c));
        }
        return r;
      });
    })
  );
});

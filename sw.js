// Service worker: deixa o app abrir sem internet.
// Quando publicar uma versão nova, troque o número em CACHE.
const CACHE = 'pgm-v1.1.0';
const ARQUIVOS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'libs/jspdf.umd.min.js',
  'manifest.webmanifest',
  'icons/selo-128.png',
  'icons/selo-512.png',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/favicon-32.png',
  'fonts/Jost_400Regular.ttf',
  'fonts/Jost_500Medium.ttf',
  'fonts/Jost_600SemiBold.ttf',
  'fonts/PinyonScript_400Regular.ttf'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Responde do cache na hora e atualiza em segundo plano.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(e.request, { ignoreSearch: true }).then((cacheado) => {
        const rede = fetch(e.request)
          .then((resp) => {
            if (resp && resp.ok) cache.put(e.request, resp.clone());
            return resp;
          })
          .catch(() => cacheado);
        return cacheado || rede;
      })
    )
  );
});

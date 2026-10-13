const CACHE_VERSION = 'v2';
const CACHE_NAME = 'jomehbazar-' + CACHE_VERSION;
const urlsToCache = [
  '/',
  '/index.html',
  '/car.html',
  '/submit.html',
  '/about.html',
  '/admin.html',
  '/install.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  // فوراً فعال شو، منتظر بسته شدن تب‌های قبلی نمون
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('activate', (event) => {
  // همه کش‌های قدیمی رو پاک کن
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // فقط GET
  if (event.request.method !== 'GET') return;
  // API رو کش نکن
  if (event.request.url.includes('/api/')) return;

  // برای HTML و فایل‌های اصلی: network-first
  // برای بقیه: cache-first
  const url = new URL(event.request.url);
  const isHtml = url.pathname === '/' || url.pathname.endsWith('.html');
  const isRoot = url.pathname === '/';

  if (isHtml || isRoot) {
    // network-first: اول از شبکه بگیر، اگه نشد از کش
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match('/index.html')))
    );
  } else {
    // cache-first
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
          return response;
        });
      })
    );
  }
});

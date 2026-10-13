const CACHE_NAME = 'jomehbazar-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/car.html',
  '/submit.html',
  '/about.html',
  '/admin.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // فقط درخواست‌های GET رو کش کن
  if (event.request.method !== 'GET') return;
  // API ها رو کش نکن
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).catch(() => caches.match('/index.html'));
    })
  );
});

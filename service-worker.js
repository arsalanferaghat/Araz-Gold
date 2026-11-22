
const CACHE_NAME = 'araz-gold-v1';

const APP_FILES = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json'
];

// نصب و ذخیره فایل‌های اصلی برنامه
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_FILES))
            .then(() => self.skipWaiting())
    );
});

// فعال‌سازی نسخه جدید و پاک‌سازی کش‌های قدیمی
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// مدیریت درخواست‌ها در حالت آنلاین و آفلاین
self.addEventListener('fetch', event => {
    const request = event.request;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // درخواست‌های خارج از دامنه برنامه
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        fetch(request)
            .then(response => {
                if (response && response.status === 200) {
                    const copy = response.clone();

                    caches.open(CACHE_NAME)
                        .then(cache => cache.put(request, copy));
                }

                return response;
            })
            .catch(async () => {
                const cached = await caches.match(request);

                if (cached) return cached;

                if (request.mode === 'navigate') {
                    return caches.match('./index.html');
                }

                return new Response('این فایل در حالت آفلاین موجود نیست.', {
                    status: 503,
                    headers: {
                        'Content-Type': 'text/plain; charset=utf-8'
                    }
                });
            })
    );
});

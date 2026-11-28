
const CACHE_NAME = 'araz-gold-v23';

const PRICE_API_HOST = 'araz-gold-price.arsalanfaraghat8.workers.dev';

const APP_FILES = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json'
];

// نصب نسخه جدید
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_FILES))
            .then(() => self.skipWaiting())
    );
});

// فعال‌سازی نسخه جدید و حذف کش‌های قدیمی برنامه
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys =>
                Promise.all(
                    keys
                        .filter(key =>
                            key.startsWith('araz-gold-') &&
                            key !== CACHE_NAME
                        )
                        .map(key => caches.delete(key))
                )
            )
            .then(() => self.clients.claim())
    );
});

// مدیریت درخواست‌ها
self.addEventListener('fetch', event => {
    const request = event.request;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // قیمت آنلاین: همیشه شبکه، بدون استفاده از کش
    if (url.hostname === PRICE_API_HOST) {
        event.respondWith(
            fetch(request, {
                cache: 'no-store'
            })
        );
        return;
    }

    // فقط فایل‌های خود برنامه
    if (url.origin !== self.location.origin) return;

    // فایل‌های برنامه: ابتدا شبکه، سپس کش
    event.respondWith(
        fetch(request, {
            cache: 'no-store'
        })
        .then(response => {
            if (response && response.status === 200) {
                const copy = response.clone();

                event.waitUntil(
                    caches.open(CACHE_NAME)
                        .then(cache => cache.put(request, copy))
                );
            }

            return response;
        })
        .catch(async () => {
            const cached = await caches.match(request);

            if (cached) return cached;

            if (request.mode === 'navigate') {
                const fallback = await caches.match('./index.html');

                if (fallback) return fallback;
            }

            return new Response(
                'این فایل در حالت آفلاین موجود نیست.',
                {
                    status: 503,
                    headers: {
                        'Content-Type': 'text/plain; charset=utf-8'
                    }
                }
            );
        })
    );
});

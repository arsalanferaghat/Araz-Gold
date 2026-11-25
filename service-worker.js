
const CACHE_NAME = 'araz-gold-v13';

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

// فعال‌سازی و حذف کش نسخه‌های قدیمی
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

// مدیریت درخواست‌ها
self.addEventListener('fetch', event => {
    const request = event.request;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // درخواست قیمت آنلاین؛ همیشه از شبکه
    if (
        url.hostname === 'araz-gold-price.arsalanfaraghat8.workers.dev'
    ) {
        event.respondWith(
            fetch(request, { cache: 'no-store' })
        );
        return;
    }

    // فقط فایل‌های خود برنامه
    if (url.origin !== self.location.origin) return;

    // فایل‌های اصلی: ابتدا شبکه، سپس کش
    event.respondWith(
        fetch(request, { cache: 'no-store' })
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

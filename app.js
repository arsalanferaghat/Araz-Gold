
async function fetchOnlinePrice() {

console.log('ARAZ GOLD: تابع دریافت قیمت اجرا شد');

console.log('وضعیت دریافت:', {
    priceMode: priceMode,
    online: navigator.onLine,
    requestRunning: priceRequestRunning
});

if (priceMode !== 'online') {
    console.warn('دریافت متوقف شد: حالت قیمت آنلاین نیست');
    return false;
}

if (!navigator.onLine) {
    console.warn('دریافت متوقف شد: اینترنت در دسترس نیست');
    return false;
}

if (priceRequestRunning) {
    console.warn('دریافت متوقف شد: درخواست قبلی هنوز در حال اجراست');
    return false;
}

    priceRequestRunning = true;

    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
        controller.abort();
    }, 15000);

    updatePriceStatus(
        'در حال دریافت قیمت‌های جدید...',
        'loading'
    );

    try {

        // جلوگیری از دریافت پاسخ کش‌شده
        // بدون ارسال Header اضافی و ایجاد خطای CORS

        const requestUrl =
            PRICE_API + '?_=' + Date.now();

        const response = await fetch(requestUrl, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(
                'HTTP ' + response.status
            );
        }

        const data = await response.json();

        if (
            data.success !== true ||
            !Number.isFinite(Number(data.gram18)) ||
            Number(data.gram18) <= 0
        ) {
            throw new Error(
                'Invalid gold price data'
            );
        }

        const oldPrice = settings.price;

        const newPrice =
            Number(data.gram18);

        // قیمت طلای ۱۸ عیار
        settings.price = newPrice;

        lastSyncedPrice = newPrice;

        // قیمت دلار
        const newDollar = Number(data.usd);

        if (
            Number.isFinite(newDollar) &&
            newDollar > 0
        ) {
            settings.dollar = newDollar;
        }

        // قیمت اونس
        const newOunce = Number(data.ounce);

        if (
            Number.isFinite(newOunce) &&
            newOunce > 0
        ) {
            settings.ounce = newOunce;
        }

        // قیمت تتر
        const newTether = Number(data.tether);

        if (
            Number.isFinite(newTether) &&
            newTether > 0
        ) {
            settings.tether = newTether;
        }

        // زمان آخرین به‌روزرسانی منبع
        priceUpdated =
            data.updatedAt ||
            new Date().toISOString();

        priceSource = 'Talasanj';

        // ذخیره اطلاعات
        savePriceData();

        // همگام‌سازی قیمت‌ها
        syncPriceInputs(
            oldPrice,
            newPrice
        );

        // به‌روزرسانی نمایش
        render();

        updatePriceStatus(
            'قیمت‌ها با موفقیت دریافت شدند',
            'success'
        );

        // گزارش برای بررسی در Console
        console.log(
            'ARAZ GOLD PRICE UPDATE:',
            {
                receivedAt:
                    new Date().toISOString(),

                sourceUpdatedAt:
                    data.updatedAt,

                goldPrice:
                    data.gram18,

                dollar:
                    data.usd,

                ounce:
                    data.ounce,

                tether:
                    data.tether
            }
        );

        return true;

    } catch (error) {

        console.warn(
            'ARAZ GOLD PRICE ERROR:',
            error
        );

        updatePriceStatus(
            error.name === 'AbortError'
                ? 'مهلت دریافت قیمت تمام شد؛ تلاش مجدد انجام می‌شود'
                : 'دریافت قیمت ناموفق بود؛ تلاش مجدد انجام می‌شود',
            'error'
        );

        render();

        return false;

    } finally {

        clearTimeout(timeoutId);

        priceRequestRunning = false;
    }
}

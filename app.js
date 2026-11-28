'use strict';

/* =========================================
   ARAZ GOLD - Application Core
   Online Gold Price + Offline Manual Mode
   ========================================= */

const $ = id => document.getElementById(id);

const PRICE_API =
    'https://araz-gold-price.arsalanfaraghat8.workers.dev/';

const PRICE_REFRESH_INTERVAL = 60000;

const STORAGE = {
    trades: 'ag_trades',
    price: 'ag_price',
    ounce: 'ag_ounce',
    dollar: 'ag_dollar',
    tether: 'ag_tether',
    wage: 'ag_wage',
    profit: 'ag_profit',
    tax: 'ag_tax',
    calculations: 'ag_calculations',
    priceMode: 'ag_price_mode',
    priceUpdated: 'ag_price_updated',
    priceSource: 'ag_price_source'
};

const money = value =>
    new Intl.NumberFormat('fa-IR', {
        maximumFractionDigits: 0
    }).format(Number(value) || 0);

const decimal = value =>
    new Intl.NumberFormat('fa-IR', {
        maximumFractionDigits: 3
    }).format(Number(value) || 0);

const num = value => {
    if (typeof value === 'string') {
        value = value
            .replace(/[٬,]/g, '')
            .replace(/[٫]/g, '.')
            .replace(/[۰-۹]/g, d =>
                String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
            )
            .replace(/[٠-٩]/g, d =>
                String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))
            );
    }

    return Number(value) || 0;
};

function readStorage(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : JSON.parse(value);
    } catch {
        return fallback;
    }
}

function writeStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.warn('Storage error:', error);
    }
}

let trades = readStorage(STORAGE.trades, []);
let calculations = readStorage(STORAGE.calculations, []);


let settings = {
    price: num(readStorage(STORAGE.price, 0)),
    ounce: num(readStorage(STORAGE.ounce, 0)),
    dollar: num(readStorage(STORAGE.dollar, 0)),
    tether: num(readStorage(STORAGE.tether, 0)),
    wage: num(readStorage(STORAGE.wage, 0)),
    profit: num(readStorage(STORAGE.profit, 0)),
    tax: num(readStorage(STORAGE.tax, 0))
};

let priceMode = readStorage(STORAGE.priceMode, 'online');
let priceUpdated = readStorage(STORAGE.priceUpdated, '');
let priceSource = readStorage(STORAGE.priceSource, 'manual');

let lastSyncedPrice = settings.price;
let currentCalculation = null;
let priceRequestRunning = false;
let priceTimer = null;

/* =========================================
   GENERAL FUNCTIONS
   ========================================= */

function notify(message) {
    alert(message);
}

function safeText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function safeValue(id, value) {
    const el = $(id);
    if (el) el.value = value ?? '';
}

function safeHTML(id, value) {
    const el = $(id);
    if (el) el.innerHTML = value;
}

function saveAll() {
    writeStorage(STORAGE.trades, trades);
    writeStorage(STORAGE.calculations, calculations);

    Object.keys(settings).forEach(key => {
        writeStorage(STORAGE[key], settings[key]);
    });

    render();
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

function formatDate() {
    return new Date().toLocaleString('fa-IR');
}

function formatPriceDate(value) {
    if (!value) return 'زمان دریافت مشخص نیست';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return 'زمان دریافت نامشخص';
    }

    return date.toLocaleString('fa-IR');
}

function getBalance() {
    return trades.reduce((sum, trade) => {
        return sum + (
            trade.type === 'buy'
                ? num(trade.weight)
                : -num(trade.weight)
        );
    }, 0);
}

function getTotalBuy() {
    return trades
        .filter(t => t.type === 'buy')
        .reduce((sum, t) => sum + num(t.total), 0);
}

function getTotalSell() {
    return trades
        .filter(t => t.type === 'sell')
        .reduce((sum, t) => sum + num(t.total), 0);
}

/* =========================================
   CENTRAL GOLD PRICE SYSTEM
   ========================================= */

function getGoldPrice() {
    return num(settings.price);
}

function savePriceData() {
    writeStorage(STORAGE.price, settings.price);
    writeStorage(STORAGE.ounce, settings.ounce);
    writeStorage(STORAGE.dollar, settings.dollar);
    writeStorage(STORAGE.tether, settings.tether);
    writeStorage(STORAGE.priceUpdated, priceUpdated);
    writeStorage(STORAGE.priceSource, priceSource);
    writeStorage(STORAGE.priceMode, priceMode);
}

function syncPriceInputs(oldPrice, newPrice) {
    const priceFields = [
        'unit-price',
        'buy-price',
        'sell-price',
        'exchange-price'
    ];

    priceFields.forEach(id => {
        const el = $(id);

        if (!el) return;

        const current = num(el.value);

        const isEmpty = !el.value || current <= 0;

        const matchesPrevious =
            oldPrice > 0 &&
            Math.abs(current - oldPrice) < 1;

        if (isEmpty || matchesPrevious) {
            el.value = newPrice;
        }
    });

    updateTradeTotal();
    updateCalculator();
}

/* =========================================
   ONLINE PRICE FETCH
   ========================================= */

async function fetchOnlinePrice() {
    if (
        priceMode !== 'online' ||
        !navigator.onLine ||
        priceRequestRunning
    ) {
        return false;
    }

    priceRequestRunning = true;

    updatePriceStatus('در حال دریافت قیمت‌ها...', 'loading');

    try {
        const response = await fetch(PRICE_API, {
            method: 'GET',
            cache: 'no-store',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }

        const data = await response.json();

        if (
            data.success !== true ||
            !Number.isFinite(Number(data.gram18)) ||
            Number(data.gram18) <= 0
        ) {
            throw new Error('Invalid gold price data');
        }

        const oldPrice = settings.price;
        const newPrice = Number(data.gram18);

        // قیمت طلای ۱۸ عیار
        settings.price = newPrice;
        lastSyncedPrice = newPrice;

        // نرخ آنلاین دلار
        const newDollar = Number(data.usd);

        if (
            Number.isFinite(newDollar) &&
            newDollar > 0
        ) {
            settings.dollar = newDollar;
        }

        // نرخ آنلاین اونس جهانی
        const newOunce = Number(data.ounce);

        if (
            Number.isFinite(newOunce) &&
            newOunce > 0
        ) {
            settings.ounce = newOunce;
        }

        // نرخ آنلاین تتر از نوبیتکس
        const newTether = Number(data.tether);

        if (
            Number.isFinite(newTether) &&
            newTether > 0
        ) {
            settings.tether = newTether;
        }

        // زمان و منبع دریافت
        priceUpdated = data.updatedAt || new Date().toISOString();
        priceSource = 'Talasanj';

        // ذخیره هر چهار قیمت
        savePriceData();

        // همگام‌سازی فیلدهای قیمت
        syncPriceInputs(oldPrice, newPrice);

        // به‌روزرسانی تمام قسمت‌ها
        render();

        updatePriceStatus(
            'هر چهار نرخ با موفقیت به‌روزرسانی شدند',
            'success'
        );

        return true;

    } catch (error) {
        console.warn('Online price error:', error);

        updatePriceStatus(
            settings.price > 0
                ? 'عدم دریافت نرخ جدید؛ آخرین قیمت‌های ذخیره‌شده نمایش داده می‌شوند'
                : 'دریافت قیمت ناموفق بود',
            'error'
        );

        render();

        return false;

    } finally {
        priceRequestRunning = false;
    }
}

/* =========================================
   PRICE STATUS
   ========================================= */

function updatePriceStatus(message, status) {
    const el = $('price-update-time');

    if (!el) return;

    el.textContent = message;
    el.dataset.status = status || '';
}

function setPriceMode(mode) {
    const oldPrice = settings.price;

    priceMode = mode;

    writeStorage(STORAGE.priceMode, priceMode);

    const input = $('setting-price');

    if (input) {
        input.readOnly = priceMode === 'online';
    }

    renderSettings();

    if (mode === 'online') {
        if (navigator.onLine) {
            fetchOnlinePrice();
        } else {
            updatePriceStatus(
                'آفلاین؛ آخرین قیمت‌های ذخیره‌شده نمایش داده می‌شوند',
                'error'
            );
        }
    } else {
        updatePriceStatus(
            'حالت دستی فعال است؛ قیمت را وارد و ذخیره کنید',
            'manual'
        );
    }

    syncPriceInputs(oldPrice, settings.price);

    renderDashboard();
}

function createPriceControls() {
    const target = $('price-update-time');

    if (!target || $('ag-price-controls')) return;

    const box = document.createElement('div');

    box.id = 'ag-price-controls';

    box.style.cssText = `
        display:flex;
        flex-wrap:wrap;
        align-items:center;
        gap:10px;
        margin-top:10px;
    `;

    box.innerHTML = `
        <button type="button" id="ag-price-mode"
            style="
                border:1px solid #b99243;
                background:#202326;
                color:#e6c16d;
                border-radius:9px;
                padding:9px 13px;
                cursor:pointer;
                font-family:inherit;
            ">
        </button>
    `;

    target.insertAdjacentElement('afterend', box);

    $('ag-price-mode')?.addEventListener('click', () => {
        setPriceMode(
            priceMode === 'online' ? 'manual' : 'online'
        );
    });

    updatePriceModeButton();
}

function updatePriceModeButton() {
    const button = $('ag-price-mode');

    if (!button) return;

    button.textContent = priceMode === 'online'
        ? 'حالت آنلاین فعال است • تغییر به دستی'
        : 'حالت دستی فعال است • تغییر به آنلاین';
}

function startPriceUpdates() {
    if (priceTimer) {
        clearInterval(priceTimer);
    }

    if (priceMode !== 'online') return;

    if (navigator.onLine) {
        fetchOnlinePrice();
    } else {
        updatePriceStatus(
            settings.price > 0
                ? 'آفلاین؛ آخرین قیمت‌های ذخیره‌شده'
                : 'بدون اینترنت و بدون قیمت ذخیره‌شده',
            'error'
        );
    }

    priceTimer = setInterval(() => {
        if (
            priceMode === 'online' &&
            navigator.onLine &&
            document.visibilityState === 'visible'
        ) {
            fetchOnlinePrice();
        }
    }, PRICE_REFRESH_INTERVAL);
}

/* =========================================
   NAVIGATION
   ========================================= */

function show(page) {
    document.querySelectorAll('.page').forEach(element => {
        element.classList.toggle('show', element.id === page);
    });

    document.querySelectorAll('.nav').forEach(element => {
        element.classList.toggle(
            'active',
            element.dataset.page === page
        );
    });

    const titles = {
        dashboard: 'داشبورد',
        trade: 'ثبت خرید و فروش',
        history: 'تاریخچه معاملات',
        calculator: 'ماشین‌حساب طلا',
        portfolio: 'دارایی من',
        settings: 'تنظیمات'
    };

    safeText('page-title', titles[page] || 'Araz Gold');
}

document.querySelectorAll('.nav[data-page]').forEach(button => {
    button.addEventListener('click', () => show(button.dataset.page));
});

document.querySelectorAll('[data-go]').forEach(button => {
    button.addEventListener('click', () => show(button.dataset.go));
});

/* =========================================
   DASHBOARD
   ========================================= */

function renderDashboard() {
    const balance = getBalance();
    const assetValue = balance * getGoldPrice();

    safeText('gold-balance', decimal(balance) + ' گرم');

    safeText(
        'asset-value',
        money(Math.max(0, assetValue)) + ' تومان'
    );

    safeText('trade-count', money(trades.length));

    // قیمت طلای ۱۸ عیار
    safeText(
        'hero-gold-price',
        settings.price > 0
            ? money(settings.price)
            : 'در انتظار دریافت قیمت'
    );

    safeText(
        'hero-price-status',
        priceMode === 'manual'
            ? '● حالت ورود دستی قیمت'
            : !navigator.onLine
                ? '● آفلاین؛ آخرین قیمت ذخیره‌شده'
                : priceSource === 'Talasanj'
                    ? '● دریافت خودکار قیمت آنلاین'
                    : '● در انتظار دریافت قیمت آنلاین'
    );

    safeText(
        'hero-price-updated',
        priceUpdated
            ? 'آخرین به‌روزرسانی: ' + formatPriceDate(priceUpdated)
            : 'هنوز قیمتی دریافت نشده است'
    );

    // قیمت اونس جهانی
    const ounceValue = settings.ounce > 0
        ? new Intl.NumberFormat('fa-IR', {
            maximumFractionDigits: 2
        }).format(settings.ounce)
        : 'ثبت نشده';

    // نرخ دلار
    const dollarValue = settings.dollar > 0
        ? money(settings.dollar)
        : 'ثبت نشده';

    // نمایش سه قیمت اصلی در بالای داشبورد
    safeText('hero-ounce-price', ounceValue);
    safeText('hero-dollar-price', dollarValue);

    // نمایش قیمت تتر
    safeText(
        'hero-tether-price',
        settings.tether > 0
            ? money(settings.tether)
            : 'ثبت

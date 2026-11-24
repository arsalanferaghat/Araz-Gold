
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

        // زمان و منبع دریافت
        priceUpdated = data.updatedAt || new Date().toISOString();
        priceSource = 'Talasanj';

        // ذخیره هر سه قیمت
        savePriceData();

        // همگام‌سازی فیلدهای قیمت
        syncPriceInputs(oldPrice, newPrice);

        // به‌روزرسانی تمام قسمت‌ها
        render();

        updatePriceStatus(
            'هر سه نرخ با موفقیت به‌روزرسانی شدند',
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

    // بازار ایران
    safeHTML(
        'iran-price',
        money(settings.price) +
        ' <small>تومان / گرم ۱۸ عیار</small>'
    );

    safeText(
        'iran-price-status',
        priceMode === 'online'
            ? (navigator.onLine ? 'قیمت آنلاین' : 'آخرین قیمت ذخیره‌شده')
            : 'قیمت دستی'
    );

    safeText(
        'iran-price-updated',
        priceUpdated
            ? formatPriceDate(priceUpdated)
            : 'هنوز قیمتی دریافت نشده است'
    );

    // بازار جهانی: اونس
    safeText(
        'global-ounce-price',
        ounceValue
    );

    // بازار ارز: دلار
    safeText(
        'global-dollar-price',
        dollarValue
    );

    // سازگاری با نسخه قبلی HTML
    safeText(
        'global-price',
        settings.ounce > 0
            ? money(settings.ounce) + ' دلار'
            : 'ثبت نشده'
    );

    safeText(
        'global-price-status',
        priceMode === 'online'
            ? (navigator.onLine
                ? 'قیمت آنلاین'
                : 'آخرین نرخ ذخیره‌شده')
            : 'قیمت دستی'
    );

    safeText('profit', '—');

    // آخرین معاملات
    const rows = [...trades].reverse();

    safeHTML(
        'recent-list',
        rows.length
            ? rows.slice(0, 5).map(t => `
                <div class="panel-head"
                     style="padding:10px 0;border-bottom:1px solid #303438">
                    <span>
                        ${t.type === 'buy' ? 'خرید' : 'فروش'}
                        • ${decimal(t.weight)} گرم
                    </span>
                    <b>${money(t.total)} تومان</b>
                </div>
            `).join('')
            : 'هنوز معامله‌ای ثبت نشده است.'
    );
}

/* =========================================
   HISTORY
   ========================================= */

function renderHistory() {
    const rows = [...trades].reverse();

    safeHTML(
        'history-body',
        rows.length
            ? rows.map(t => `
                <tr>
                    <td>${escapeHtml(t.date)}</td>
                    <td class="${t.type}">
                        ${t.type === 'buy' ? 'خرید' : 'فروش'}
                    </td>
                    <td>
                        ${t.market === 'iran' ? 'ایران' : 'جهانی'}
                    </td>
                    <td>${decimal(t.weight)} گرم</td>
                    <td>${money(t.unit)} تومان</td>
                    <td>${money(t.total)} تومان</td>
                    <td>${escapeHtml(t.note || '—')}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="7" class="empty">هنوز معامله‌ای ثبت نشده است.</td></tr>'
    );
}

/* =========================================
   PORTFOLIO
   ========================================= */

function renderPortfolio() {
    const balance = getBalance();

    safeText('portfolio-weight', decimal(balance) + ' گرم');

    safeText(
        'portfolio-value',
        money(Math.max(0, balance) * getGoldPrice()) + ' تومان'
    );

    safeText('portfolio-buy', money(getTotalBuy()) + ' تومان');
    safeText('portfolio-sell', money(getTotalSell()) + ' تومان');
}

/* =========================================
   SETTINGS
   ========================================= */

function renderSettings() {
    safeValue('setting-price', settings.price || '');
    safeValue('setting-ounce', settings.ounce || '');
    safeValue('setting-dollar', settings.dollar || '');
    safeValue('setting-wage', settings.wage || '');
    safeValue('setting-profit', settings.profit || '');
    safeValue('setting-tax', settings.tax || '');

    const priceInput = $('setting-price');

    if (priceInput) {
        priceInput.readOnly = priceMode === 'online';
    }

    if (priceMode === 'online') {
        updatePriceStatus(
            priceUpdated
                ? 'آخرین دریافت: ' + formatPriceDate(priceUpdated)
                : 'در انتظار دریافت قیمت آنلاین',
            'success'
        );
    } else {
        updatePriceStatus(
            'حالت دستی فعال است',
            'manual'
        );
    }

    updatePriceModeButton();
}

/* =========================================
   MAIN RENDER
   ========================================= */

function render() {
    renderDashboard();
    renderHistory();
    renderPortfolio();
    renderSettings();
}

/* =========================================
   TRADE FORM
   ========================================= */

function updateTradeTotal() {
    const weight = num($('weight')?.value);
    const unit = num($('unit-price')?.value);
    const fee = num($('fee')?.value);

    safeText(
        'trade-total',
        money(weight * unit + fee) + ' تومان'
    );
}

['weight', 'unit-price', 'fee'].forEach(id => {
    $(id)?.addEventListener('input', updateTradeTotal);
});

$('trade-form')?.addEventListener('submit', event => {
    event.preventDefault();

    const weight = num($('weight').value);
    const unit = num($('unit-price').value);
    const fee = num($('fee').value);
    const type = $('type').value;

    if (weight <= 0 || unit <= 0) {
        return notify('وزن و قیمت باید بیشتر از صفر باشند.');
    }

    if (type === 'sell' && weight > getBalance()) {
        return notify('موجودی ثبت‌شده برای این فروش کافی نیست.');
    }

    trades.push({
        id: crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now()),
        date: formatDate(),
        type,
        market: $('market').value,
        kind: $('kind').value,
        weight,
        unit,
        fee,
        total: weight * unit + fee,
        note: $('note').value
    });

    saveAll();

    event.target.reset();

    safeValue('fee', 0);
    safeValue('unit-price', getGoldPrice());

    updateTradeTotal();

    show('history');

    notify('معامله با موفقیت ثبت شد.');
});

/* =========================================
   GOLD CALCULATIONS
   ========================================= */

function purityPrice(price18, purity) {
    return price18 * (num(purity) / 750);
}

function rawGoldValue(weight, purity, price18) {
    return num(weight) * purityPrice(price18, price18 > 0 ? purity : 0);
}

function percentAmount(amount, percent) {
    return amount * num(percent) / 100;
}

function calculateBuy() {
    const weight = num($('buy-weight')?.value);
    const purity = num($('buy-purity')?.value);
    const price = num($('buy-price')?.value);
    const wage = num($('buy-wage')?.value);
    const profit = num($('buy-profit')?.value);
    const tax = num($('buy-tax')?.value);
    const extra = num($('buy-extra')?.value);

    if (weight <= 0 || purity <= 0 || price <= 0) {
        return {
            total: 0,
            details: 'لطفاً وزن، عیار و قیمت را وارد کنید.'
        };
    }

    const raw = rawGoldValue(weight, purity, price);
    const wageAmount = percentAmount(raw, wage);
    const profitAmount = percentAmount(raw + wageAmount, profit);
    const taxAmount = percentAmount(wageAmount + profitAmount, tax);

    const total = raw + wageAmount + profitAmount + taxAmount + extra;

    return {
        total,
        details: `
            ارزش طلای خام: ${money(raw)} تومان
            اجرت: ${money(wageAmount)} تومان
            سود فروشنده: ${money(profitAmount)} تومان
            مالیات: ${money(taxAmount)} تومان
            هزینه اضافی: ${money(extra)} تومان
        `
    };
}

function calculateSell() {
    const weight = num($('sell-weight')?.value);
    const purity = num($('sell-purity')?.value);
    const price = num($('sell-price')?.value);
    const deduction = num($('sell-deduction')?.value);
    const extra = num($('sell-extra')?.value);

    if (weight <= 0 || purity <= 0 || price <= 0) {
        return {
            total: 0,
            details: 'لطفاً وزن، عیار و قیمت را وارد کنید.'
        };
    }

    const raw = rawGoldValue(weight, purity, price);
    const deductionAmount = percentAmount(raw, deduction);
    const total = raw - deductionAmount - extra;

    return {
        total,
        details: `
            ارزش طلای خام: ${money(raw)} تومان
            کسورات: ${money(deductionAmount)} تومان
            هزینه اضافی: ${money(extra)} تومان
            مبلغ نهایی فروش: ${money(total)} تومان
        `
    };
}

function calculateExchange() {
    const oldWeight = num($('old-weight')?.value);
    const oldPurity = num($('old-purity')?.value);
    const newWeight = num($('new-weight')?.value);
    const newPurity = num($('new-purity')?.value);
    const price = num($('exchange-price')?.value);
    const wage = num($('exchange-wage')?.value);
    const profit = num($('exchange-profit')?.value);
    const tax = num($('exchange-tax')?.value);
    const extra = num($('exchange-extra')?.value);

    if (
        oldWeight <= 0 ||
        oldPurity <= 0 ||
        newWeight <= 0 ||
        newPurity <= 0 ||
        price <= 0
    ) {
        return {
            total: 0,
            details: 'لطفاً اطلاعات طلای قدیمی و جدید را کامل وارد کنید.'
        };
    }

    const oldValue = rawGoldValue(oldWeight, oldPurity, price);
    const newValue = rawGoldValue(newWeight, newPurity, price);

    const wageAmount = percentAmount(newValue, wage);
    const profitAmount = percentAmount(newValue + wageAmount, profit);
    const taxAmount = percentAmount(wageAmount + profitAmount, tax);

    const newTotal = newValue + wageAmount + profitAmount + taxAmount + extra;
    const difference = newTotal - oldValue;

    return {
        total: difference,
        details: `
            ارزش طلای قدیمی: ${money(oldValue)} تومان
            ارزش طلای جدید: ${money(newValue)} تومان
            اجرت: ${money(wageAmount)} تومان
            سود فروشنده: ${money(profitAmount)} تومان
            مالیات: ${money(taxAmount)} تومان
            هزینه اضافی: ${money(extra)} تومان
            مبلغ نهایی تعویض: ${money(difference)} تومان
        `
    };
}

/* =========================================
   CALCULATOR DISPLAY
   ========================================= */

function getActiveCalculation() {
    const active = document.querySelector('.calc-tab.active');
    const type = active?.dataset.calc || 'buy';

    if (type === 'sell') return calculateSell();
    if (type === 'exchange') return calculateExchange();

    return calculateBuy();
}

function updateCalculator() {
    const result = getActiveCalculation();

    currentCalculation = result;

    const active = document.querySelector('.calc-tab.active');
    const type = active?.dataset.calc || 'buy';

    const titles = {
        buy: 'مبلغ نهایی خرید',
        sell: 'مبلغ دریافتی فروش',
        exchange: 'مابه‌التفاوت تعویض'
    };

    safeText('calculator-result-title', titles[type]);

    safeText(
        'calculator-result',
        money(result.total) + ' تومان'
    );

    safeText('calculator-details', result.details);

    updateSellerComparison();
}

document.querySelectorAll('.calc-tab[data-calc]').forEach(tab => {
    tab.addEventListener('click', () => {
        const type = tab.dataset.calc;

        document.querySelectorAll('.calc-tab').forEach(item => {
            item.classList.toggle('active', item === tab);
        });

        document.querySelectorAll('.calc-section').forEach(section => {
            section.classList.toggle(
                'active',
                section.id === 'calc-' + type
            );

            section.classList.toggle(
                'show',
                section.id === 'calc-' + type
            );
        });

        updateCalculator();
    });
});

const calculatorInputs = [
    'buy-weight', 'buy-purity', 'buy-price',
    'buy-wage', 'buy-profit', 'buy-tax', 'buy-extra',

    'sell-weight', 'sell-purity', 'sell-price',
    'sell-deduction', 'sell-extra',

    'old-weight', 'old-purity', 'new-weight',
    'new-purity', 'exchange-price', 'exchange-wage',
    'exchange-profit', 'exchange-tax', 'exchange-extra'
];

calculatorInputs.forEach(id => {
    $(id)?.addEventListener('input', updateCalculator);
});

/* =========================================
   SELLER COMPARISON
   ========================================= */

function updateSellerComparison() {
    const sellerAmount = num($('seller-amount')?.value);

    if (sellerAmount <= 0 || !currentCalculation) {
        safeText('seller-difference', '—');
        safeText('seller-comparison', 'مبلغ طلافروش را وارد کنید.');
        return;
    }

    const difference = sellerAmount - currentCalculation.total;

    safeText(
        'seller-difference',
        money(Math.abs(difference)) + ' تومان'
    );

    let message;

    if (difference > 0) {
        message = 'مبلغ طلافروش بیشتر از محاسبه برنامه است.';
    } else if (difference < 0) {
        message = 'مبلغ طلافروش کمتر از محاسبه برنامه است.';
    } else {
        message = 'مبلغ اعلامی با محاسبه برنامه برابر است.';
    }

    safeText('seller-comparison', message);
}

$('seller-amount')?.addEventListener('input', updateSellerComparison);

/* =========================================
   SAVE CALCULATION
   ========================================= */

$('save-calculation')?.addEventListener('click', () => {
    if (!currentCalculation || currentCalculation.total <= 0) {
        return notify('ابتدا یک محاسبه معتبر انجام دهید.');
    }

    const active = document.querySelector('.calc-tab.active');
    const type = active?.dataset.calc || 'buy';

    calculations.push({
        date: formatDate(),
        type,
        total: currentCalculation.total,
        details: currentCalculation.details,
        sellerAmount: num($('seller-amount')?.value)
    });

    writeStorage(STORAGE.calculations, calculations);

    notify('محاسبه ذخیره شد.');
});

/* =========================================
   SAVE SETTINGS
   ========================================= */

$('save-price')?.addEventListener('click', () => {
    const oldPrice = settings.price;

    if (priceMode === 'manual') {
        const manualPrice = num($('setting-price')?.value);

        if (manualPrice <= 0) {
            return notify('قیمت دستی باید بیشتر از صفر باشد.');
        }

        settings.price = manualPrice;
        priceUpdated = new Date().toISOString();
        priceSource = 'manual';

        lastSyncedPrice = manualPrice;
    }

    settings.ounce = num($('setting-ounce')?.value);
    settings.dollar = num($('setting-dollar')?.value);
    settings.wage = num($('setting-wage')?.value);
    settings.profit = num($('setting-profit')?.value);
    settings.tax = num($('setting-tax')?.value);

    savePriceData();
    saveAll();

    syncPriceInputs(oldPrice, settings.price);

    renderDashboard();

    notify(
        priceMode === 'manual'
            ? 'قیمت دستی و تنظیمات با موفقیت ذخیره شد.'
            : 'تنظیمات ذخیره شد. قیمت‌های آنلاین در دریافت بعدی به‌روزرسانی می‌شوند.'
    );
});

$('online-price')?.addEventListener('click', () => {
    if (priceMode !== 'online') {
        setPriceMode('online');
    } else {
        fetchOnlinePrice();
    }
});

/* =========================================
   CLEAR HISTORY
   ========================================= */

$('clear-trades')?.addEventListener('click', () => {
    if (confirm('تمام معاملات این دستگاه پاک شوند؟')) {
        trades = [];
        saveAll();
        notify('تاریخچه معاملات پاک شد.');
    }
});

/* =========================================
   BACKUP
   ========================================= */

$('backup-data')?.addEventListener('click', () => {
    const backup = {
        app: 'Araz Gold',
        version: 2,
        date: new Date().toISOString(),
        trades,
        calculations,
        settings,
        priceMode,
        priceUpdated,
        priceSource
    };

    const blob = new Blob(
        [JSON.stringify(backup, null, 2)],
        { type: 'application/json' }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'Araz-Gold-Backup.json';
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
});

/* =========================================
   RESTORE BACKUP
   ========================================= */

$('restore-data')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
        const text = await file.text();
        const backup = JSON.parse(text);

        if (
            backup.app !== 'Araz Gold' ||
            !Array.isArray(backup.trades) ||
            !backup.settings
        ) {
            throw new Error('Invalid backup');
        }

        if (!confirm('اطلاعات فعلی با نسخه پشتیبان جایگزین شود؟')) {
            event.target.value = '';
            return;
        }

        trades = backup.trades;

        calculations = Array.isArray(backup.calculations)
            ? backup.calculations
            : [];

        settings = {
            ...settings,
            ...backup.settings
        };

        if (
            backup.priceMode === 'online' ||
            backup.priceMode === 'manual'
        ) {
            priceMode = backup.priceMode;
        }

        priceUpdated = backup.priceUpdated || '';
        priceSource = backup.priceSource || 'manual';

        savePriceData();
        saveAll();

        startPriceUpdates();

        notify('اطلاعات با موفقیت بازیابی شد.');

    } catch {
        notify('فایل پشتیبان معتبر نیست.');
    }

    event.target.value = '';
});

/* =========================================
   ONLINE / OFFLINE STATUS
   ========================================= */

function updateConnection() {
    const online = navigator.onLine;

    safeText(
        'offline-status',
        online ? 'متصل به اینترنت' : 'حالت آفلاین'
    );

    const status = document.querySelector('.connection-status');

    if (status) {
        status.textContent = online
            ? 'متصل به اینترنت'
            : 'بدون اینترنت';

        status.classList.toggle('offline', !online);
    }

    if (!online) {
        updatePriceStatus(
            settings.price > 0
                ? 'بدون اینترنت؛ آخرین قیمت‌های ذخیره‌شده'
                : 'بدون اینترنت و بدون قیمت ذخیره‌شده',
            'error'
        );

        renderDashboard();

    } else if (priceMode === 'online') {
        fetchOnlinePrice();
    }
}

window.addEventListener('online', updateConnection);
window.addEventListener('offline', updateConnection);

document.addEventListener('visibilitychange', () => {
    if (
        document.visibilityState === 'visible' &&
        navigator.onLine &&
        priceMode === 'online'
    ) {
        fetchOnlinePrice();
    }
});

/* =========================================
   PWA SERVICE WORKER
   ========================================= */

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .catch(error => {
                console.warn('Service Worker:', error);
            });
    });
}

/* =========================================
   START APPLICATION
   ========================================= */

createPriceControls();

render();

updateTradeTotal();
updateCalculator();
updateConnection();

show('dashboard');

syncPriceInputs(0, settings.price);

startPriceUpdates();

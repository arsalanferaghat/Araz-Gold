
'use strict';

/* =========================================
   ARAZ GOLD - Application Core
   ========================================= */

const $ = id => document.getElementById(id);

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
        value = value.replace(/[٬,]/g, '').replace(/[٫]/g, '.');
    }
    return Number(value) || 0;
};

const STORAGE = {
    trades: 'ag_trades',
    price: 'ag_price',
    ounce: 'ag_ounce',
    dollar: 'ag_dollar',
    wage: 'ag_wage',
    profit: 'ag_profit',
    tax: 'ag_tax',
    calculations: 'ag_calculations'
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
    localStorage.setItem(key, JSON.stringify(value));
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

let currentCalculation = null;

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
    const assetValue = balance * settings.price;

    safeText('gold-balance', decimal(balance) + ' گرم');
    safeText('asset-value', money(Math.max(0, assetValue)) + ' تومان');
    safeText('trade-count', money(trades.length));

    safeHTML(
        'iran-price',
        money(settings.price) + ' <small>تومان / گرم ۱۸ عیار</small>'
    );

    safeText(
        'iran-price-status',
        settings.price > 0 ? 'نرخ ذخیره‌شده' : 'نرخ وارد نشده'
    );

    safeText(
        'iran-price-updated',
        settings.price > 0 ? 'آخرین نرخ ثبت‌شده دستی' : 'منتظر ثبت نرخ'
    );

    safeText(
        'global-price',
        settings.ounce > 0
            ? money(settings.ounce) + ' دلار'
            : 'ثبت نشده'
    );

    safeText(
        'global-price-status',
        settings.ounce > 0 ? 'نرخ ذخیره‌شده' : 'نرخ وارد نشده'
    );

    // سود و زیان تحقق‌یافته در این نسخه محاسبه نمی‌شود.
    safeText('profit', '—');

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
        money(Math.max(0, balance) * settings.price) + ' تومان'
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

    safeText(
        'price-update-time',
        settings.price > 0 ? 'آخرین نرخ ذخیره‌شده دستی' : 'نرخی ثبت نشده است'
    );
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

    updateTradeTotal();

    show('history');

    notify('معامله با موفقیت ثبت شد.');
});

/* =========================================
   GOLD CALCULATIONS
   ========================================= */

// تبدیل قیمت طلای ۱۸ عیار به عیار موردنظر
function purityPrice(price18, purity) {
    return price18 * (num(purity) / 750);
}

// ارزش خام طلا
function rawGoldValue(weight, purity, price18) {
    return num(weight) * purityPrice(price18, purity);
}

// درصد به مبلغ
function percentAmount(amount, percent) {
    return amount * num(percent) / 100;
}

// محاسبه خرید
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

// محاسبه فروش
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

// محاسبه تعویض
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
    settings.price = num($('setting-price').value);
    settings.ounce = num($('setting-ounce')?.value);
    settings.dollar = num($('setting-dollar')?.value);
    settings.wage = num($('setting-wage')?.value);
    settings.profit = num($('setting-profit')?.value);
    settings.tax = num($('setting-tax')?.value);

    saveAll();

    notify('تنظیمات با موفقیت ذخیره شد.');
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
        version: 1,
        date: new Date().toISOString(),
        trades,
        calculations,
        settings
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

    URL.revokeObjectURL(url);
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

        saveAll();

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
}

window.addEventListener('online', updateConnection);
window.addEventListener('offline', updateConnection);

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

render();
updateTradeTotal();
updateCalculator();
updateConnection();
show('dashboard');

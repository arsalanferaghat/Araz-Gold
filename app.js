const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('fa-IR',{maximumFractionDigits:0}).format(Number(n)||0);
const num=n=>Number(n)||0;
let trades=JSON.parse(localStorage.getItem('gt_trades')||'[]');
let price=num(localStorage.getItem('gt_price'));
function save(){localStorage.setItem('gt_trades',JSON.stringify(trades));render()}
function render(){
 const balance=trades.reduce((s,t)=>s+(t.type==='buy'?t.weight:-t.weight),0);
 $('gold-balance').textContent=new Intl.NumberFormat('fa-IR',{maximumFractionDigits:3}).format(balance)+' گرم';
 $('asset-value').textContent=money(Math.max(0,balance)*price)+' تومان';
 $('trade-count').textContent=new Intl.NumberFormat('fa-IR').format(trades.length);
 $('iran-price').innerHTML=money(price)+' <small>تومان / گرم ۱۸ عیار</small>';
 $('profit').textContent='—';
 const rows=trades.slice().reverse();
 $('history-body').innerHTML=rows.length?rows.map(t=>`<tr><td>${t.date}</td><td class="${t.type}">${t.type==='buy'?'خرید':'فروش'}</td><td>${t.market==='iran'?'ایران':'جهانی'}</td><td>${t.weight.toLocaleString('fa-IR')} گرم</td><td>${money(t.unit)} تومان</td><td>${money(t.total)} تومان</td><td>${escapeHtml(t.note||'—')}</td></tr>`).join(''):'<tr><td colspan="7" class="empty">هنوز معامله‌ای ثبت نشده است.</td></tr>';
 $('recent-list').innerHTML=rows.length?rows.slice(0,5).map(t=>`<div class="panel-head" style="padding:10px 0;border-bottom:1px solid #303438"><span>${t.type==='buy'?'خرید':'فروش'} • ${t.weight} گرم</span><b>${money(t.total)} تومان</b></div>`).join(''):'هنوز معامله‌ای ثبت نشده است.';
 $('setting-price').value=price||'';
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function show(page){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('show',p.id===page));document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===page));const titles={dashboard:'داشبورد',trade:'ثبت خرید و فروش',history:'تاریخچه معاملات',calculator:'ماشین‌حساب طلا',settings:'تنظیمات قیمت'};$('page-title').textContent=titles[page]}
document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>show(b.dataset.page)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.go)));
function updateTradeTotal(){$('trade-total').textContent=money(num($('weight').value)*num($('unit-price').value)+num($('fee').value))+' تومان'}
['weight','unit-price','fee'].forEach(id=>$(id).addEventListener('input',updateTradeTotal));
$('trade-form').addEventListener('submit',e=>{e.preventDefault();const weight=num($('weight').value),unit=num($('unit-price').value),fee=num($('fee').value);if(weight<=0||unit<=0)return alert('وزن و قیمت باید بیشتر از صفر باشند.');if($('type').value==='sell'&&weight>trades.reduce((s,t)=>s+(t.type==='buy'?t.weight:-t.weight),0))return alert('موجودی ثبت‌شده برای این فروش کافی نیست.');trades.push({id:crypto.randomUUID(),date:new Date().toLocaleString('fa-IR'),type:$('type').value,market:$('market').value,kind:$('kind').value,weight,unit,fee,total:weight*unit+fee,note:$('note').value});save();e.target.reset();$('fee').value=0;updateTradeTotal();show('history');alert('معامله آزمایشی ثبت شد.');});
$('save-price').addEventListener('click',()=>{price=num($('setting-price').value);localStorage.setItem('gt_price',String(price));render();alert('قیمت دستی ذخیره شد.');});
function calc(){const total=num($('calc-weight').value)*num($('calc-price').value)+num($('calc-wage').value)+num($('calc-extra').value);$('calc-total').textContent=money(total)+' تومان'}
['calc-weight','calc-price','calc-wage','calc-extra'].forEach(id=>$(id).addEventListener('input',calc));
$('clear-trades').addEventListener('click',()=>{if(confirm('تمام معاملات نمایشی این مرورگر پاک شوند؟')){trades=[];save()}});
render();calc();updateTradeTotal();

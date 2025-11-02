/* ========= Утилиты ========= */
const fmt = (n) => (Math.round(n)).toLocaleString('ru-RU');
const rub = (n) => `${fmt(n)} ₽`;
const todayISO = () => { const d=new Date();return d.toISOString().slice(0,10); };
const addDays = (iso,delta)=>{const d=new Date(iso);d.setDate(d.getDate()+delta);return d.toISOString().slice(0,10);}
const rangeDays=(end,count)=>{const a=[];for(let i=count-1;i>=0;i--)a.push(addDays(end,-i));return a;}
const isoToShort = (iso)=>{const d=new Date(iso);return d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'});}

/* ========= Storage schema =========
{
  activeCarId: string,
  cars: [{id,name,cls,tank}],
  settings: { parkMode:'none'|'150day'|'15order'|'20order'|'4pct', taxMode:'none'|'self4'|'ip6' },
  dataByCar: {
    [carId]: { [dateISO]: {orders,income,rent,fuel,tips,otherIncome,otherExpense,fines,hours} }
  }
}
==================================== */
const LS_KEY = 'taxiAnalyzerV13';

function loadAll() {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) return JSON.parse(raw);

  // === создаём демонстрационные данные ===
  const carId = crypto.randomUUID();
  const seedData = {};

  // === сентябрь (15–30) ===
  for (let i = 15; i <= 30; i++) {
    const d = `2025-09-${String(i).padStart(2, '0')}`;
    seedData[d] = {
      orders: 18 + (i % 5),
      income: 5500 + (i % 4) * 400,
      rent: 2700,
      fuel: 1000 + (i % 3) * 100,
      tips: 100 + (i % 2) * 30,
      otherIncome: 0,
      otherExpense: (i % 6 === 0) ? 200 : 0,
      fines: 0,
      hours: 8 + (i % 3)
    };
  }

  // === октябрь (1–31) ===
  for (let i = 1; i <= 31; i++) {
    const d = `2025-10-${String(i).padStart(2, '0')}`;
    seedData[d] = {
      orders: 16 + (i % 7),
      income: 6200 + (i % 5) * 350,
      rent: 2790,
      fuel: 1100 + (i % 4) * 120,
      tips: 120 + (i % 3) * 20,
      otherIncome: (i % 10 === 0) ? 500 : 0,
      otherExpense: (i % 9 === 0) ? 300 : 0,
      fines: (i % 14 === 0) ? 500 : 0,
      hours: 9 + (i % 4)
    };
  }

  // === ноябрь (1–10) ===
  for (let i = 1; i <= 10; i++) {
    const d = `2025-11-${String(i).padStart(2, '0')}`;
    seedData[d] = {
      orders: 15 + (i % 5),
      income: 5800 + (i % 3) * 400,
      rent: 2790,
      fuel: 1300 + (i % 2) * 100,
      tips: 150 + (i % 2) * 50,
      otherIncome: (i % 5 === 0) ? 400 : 0,
      otherExpense: (i % 4 === 0) ? 200 : 0,
      fines: 0,
      hours: 8 + (i % 3)
    };
  }

  // === создаём объект приложения ===
  const obj = {
    activeCarId: carId,
    cars: [{ id: carId, name: 'Kia Rio', cls: 'Комфорт', tank: 50 }],
    settings: { parkMode: '150day', taxMode: 'none' },
    dataByCar: { [carId]: seedData }
  };

  localStorage.setItem(LS_KEY, JSON.stringify(obj));
  return obj;
}

function saveAll() {
  localStorage.setItem(LS_KEY, JSON.stringify(APP));
}


/* ========= State ========= */
let APP = loadAll();

let currentScreen='home';
let currentPeriod='day';
let currentDate=todayISO();

const byCar = () => APP.dataByCar[APP.activeCarId] || (APP.dataByCar[APP.activeCarId]={});
const ensureDay = (iso) => {
  const d = byCar()[iso];
  if (d) return d;
  return (byCar()[iso] = {orders:0,income:0,rent:0,fuel:0,tips:0,otherIncome:0,otherExpense:0,fines:0,hours:0});
}

/* ========= DOM refs ========= */
const subtitle = document.getElementById('subtitle');
const activeCarChip = document.getElementById('activeCarChip');
const dateInput = document.getElementById('dateInput');

const tabs = document.querySelectorAll('.tab');
const navbtns = document.querySelectorAll('.navbtn');
const screens = {
  home: document.getElementById('screen-home'),
  reports: document.getElementById('screen-reports'),
  settings: document.getElementById('screen-settings')
};

const sumTotal = document.getElementById('sumTotal');
const ordersLine = document.getElementById('ordersLine');
const chartBars = document.getElementById('chartBars');

const cIncome=document.getElementById('cIncome');
const cOrders=document.getElementById('cOrders');
const cRent=document.getElementById('cRent');
const cFuel=document.getElementById('cFuel');
const cTips=document.getElementById('cTips');
const cOtherIncome=document.getElementById('cOtherIncome');
const cOtherExpense=document.getElementById('cOtherExpense');
const cFines=document.getElementById('cFines');
const cHours=document.getElementById('cHours');
const cPerHour=document.getElementById('cPerHour');
const cCommission=document.getElementById('cCommission');
const cTax=document.getElementById('cTax');
const cProfit=document.getElementById('cProfit');
const cEff=document.getElementById('cEff');

const rentPctEl=document.getElementById('rentPct');
const fuelPctEl=document.getElementById('fuelPct');

const reportsBody=document.getElementById('reportsBody');

/* ========= Modal (edit values) ========= */
const modalBg = document.getElementById('modalBg');
const modalTitle=document.getElementById('modalTitle');
const modalLabel=document.getElementById('modalLabel');
const modalInput=document.getElementById('modalInput');
const quickArea=document.getElementById('quickArea');
const btnCancel=document.getElementById('btnCancel');
const btnSave=document.getElementById('btnSave');
let editField=null;

const QUICK_PRESETS = {
  income: [1000,3000,5000],
  otherIncome: [500,1000,2000],
  tips: [50,100,200],
  rent: [500,1000,1500],
  fuel: [100,500,1000],
  otherExpense: [100,300,500],
  fines: [500,1000,3000],
  orders: [1,5,10],
  hours: [1,2,4]
};

function renderQuick(field){
  quickArea.innerHTML = '';
  (QUICK_PRESETS[field]||[]).forEach(val=>{
    const chip=document.createElement('div');
    chip.className='chip';
    chip.textContent = field==='orders'||field==='hours' ? `+${val}` : `+${val} ₽`;
    chip.onclick=()=>{ modalInput.value = Number(modalInput.value||0) + val; };
    quickArea.appendChild(chip);
  });
}
function openModal(field,title){
  editField=field; modalTitle.textContent=title; modalLabel.textContent='Введите значение';
  modalInput.value = Number(ensureDay(currentDate)[field]||0);
  renderQuick(field);
  modalBg.classList.add('show'); modalInput.focus();
}
function closeModal(){ modalBg.classList.remove('show'); editField=null; }
btnCancel.onclick=closeModal;
modalBg.addEventListener('click',e=>{ if(e.target===modalBg) closeModal(); });
btnSave.onclick=()=>{
  if(!editField) return;
  const v = Number(modalInput.value||0);
  ensureDay(currentDate)[editField]=v;
  saveAll(); closeModal(); render();
};

/* ========= Car Edit Modal ========= */
const carEditBg=document.getElementById('carEditBg');
const carEditName=document.getElementById('carEditName');
const carEditClass=document.getElementById('carEditClass');
const carEditTank=document.getElementById('carEditTank');
const carEditCancel=document.getElementById('carEditCancel');
const carEditSave=document.getElementById('carEditSave');
let editingCarId=null;

function openCarEdit(car){
  editingCarId=car.id;
  carEditName.value=car.name||'';
  carEditClass.value=car.cls||'Эконом';
  carEditTank.value=car.tank||50;
  carEditBg.classList.add('show');
}
function closeCarEdit(){ carEditBg.classList.remove('show'); editingCarId=null; }
carEditCancel.onclick=closeCarEdit;
carEditBg.addEventListener('click',e=>{ if(e.target===carEditBg) closeCarEdit(); });
carEditSave.onclick=()=>{
  const car=APP.cars.find(x=>x.id===editingCarId);
  if(!car) return;
  car.name=carEditName.value||car.name;
  car.cls=carEditClass.value||car.cls;
  car.tank=Number(carEditTank.value||car.tank||50);
  saveAll(); closeCarEdit(); render();
};

/* ========= Cars UI ========= */
const carName=document.getElementById('carName');
const classButtons=document.getElementById('classButtons');
let newCarClass='Эконом';
classButtons.querySelectorAll('button').forEach(b=>{
  b.onclick=()=>{ newCarClass=b.dataset.cls; classButtons.querySelectorAll('button').forEach(x=>x.classList.remove('primary')); b.classList.add('primary'); };
});
const addCarBtn=document.getElementById('addCarBtn');
const carsContainer=document.getElementById('carsContainer');

function renderCars(){
  const items = APP.cars.map(c=>`
    <div class="car-item">
      <div><b>${c.name}</b> · <span style="color:var(--muted)">${c.cls||'-'}</span> · бак ${c.tank||'-'} л</div>
      <div class="car-actions">
        <button class="mini" data-edit="${c.id}">⚙️</button>
        <button class="mini ${APP.activeCarId===c.id?'primary':''}" data-car="${c.id}">${APP.activeCarId===c.id?'Активно':'Выбрать'}</button>
        <button class="mini" data-del="${c.id}">Удалить</button>
      </div>
    </div>
  `).join('');
  carsContainer.innerHTML = items || '<div class="row">Нет машин — добавь выше</div>';

  carsContainer.querySelectorAll('button[data-car]').forEach(b=>{
    b.onclick=()=>{ APP.activeCarId=b.dataset.car; saveAll(); render(); };
  });
  carsContainer.querySelectorAll('button[data-del]').forEach(b=>{
    b.onclick=()=>{
      const id=b.dataset.del;
      if(APP.cars.length===1){ alert('Нельзя удалить единственную машину'); return; }
      APP.cars=APP.cars.filter(x=>x.id!==id);
      delete APP.dataByCar[id];
      if(APP.activeCarId===id) APP.activeCarId=APP.cars[0].id;
      saveAll(); render();
    };
  });
  carsContainer.querySelectorAll('button[data-edit]').forEach(b=>{
    b.onclick=()=>{ const car=APP.cars.find(x=>x.id===b.dataset.edit); if(car) openCarEdit(car); };
  });
}
addCarBtn.onclick=()=>{
  const name=(carName.value||'').trim();
  if(!name) return alert('Укажи название авто');
  const id=crypto.randomUUID();
  APP.cars.push({id,name,cls:newCarClass,tank:50});
  APP.dataByCar[id]={};
  APP.activeCarId=id;
  carName.value=''; newCarClass='Эконом';
  classButtons.querySelectorAll('button').forEach(x=>x.classList.remove('primary'));
  saveAll(); render();
};

/* ========= Settings (commission & tax) ========= */
function bindSettingsRadios(){
  document.querySelectorAll('input[name="park"]').forEach(r=>{
    r.checked = (APP.settings.parkMode===r.value);
    r.onchange = ()=>{ APP.settings.parkMode=r.value; saveAll(); render(); };
  });
  document.querySelectorAll('input[name="tax"]').forEach(r=>{
    r.checked = (APP.settings.taxMode===r.value);
    r.onchange = ()=>{ APP.settings.taxMode=r.value; saveAll(); render(); };
  });
 document.getElementById('resetBtn').onclick = () => {
  if (confirm('Сбросить все локальные данные и загрузить демо-пример?')) {
    localStorage.removeItem(LS_KEY);

    // Подождём, чтобы гарантированно очистилось, и создадим seed-данные заново
   setTimeout(() => {
  APP = loadAll();   // создаём демо данные
  saveAll();

  // выставляем дату последнего дня демо, чтобы график не был пуст
  currentDate = "2024-11-10";
  currentPeriod = "day";

  render();
  alert('✅ Демо-данные успешно загружены. Открой график — данные за сентябрь, октябрь и ноябрь!');
}, 150);

  }
};


}

/* ========= Calculations ========= */
function calcCommission(d){ // парк
  const mode = APP.settings.parkMode || 'none';
  if(mode==='none') return 0;
  if(mode==='150day'){
    return ( (d.income||0) > 0 || (d.orders||0) > 0 ) ? 150 : 0;
  }
  if(mode==='15order'){ return (d.orders||0) * 15; }
  if(mode==='20order'){ return (d.orders||0) * 20; }
  if(mode==='4pct'){ return (d.income||0) * 0.04; } // с дохода (без чаевых/прочих доходов)
  return 0;
}
function calcTax(d){
  const mode = APP.settings.taxMode || 'none';
  if(mode==='self4') return (d.income||0) * 0.04;
  if(mode==='ip6')   return (d.income||0) * 0.06;
  return 0;
}
function calcDay(iso){
  const d = ensureDay(iso);
  const gross = (d.income||0) + (d.tips||0) + (d.otherIncome||0);
  const commission = calcCommission(d);
  const tax = calcTax(d);
  const costs = (d.rent||0)+(d.fuel||0)+(d.otherExpense||0)+(d.fines||0)+commission+tax;
  const profit = gross - costs;
  const eff = gross>0 ? Math.max(0, Math.round((profit/gross)*100)) : 0;
  const perHour = (d.hours||0)>0 ? profit / d.hours : 0;
  return {...d, commission, tax, gross, costs, profit, eff, perHour};
}
function sumRange(arr){
  return arr.reduce((acc,iso)=>{
    const d = ensureDay(iso);
    const c = calcCommission(d);
    const t = calcTax(d);
    acc.orders += Number(d.orders||0);
    acc.income += Number(d.income||0);
    acc.rent   += Number(d.rent||0);
    acc.fuel   += Number(d.fuel||0);
    acc.tips   += Number(d.tips||0);
    acc.otherIncome  += Number(d.otherIncome||0);
    acc.otherExpense += Number(d.otherExpense||0);
    acc.fines  += Number(d.fines||0);
    acc.hours  += Number(d.hours||0);
    acc.commission += c;
    acc.tax += t;
    return acc;
  }, {orders:0,income:0,rent:0,fuel:0,tips:0,otherIncome:0,otherExpense:0,fines:0,hours:0,commission:0,tax:0});
}

/* ========= Timeline chart ========= */
function renderTimeline(values, labels, dates){
  chartBars.innerHTML='';
  const max=Math.max(1,...values.map(v=>Math.max(0,v)));
  values.forEach((v,i)=>{
    const col=document.createElement('div');
    col.className='barcol';
    const top=document.createElement('div'); 
    top.className='bar-top'; 
    top.textContent = v>0 ? rub(v) : '0 ₽';

    const bar=document.createElement('div'); 
    bar.className='bar'; 
    bar.style.height = `${(Math.max(0,v)/max)*170}px`;
    bar.style.cursor = 'pointer';

    // === обработка кликов по столбцам ===
    bar.onclick = () => {
      if (currentPeriod === 'day') {
        // как раньше — просто открыть день
        currentDate = dates[i];
        currentPeriod = 'day';
        tabs.forEach(x => x.classList.remove('active'));
        document.querySelector('.tab[data-period="day"]').classList.add('active');
        dateInput.value = currentDate;
        render();
      } 
      else if (currentPeriod === 'week') {
        // перейти к отчёту за неделю
        const endISO = dates[i];
        const range = rangeDays(endISO, 7);
        const summary = sumRange(range);
        showReportModal('Неделя', range[0], range[6], summary);
      } 
      else if (currentPeriod === 'month') {
        // перейти к отчёту за месяц
        const endISO = dates[i];
        const startISO = addDays(endISO, -29);
        const range = rangeDays(endISO, 30);
        const summary = sumRange(range);
        showReportModal('Месяц', range[0], range[range.length-1], summary);
      }
    };

    const bottom=document.createElement('div'); 
    bottom.className='bar-bottom'; 
    bottom.textContent = labels[i];

    col.appendChild(top); 
    col.appendChild(bar); 
    col.appendChild(bottom);
    chartBars.appendChild(col);
  });
}
function showReportModal(title, fromISO, toISO, s){
  const gross = s.income + s.tips + s.otherIncome;
  const profit = gross - (s.rent + s.fuel + s.otherExpense + s.fines + s.commission + s.tax);
  const eff = gross>0 ? Math.round((profit/gross)*100) : 0;
  const perHour = (s.hours||0)>0 ? profit / s.hours : 0;

  currentScreen = 'reports';
  rMode = 'custom';
  render();

  const headerLine = `📆 ${title} ${isoToShort(fromISO)} – ${isoToShort(toISO)} · ${fmt(s.orders)} заказов · ${rub(gross)} дохода`;

  reportsBody.innerHTML = `
    <div style="margin-bottom:10px;font-size:13px;color:var(--muted);text-align:center;">${headerLine}</div>
    <details class="collapse" open>
      <summary><b>Сводка</b></summary>
      <div class="body">
        <div class="row"><div>Доход</div><b>${rub(gross)}</b></div>
        <div class="row"><div>Чистая прибыль</div><b>${rub(profit)}</b></div>
        <div class="row"><div>Эффективность</div><b>${eff}%</b></div>
        <div class="row"><div>Часы всего</div><b>${fmt(s.hours||0)} ч</b></div>
        <div class="row"><div>₽/час</div><b>${fmt(Math.round(perHour))} ₽/ч</b></div>
      </div>
    </details>
    <details class="collapse">
      <summary>Расшифровка расходов</summary>
      <div class="body">
        <div class="row"><div>Аренда</div><b>${rub(s.rent)}</b></div>
        <div class="row"><div>Топливо</div><b>${rub(s.fuel)}</b></div>
        <div class="row"><div>Прочие расходы</div><b>${rub(s.otherExpense)}</b></div>
        <div class="row"><div>Штрафы</div><b>${rub(s.fines)}</b></div>
        <div class="row"><div>Комиссия парка</div><b>${rub(s.commission)}</b></div>
        <div class="row"><div>Налог</div><b>${rub(s.tax)}</b></div>
      </div>
    </details>
  `;

  subtitle.textContent = `${title} · отчёт за период`;
}

/* ========= Render ========= */
function renderHome(){
  const car = APP.cars.find(c=>c.id===APP.activeCarId);
  activeCarChip.textContent = 'Авто: ' + (car ? `${c.name} · ${c.cls}` : '—'); // <-- keep original? Fix bug: use car
  const d = new Date(currentDate);
  subtitle.textContent = (currentPeriod==='day')
    ? `Главная · ${d.toLocaleDateString('ru-RU')}`
    : (currentPeriod==='week' ? 'Главная · недели' : 'Главная · месяцы');

  if(currentPeriod==='day'){
    const x = calcDay(currentDate);
    sumTotal.textContent = rub(x.gross);
    ordersLine.textContent = `${fmt(x.orders)} заказов`;

    cIncome.textContent=rub(x.income);
    cTips.textContent=rub(x.tips);
    cOtherIncome.textContent=rub(x.otherIncome);
    cOrders.textContent=fmt(x.orders);

    cRent.textContent=rub(x.rent);
    cFuel.textContent=rub(x.fuel);
    cOtherExpense.textContent=rub(x.otherExpense);
    cFines.textContent=rub(x.fines);

    cHours.textContent = `${fmt(x.hours||0)} ч`;
    cPerHour.textContent = `${fmt(Math.round(x.perHour))} ₽/ч`;

    cCommission.textContent=rub(x.commission);
    cTax.textContent=rub(x.tax);
    cProfit.textContent=rub(x.profit);
    cEff.textContent=`${x.eff}%`;

    const rPct = x.gross>0 ? Math.round((x.rent/x.gross)*100) : 0;
    const fPct = x.gross>0 ? Math.round((x.fuel/x.gross)*100) : 0;
    rentPctEl.textContent=rPct+'%'; fuelPctEl.textContent=fPct+'%';
    rentPctEl.className='pill ' + (rPct>35?'bad':(rPct>25?'warn':'ok'));
    fuelPctEl.className='pill ' + (fPct>30?'bad':(fPct>20?'warn':'ok'));

    const daysAround = 3;
    const arr = [];
    for(let i = -daysAround; i <= daysAround; i++) arr.push(addDays(currentDate, i));
    const vals = arr.map(iso => { const d = calcDay(iso); return Math.max(0, d.profit); });
    const labels = arr.map(iso => isoToShort(iso));
    renderTimeline(vals, labels, arr);
    setTimeout(() => {
      const bars = chartBars.querySelectorAll('.bar');
      arr.forEach((iso, i) => {
        if (iso === currentDate) bars[i].style.outline = '2px solid var(--accent)';
      });
    }, 50);

    return;
  }

  if (currentPeriod === 'week') {
    const weeks = 8;
    const arr = [];
    const today = new Date();
    const currentMonday = new Date(today);
    const day = currentMonday.getDay() || 7;
    if (day !== 1) currentMonday.setDate(currentMonday.getDate() - (day - 1));
    for (let i = weeks - 1; i >= 0; i--) {
      const start = new Date(currentMonday);
      start.setDate(currentMonday.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const startISO = start.toLocaleDateString('en-CA');
      const endISO = end.toLocaleDateString('en-CA');
      const range = [];
      let cur = new Date(start);
      while (cur <= end) {
        range.push(cur.toLocaleDateString('en-CA'));
        cur.setDate(cur.getDate() + 1);
      }
      const sum = sumRange(range);
      const gross = sum.income + sum.tips + sum.otherIncome;
      const profit = gross - (sum.rent + sum.fuel + sum.otherExpense + sum.fines + sum.commission + sum.tax);
      arr.push({
        label: `${start.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})}–${end.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})}`,
        startISO,endISO,profit
      });
    }
    const vals = arr.map((w) => Math.max(0, w.profit));
    const labels = arr.map((w) => w.label);
    const dates = arr.map((w) => w.endISO);
    renderTimeline(vals, labels, dates);

    const startThisWeek = currentMonday.toLocaleDateString('en-CA');
    const endThisWeek = new Date(currentMonday); endThisWeek.setDate(currentMonday.getDate() + 6);
    const rangeThisWeek = []; let cur = new Date(currentMonday);
    while (cur <= endThisWeek) { rangeThisWeek.push(cur.toLocaleDateString('en-CA')); cur.setDate(cur.getDate() + 1); }
    const s = sumRange(rangeThisWeek);
    const gross = s.income + s.tips + s.otherIncome;
    const profit = gross - (s.rent + s.fuel + s.otherExpense + s.fines + s.commission + s.tax);
    const eff = gross > 0 ? Math.round((profit / gross) * 100) : 0;
    const perHour = (s.hours || 0) > 0 ? profit / s.hours : 0;

    sumTotal.textContent = rub(gross);
    ordersLine.textContent = `${fmt(s.orders)} заказов`;
    cIncome.textContent = rub(s.income);
    cTips.textContent = rub(s.tips);
    cOtherIncome.textContent = rub(s.otherIncome);
    cOrders.textContent = fmt(s.orders);
    cRent.textContent = rub(s.rent);
    cFuel.textContent = rub(s.fuel);
    cOtherExpense.textContent = rub(s.otherExpense);
    cFines.textContent = rub(s.fines);
    cCommission.textContent = rub(s.commission);
    cTax.textContent = rub(s.tax);
    cProfit.textContent = rub(profit);
    cEff.textContent = `${eff}%`;
    cHours.textContent = `${fmt(s.hours || 0)} ч`;
    cPerHour.textContent = `${fmt(Math.round(perHour))} ₽/ч`;
  }

  if(currentPeriod==='month'){
    const months = 6;
    const arr = [];
    const now = new Date();
    for(let i = months - 1; i >= 0; i--){
      const year = now.getFullYear();
      const month = now.getMonth() - i;
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      const startISO = start.toLocaleDateString('en-CA');
      const endISO = end.toLocaleDateString('en-CA');
      const range = []; let cur = new Date(start);
      while(cur <= end){ range.push(cur.toLocaleDateString('en-CA')); cur.setDate(cur.getDate() + 1); }
      const sum = sumRange(range);
      const gross = sum.income + sum.tips + sum.otherIncome;
      const profit = gross - (sum.rent + sum.fuel + sum.otherExpense + sum.fines + sum.commission + sum.tax);
      arr.push({ label: start.toLocaleString('ru-RU',{month:'short'}), startISO, endISO, profit });
    }
    const vals = arr.map(m => Math.max(0, m.profit));
    const labels = arr.map(m => m.label);
    const dates = arr.map(m => m.endISO);
    renderTimeline(vals, labels, dates);

    const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const rangeThisMonth = []; let cur = new Date(startThisMonth);
    while(cur <= endThisMonth){ rangeThisMonth.push(cur.toLocaleDateString('en-CA')); cur.setDate(cur.getDate() + 1); }
    const s = sumRange(rangeThisMonth);
    const gross = s.income + s.tips + s.otherIncome;
    const profit = gross - (s.rent + s.fuel + s.otherExpense + s.fines + s.commission + s.tax);
    const eff = gross>0 ? Math.round((profit/gross)*100) : 0;
    const perHour = (s.hours||0)>0 ? profit / s.hours : 0;

    sumTotal.textContent=rub(gross);
    ordersLine.textContent=`${fmt(s.orders)} заказов`;
    cIncome.textContent=rub(s.income);
    cTips.textContent=rub(s.tips);
    cOtherIncome.textContent=rub(s.otherIncome);
    cOrders.textContent=fmt(s.orders);
    cRent.textContent=rub(s.rent);
    cFuel.textContent=rub(s.fuel);
    cOtherExpense.textContent=rub(s.otherExpense);
    cFines.textContent=rub(s.fines);
    cCommission.textContent=rub(s.commission);
    cTax.textContent=rub(s.tax);
    cProfit.textContent=rub(profit);
    cEff.textContent=`${eff}%`;
    cHours.textContent=`${fmt(s.hours||0)} ч`;
    cPerHour.textContent=`${fmt(Math.round(perHour))} ₽/ч`;
  }
}

/* ===== Reports ===== */
const rTabs=document.querySelectorAll('.r-tab');
let rMode='week';

function buildSummaryCard(title, s){
  const gross = s.income + s.tips + s.otherIncome;
  const profit = gross - (s.rent+s.fuel+s.otherExpense+s.fines+s.commission+s.tax);
  const eff = gross>0 ? Math.max(0, Math.round((profit/gross)*100)) : 0;
  const perHour = (s.hours||0)>0 ? profit / s.hours : 0;
  return `
    <details class="collapse" open>
      <summary><b>${title}</b></summary>
      <div class="body">
        <div class="row"><div>Доход</div><b>${rub(gross)}</b></div>
        <div class="row"><div>Чистая прибыль</div><b>${rub(profit)}</b></div>
        <div class="row"><div>Эффективность</div><b>${eff}%</b></div>
        <div class="row"><div>Часы всего</div><b>${fmt(s.hours||0)} ч</b></div>
        <div class="row"><div>₽/час</div><b>${fmt(Math.round(perHour))} ₽/ч</b></div>
      </div>
    </details>
    <details class="collapse">
      <summary>Расшифровка расходов</summary>
      <div class="body">
        <div class="row"><div>Аренда</div><b>${rub(s.rent)}</b></div>
        <div class="row"><div>Топливо</div><b>${rub(s.fuel)}</b></div>
        <div class="row"><div>Прочие расходы</div><b>${rub(s.otherExpense)}</b></div>
        <div class="row"><div>Штрафы</div><b>${rub(s.fines)}</b></div>
        <div class="row"><div>Комиссия парка</div><b>${rub(s.commission)}</b></div>
        <div class="row"><div>Налог</div><b>${rub(s.tax)}</b></div>
      </div>
    </details>
  `;
}

function renderReports(){
  reportsBody.innerHTML='';
  if(rMode==='classes'){
    const map = {};
    for(const car of APP.cars){
      const data = APP.dataByCar[car.id]||{};
      let sum = {orders:0,income:0,rent:0,fuel:0,tips:0,otherIncome:0,otherExpense:0,fines:0,hours:0,commission:0,tax:0};
      Object.keys(data).forEach(iso=>{
        const d=data[iso];
        const c = calcCommission(d);
        const t = calcTax(d);
        sum.orders+=d.orders||0; sum.income+=d.income||0; sum.rent+=d.rent||0; sum.fuel+=d.fuel||0;
        sum.tips+=d.tips||0; sum.otherIncome+=d.otherIncome||0; sum.otherExpense+=d.otherExpense||0; sum.fines+=d.fines||0;
        sum.hours+=d.hours||0; sum.commission+=c; sum.tax+=t;
      });
      const key=car.cls||'—';
      if(!map[key]) map[key]={title:key, sum:{...sum}};
      else Object.keys(sum).forEach(k=>map[key].sum[k]+=sum[k]);
    }
    const parts = Object.values(map)
      .filter(x=>{
        const total = x.sum.income + x.sum.tips + x.sum.otherIncome + x.sum.rent + x.sum.fuel + x.sum.otherExpense + x.sum.fines;
        return total>0;
      })
      .map(x=>buildSummaryCard(`Класс: ${x.title}`, x.sum));
    reportsBody.innerHTML = parts.length? parts.join('') : '<div class="row">Нет данных для сравнения классов</div>';
    return;
  }

  const days = rMode==='week'?7:30;
  const arr = rangeDays(todayISO(), days);
  const s = sumRange(arr);

  reportsBody.innerHTML = buildSummaryCard(rMode==='week'?'Неделя (последние 7 дней)':'Месяц (последние 30 дней)', s);
}

/* ========= Render hub ========= */
function render(){
  Object.values(screens).forEach(s=>s.classList.add('hidden'));
  screens[currentScreen].classList.remove('hidden');
  navbtns.forEach(b=>b.classList.remove('active'));
  document.querySelector(`.navbtn[data-screen="${currentScreen}"]`).classList.add('active');

  dateInput.value = currentDate;

  if(currentScreen==='settings'){ renderCars(); bindSettingsRadios(); }
  if(currentScreen==='home') renderHome();
  if(currentScreen==='reports') renderReports();
}

/* ========= Events ========= */
tabs.forEach(t=>t.addEventListener('click',()=>{
  tabs.forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  currentPeriod=t.dataset.period;
  render();
}));
navbtns.forEach(n=>n.addEventListener('click',()=>{
  currentScreen=n.dataset.screen;
  render();
}));
dateInput.addEventListener('change', (e)=>{
  currentDate = e.target.value || todayISO();
  ensureDay(currentDate);
  saveAll();
  tabs.forEach(x=>x.classList.remove('active'));
  document.querySelector('.tab[data-period="day"]').classList.add('active');
  currentPeriod='day';
  render();
});
document.querySelectorAll('.card[data-edit]').forEach(c=>{
  c.addEventListener('click', ()=>{
    if(currentPeriod!=='day'){
      tabs.forEach(x=>x.classList.remove('active'));
      document.querySelector('.tab[data-period="day"]').classList.add('active');
      currentPeriod='day';
    }
    const field=c.dataset.edit;
    const titles={
      income:'Доход за день', tips:'Чаевые за день', otherIncome:'Прочие доходы за день',
      orders:'Количество заказов', rent:'Аренда за день', fuel:'Топливо за день',
      otherExpense:'Прочие расходы за день', fines:'Штрафы за день', hours:'Часы за день'
    };
    openModal(field, titles[field]||'Изменить');
  });
});
rTabs.forEach(rt=>rt.addEventListener('click',()=>{
  rTabs.forEach(x=>x.classList.remove('active'));
  rt.classList.add('active');
  rMode=rt.dataset.r;
  render();
}));

/* ========= First render ========= */
rangeBtn.onclick = () => {
  const from = fromDate.value, to = toDate.value;
  if (!from || !to) { alert('Укажите обе даты'); return; }
  if (from > to) { alert('Дата начала позже даты окончания'); return; }

  const arr = []; let cur = new Date(from); const end = new Date(to);
  while (cur <= end) { arr.push(cur.toLocaleDateString('en-CA')); cur.setDate(cur.getDate() + 1); }

  const s = sumRange(arr);
  const gross = s.income + s.tips + s.otherIncome;
  const profit = gross - (s.rent + s.fuel + s.otherExpense + s.fines + s.commission + s.tax);

  reportsBody.innerHTML = `
    <div style="margin-bottom:10px;font-size:13px;color:var(--muted);text-align:center;">
      📅 Период: ${isoToShort(from)} — ${isoToShort(to)}
    </div>
    ${buildSummaryCard('Отчёт по диапазону', s)}
  `;
};

render();

// ==== Telegram Mini App init (устойчивый вариант) ====
(function initTelegram() {
  try {
    if (window.Telegram && Telegram.WebApp) {
      Telegram.WebApp.ready();
      Telegram.WebApp.expand();
      if (Telegram.WebApp.disableVerticalSwipes) {
        Telegram.WebApp.disableVerticalSwipes();
      }
      if (Telegram.WebApp.enableClosingConfirmation) {
        Telegram.WebApp.enableClosingConfirmation();
      } else {
        Telegram.WebApp.isClosingConfirmationEnabled = true;
      }
      console.log('[TaxiPro] Telegram WebApp initialized');
    } else {
      console.warn('[TaxiPro] Telegram WebApp не обнаружен');
    }
  } catch (e) {
    console.error('[TaxiPro] Telegram init error:', e);
  }
})();
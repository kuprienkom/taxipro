/* ========= Утилиты ========= */
const fmt = (n) => (Math.round(n)).toLocaleString('ru-RU');
const rub = (n) => `${fmt(n)} ₽`;
const todayISO = () => { const d=new Date();return d.toISOString().slice(0,10); };
const addDays = (iso,delta)=>{const d=new Date(iso);d.setDate(d.getDate()+delta);return d.toISOString().slice(0,10);}
const rangeDays=(end,count)=>{const a=[];for(let i=count-1;i>=0;i--)a.push(addDays(end,-i));return a;}
const isoToShort = (iso)=>{const d=new Date(iso);return d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'});}

/* ========= Telegram detection + auth (robust) ========= */
const API_BASE = 'https://taxipro-api.onrender.com';


async function apiPost(path, body) {
try {
const r = await fetch(API_BASE + path, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(body || {})
});
return await r.json();
} catch (e) { console.warn('[TaxiPro] API error', e); return null; }
}


// Ждём появления Telegram.WebApp (до 5 сек) и только потом авторизуемся
(function waitForTelegramAndAuth() {
const startedAt = Date.now();


function tryInit() {
const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;


if (!tg) {
if (Date.now() - startedAt < 5000) {
return setTimeout(tryInit, 100); // подождать ещё
} else {
console.log('[TaxiPro] Telegram.WebApp не найден — страница, вероятно, не в Mini App');
return;
}
}


try { tg.ready(); tg.expand && tg.expand(); } catch {}


// 1) апсерт пользователя + сохранение userId для облачной синхронизации
apiPost('/api/auth/telegram', { initData: tg.initData }).then((r) => {
if (r && r.userId) localStorage.setItem('userId', String(r.userId));
});


// 2) хартбит активности
setInterval(() => {
apiPost('/api/ping', { initData: tg.initData, screen: 'app' });
}, 30_000);
}


// Запускаем сразу и на DOMContentLoaded на всякий случай
tryInit();
document.addEventListener('DOMContentLoaded', tryInit, { once: true });
})();

/* ========= Storage schema =========
{
  activeCarId: string,
  cars: [{id,name,cls,tank,rentPerDay}],
  settings: {
    park: { mode:'none'|'day'|'order'|'percent', dayFee, orderFee, percent },
    taxMode:'none'|'self4'|'ip6'
  },
  dataByCar: {
    [carId]: { [dateISO]: {orders,income,rent,fuel,tips,otherIncome,otherExpense,fines,hours,settings:{park:{...},taxMode}} }
  }
}
==================================== */
const LS_KEY = 'taxiAnalyzerV13';
const FIRST_LAUNCH_RESET_KEY = `${LS_KEY}::firstLaunchResetDone`;
let firstLaunchResetPerformed = false;

function createEmptyApp() {
  return {
    activeCarId: null,
    cars: [],
    settings: {
      park: { mode: 'none', dayFee: 0, orderFee: 0, percent: 0 },
      taxMode: 'none'
    },
    dataByCar: {}
  };
}

function createDemoApp() {
  const carId = crypto.randomUUID();
  const seedData = {};

  // === сентябрь (15–30) ===
  for (let i = 15; i <= 30; i++) {
    const d = `2025-09-${String(i).padStart(2, '0')}`;
    seedData[d] = {
      orders: 18 + (i % 5),
      income: 5500 + (i % 4) * 400,
      rent: 2800,
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
      rent: 2800,
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
      rent: 2800,
      fuel: 1300 + (i % 2) * 100,
      tips: 150 + (i % 2) * 50,
      otherIncome: (i % 5 === 0) ? 400 : 0,
      otherExpense: (i % 4 === 0) ? 200 : 0,
      fines: 0,
      hours: 8 + (i % 3)
    };
  }

  return {
    activeCarId: carId,
    cars: [{ id: carId, name: 'Тигго4', cls: 'Комфорт', tank: 50, rentPerDay: 2800 }],
    settings: {
      park: { mode: 'day', dayFee: 150, orderFee: 15, percent: 4 },
      taxMode: 'none'
    },
    dataByCar: { [carId]: seedData }
  };
}

function loadAll() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return createEmptyApp();
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[TaxiPro] Не удалось прочитать сохранённое состояние, выполняем сброс.', err);
    return createEmptyApp();
  }
}

function saveAll() {
  localStorage.setItem(LS_KEY, JSON.stringify(APP));
}

const PARK_MODES = new Set(['none','day','order','percent']);
const TAX_MODES = new Set(['none','self4','ip6']);
const DAY_FIELDS = ['orders','income','rent','fuel','tips','otherIncome','otherExpense','fines','hours'];

function sanitizeTaxMode(mode) {
  return TAX_MODES.has(mode) ? mode : 'none';
}

function sanitizeParkConfig(raw = {}, defaults = {}) {
  const merged = { ...defaults, ...raw };
  const originalMode = raw && raw.mode;
  let mode = merged.mode != null ? merged.mode : (defaults.mode || 'none');
  if (mode === 'orderRegion' || mode === 'orderCapital') mode = 'order';
  if (!PARK_MODES.has(mode)) mode = 'none';

  const dayFeeNum = Number(merged.dayFee != null ? merged.dayFee : defaults.dayFee);
  const dayFee = Number.isFinite(dayFeeNum) ? Math.max(0, Math.round(dayFeeNum)) : 0;

  let orderSource = merged.orderFee;
  if (orderSource == null && originalMode === 'orderCapital' && merged.orderCapital != null) orderSource = merged.orderCapital;
  if (orderSource == null && originalMode === 'orderRegion' && merged.orderRegion != null) orderSource = merged.orderRegion;
  if (orderSource == null && merged.orderRegion != null) orderSource = merged.orderRegion;
  if (orderSource == null && merged.orderCapital != null) orderSource = merged.orderCapital;
  if (orderSource == null && defaults.orderFee != null) orderSource = defaults.orderFee;
  const orderFeeNum = Number(orderSource);
  const orderFee = Number.isFinite(orderFeeNum) ? Math.max(0, Math.round(orderFeeNum)) : 0;

  const percentNum = Number(merged.percent != null ? merged.percent : defaults.percent);
  const percent = Number.isFinite(percentNum) ? Math.max(0, percentNum) : 0;

  return { mode, dayFee, orderFee, percent };
}

function cloneSnapshot(snapshot) {
  if (!snapshot) {
    return { park: sanitizeParkConfig(), taxMode: 'none', rentPerDay: 0 };
  }
  const rentPerDay = sanitizeRentPerDay(snapshot.rentPerDay, 0);
  return {
    park: sanitizeParkConfig(snapshot.park),
    taxMode: sanitizeTaxMode(snapshot.taxMode),
    rentPerDay
  };
}

function sanitizeSettingsSnapshot(raw, fallbackSnapshot) {
  const fallback = cloneSnapshot(fallbackSnapshot);
  const sourcePark = raw && raw.park ? raw.park : {};
  const park = sanitizeParkConfig(sourcePark, fallback.park);
  const rawTax = raw && raw.taxMode != null ? raw.taxMode : fallback.taxMode;
  const taxMode = sanitizeTaxMode(rawTax);
  const rentPerDay = sanitizeRentPerDay(raw && raw.rentPerDay, fallback.rentPerDay);
  return { park, taxMode, rentPerDay };
}

function normalizeDayEntry(entry, fallbackSnapshot) {
  const base = { orders:0,income:0,rent:0,fuel:0,tips:0,otherIncome:0,otherExpense:0,fines:0,hours:0,commissionManual:null,taxManual:null };
  const day = { ...base, ...(entry || {}) };
  DAY_FIELDS.forEach(key => {
    const num = Number(day[key]);
    day[key] = Number.isFinite(num) ? num : 0;
  });
  day.settings = sanitizeSettingsSnapshot(entry && entry.settings, fallbackSnapshot);
  day.commissionManual = sanitizeOptionalMoney(day.commissionManual);
  day.taxManual = sanitizeOptionalMoney(day.taxManual);
  return day;
}

function clampTank(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 50;
  return Math.max(20, Math.min(120, Math.round(num)));
}

function safeMoney(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.round(num)) : 0;
}

function sanitizeRentPerDay(value, fallback = 0) {
  const source = value != null ? value : fallback;
  return safeMoney(source);
}

function normalizeApp(app){
  app = app || {};
  app.settings = app.settings || {};

  if (!app.settings.park && app.settings.parkMode) {
    const map = {
      none: 'none',
      '150day': 'day',
      '15order': 'order',
      '20order': 'order',
      '4pct': 'percent'
    };
    app.settings.park = { mode: map[app.settings.parkMode] || 'none' };
  }

  const defaultsPark = { mode: 'none', dayFee: 150, orderFee: 15, percent: 4 };
  app.settings.park = sanitizeParkConfig(app.settings.park || {}, defaultsPark);
  delete app.settings.park.orderRegion;
  delete app.settings.park.orderCapital;

  app.settings.taxMode = sanitizeTaxMode(app.settings.taxMode);
  delete app.settings.parkMode;

  if (!Array.isArray(app.cars)) app.cars = [];
  app.cars = app.cars.map(car => {
    const id = car && typeof car.id === 'string' ? car.id : (crypto.randomUUID ? crypto.randomUUID() : `car-${Date.now()}`);
    const tank = clampTank(car && car.tank);
    const rentSource = car && (car.rentPerDay != null ? car.rentPerDay : car.rent);
    const rentPerDay = safeMoney(rentSource);
    return {
      id,
      name: car && car.name ? car.name : 'Без названия',
      cls: car && car.cls ? car.cls : 'Эконом',
      tank,
      rentPerDay
    };
  });

  app.dataByCar = app.dataByCar || {};
  app.cars.forEach(car => {
    if (!app.dataByCar[car.id]) app.dataByCar[car.id] = {};
    const defaultsSnapshot = {
      park: { ...app.settings.park },
      taxMode: app.settings.taxMode,
      rentPerDay: sanitizeRentPerDay(car.rentPerDay)
    };
    const days = app.dataByCar[car.id] || {};
    Object.keys(days).forEach(dateISO => {
      days[dateISO] = normalizeDayEntry(days[dateISO], defaultsSnapshot);
    });
  });

  if (!app.activeCarId || !app.cars.some(c => c.id === app.activeCarId)) {
    app.activeCarId = app.cars[0] ? app.cars[0].id : null;
  }

  return app;
}

function currentSettingsSnapshot(){
  const car = APP.cars.find(c => c.id === APP.activeCarId);
  return {
    park: { ...APP.settings.park },
    taxMode: APP.settings.taxMode,
    rentPerDay: sanitizeRentPerDay(car && car.rentPerDay)
  };
}

const storedResetMarker = localStorage.getItem(FIRST_LAUNCH_RESET_KEY);
let initialAppState;
if (storedResetMarker === 'done') {
  initialAppState = loadAll();
} else {
  firstLaunchResetPerformed = true;
  initialAppState = createEmptyApp();
  localStorage.setItem(FIRST_LAUNCH_RESET_KEY, 'done');
}

/* ========= State ========= */
let APP = normalizeApp(initialAppState);
if (firstLaunchResetPerformed) {
  saveAll();
}

let currentScreen='home';
let currentPeriod='day';
let currentDate=todayISO();

const byCar = () => {
  if (!APP.activeCarId) return null;
  if (!APP.dataByCar[APP.activeCarId]) APP.dataByCar[APP.activeCarId] = {};
  return APP.dataByCar[APP.activeCarId];
};
function getDayData(iso, create=false){
  const store = byCar();
  if (!store) {
    const snapshot = cloneSnapshot(currentSettingsSnapshot());
    return {orders:0,income:0,rent:0,fuel:0,tips:0,otherIncome:0,otherExpense:0,fines:0,hours:0,commissionManual:null,taxManual:null,settings:snapshot};
  }
  let d = store[iso];
  if (d) {
    if (applyAutoRent(d)) saveAll();
    return d;
  }
  const snapshot = cloneSnapshot(currentSettingsSnapshot());
  if (!create) {
    return {orders:0,income:0,rent:0,fuel:0,tips:0,otherIncome:0,otherExpense:0,fines:0,hours:0,commissionManual:null,taxManual:null,settings:snapshot};
  }
  d = {orders:0,income:0,rent:0,fuel:0,tips:0,otherIncome:0,otherExpense:0,fines:0,hours:0,commissionManual:null,taxManual:null,settings:snapshot};
  store[iso] = d;
  return d;
}
const ensureDay = (iso) => {
  if (!APP.activeCarId) return null;
  return getDayData(iso, true);
};
const readDay = (iso) => getDayData(iso, false);

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

const parkDayInput = document.getElementById('parkDayValue');
const parkOrderInput = document.getElementById('parkOrderValue');
const parkPercentInput = document.getElementById('parkPercentValue');
const fromDateInput = document.getElementById('fromDate');
const toDateInput = document.getElementById('toDate');
const rangeBtn = document.getElementById('rangeBtn');

const toastEl = document.getElementById('toast');
let toastTimer = null;

const confirmBg = document.getElementById('confirmBg');
const confirmTitle = document.getElementById('confirmTitle');
const confirmMessage = document.getElementById('confirmMessage');
const confirmCancel = document.getElementById('confirmCancel');
const confirmOk = document.getElementById('confirmOk');
let confirmKeyHandler = null;

function showToast(message, duration = 2600) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, duration);
}

function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    confirmTitle.textContent = options.title || 'Подтверждение';
    confirmMessage.textContent = message;
    confirmOk.textContent = options.okLabel || 'Продолжить';
    confirmCancel.textContent = options.cancelLabel || 'Отмена';
    confirmBg.classList.add('show');

    const cleanup = (result) => {
      confirmBg.classList.remove('show');
      confirmOk.onclick = null;
      confirmCancel.onclick = null;
      confirmBg.removeEventListener('click', onBgClick);
      if (confirmKeyHandler) {
        document.removeEventListener('keydown', confirmKeyHandler);
        confirmKeyHandler = null;
      }
      resolve(result);
    };

    const onBgClick = (e) => {
      if (e.target === confirmBg) cleanup(false);
    };

    confirmOk.onclick = () => cleanup(true);
    confirmCancel.onclick = () => cleanup(false);
    confirmBg.addEventListener('click', onBgClick);

    confirmKeyHandler = (e) => {
      if (e.key === 'Escape') {
        cleanup(false);
      }
    };
    document.addEventListener('keydown', confirmKeyHandler);

    setTimeout(() => {
      confirmOk.focus();
    }, 0);
  });
}

/* ========= Modal (edit values) ========= */
const modalBg = document.getElementById('modalBg');
const modalTitle=document.getElementById('modalTitle');
const modalLabel=document.getElementById('modalLabel');
const modalInput=document.getElementById('modalInput');
const quickArea=document.getElementById('quickArea');
const btnCancel=document.getElementById('btnCancel');
const btnSave=document.getElementById('btnSave');
let modalContext=null;
let modalOpenedAt=0;

const DAY_QUICK_PRESETS = {
  income: [1000,3000,5000],
  otherIncome: [500,1000,2000],
  tips: [50,100,200],
  rent: [500,1000,2000,3000],
  fuel: [100,500,1000],
  otherExpense: [100,300,500],
  fines: [500,1000,3000],
  orders: [1,5,10],
  hours: [1,2,4],
  commissionManual: [200,500,1000,1500],
  taxManual: [200,500,800,1200]
};
const DAY_MONEY_FIELDS = new Set(['income','otherIncome','tips','rent','fuel','otherExpense','fines','commissionManual','taxManual']);

const quickLabelRub = (val) => `+${fmt(val)} ₽`;
const quickLabelPercent = (val) => `+${val}%`;

function defaultParse(raw){
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

function renderQuickFromContext(context){
  const values = context.quick || [];
  quickArea.innerHTML = '';
  quickArea.style.display = values.length ? 'flex' : 'none';
  values.forEach(val=>{
    const chip=document.createElement('div');
    chip.className='chip';
    chip.textContent = context.quickLabel ? context.quickLabel(val) : `+${val}`;
    chip.onclick=()=>{
      const parser = context.parse || defaultParse;
      const current = parser(modalInput.value||0);
      const base = Number.isFinite(current) ? current : 0;
      const next = context.quickMode==='set'
        ? (context.quickCompute ? context.quickCompute(val, base) : val)
        : base + val;
      const preview = context.quickPreview
        ? context.quickPreview(next, val, base)
        : (context.sanitize ? context.sanitize(next) : next);
      const formatted = context.format ? context.format(preview) : preview;
      modalInput.value = formatted;
    };
    quickArea.appendChild(chip);
  });
}

function openModal(context){
  modalContext = {
    title: 'Изменить',
    label: 'Введите значение',
    value: 0,
    step: 1,
    min: 0,
    quick: [],
    quickMode: 'add',
    parse: defaultParse,
    sanitize: (v)=>v,
    format: (v)=>v,
    allowNull: false,
    placeholder: null,
    ...context
  };
  modalOpenedAt = performance.now();
  modalTitle.textContent = modalContext.title;
  modalLabel.textContent = modalContext.label;
  modalInput.type = modalContext.inputType || 'number';
  if (modalContext.min != null) modalInput.min = modalContext.min;
  else modalInput.removeAttribute('min');
  if (modalContext.max != null) modalInput.max = modalContext.max;
  else modalInput.removeAttribute('max');
  modalInput.step = modalContext.step != null ? modalContext.step : 1;
  if (modalContext.inputMode) {
    modalInput.setAttribute('inputmode', modalContext.inputMode);
  } else {
    modalInput.removeAttribute('inputmode');
  }
  if (modalContext.placeholder != null) {
    modalInput.placeholder = modalContext.placeholder;
  } else {
    modalInput.placeholder = '0';
  }
  const hasNullValue = modalContext.allowNull && modalContext.value == null;
  const initialRaw = modalContext.value != null ? modalContext.value : 0;
  if (hasNullValue) {
    modalInput.value = '';
  } else {
    const initial = modalContext.prepare ? modalContext.prepare(initialRaw) : modalContext.sanitize(initialRaw);
    modalInput.value = modalContext.format ? modalContext.format(initial) : initial;
  }
  renderQuickFromContext(modalContext);
  modalBg.classList.add('show');
  modalInput.focus();
  modalInput.select();
}

function closeModal(){
  modalBg.classList.remove('show');
  modalContext=null;
}
btnCancel.onclick=closeModal;
modalBg.addEventListener('pointerdown',e=>{
  if(e.target===modalBg) closeModal();
});
modalBg.addEventListener('click',e=>{
  if(performance.now()-modalOpenedAt<200) return;
  if(e.target===modalBg) closeModal();
});
btnSave.onclick=()=>{
  if(!modalContext) return;
  const context = modalContext;
  const raw = modalInput.value;
  if (context.allowNull && (raw === '' || raw == null)) {
    closeModal();
    if (context.onSave) context.onSave(null);
    return;
  }
  const parser = context.parse || defaultParse;
  let value = parser(raw || 0);
  if (!Number.isFinite(value)) value = context.fallback != null ? context.fallback : 0;
  if (context.min != null) value = Math.max(context.min, value);
  if (context.max != null) value = Math.min(context.max, value);
  value = context.sanitize ? context.sanitize(value) : value;
  if (context.allowNull && value == null) {
    closeModal();
    if (context.onSave) context.onSave(null);
    return;
  }
  closeModal();
  if (context.onSave) context.onSave(value);
};

function openDayModal(field, title){
  if (!APP.activeCarId) {
    showToast('Добавьте авто в настройках, чтобы вносить данные.');
    return;
  }
  const day = ensureDay(currentDate);
  const manualFields = new Set(['commissionManual','taxManual']);
  const isManual = manualFields.has(field);
  let current = day[field];
  if (isManual) {
    if (current != null) {
      const num = Number(current);
      current = Number.isFinite(num) ? num : null;
    } else {
      current = null;
    }
  } else {
    current = Number(day[field]||0);
  }
  const quick = DAY_QUICK_PRESETS[field] || [];
  const isMoney = DAY_MONEY_FIELDS.has(field);
  const isOrders = field==='orders';
  const isHours = field==='hours';
  const sanitize = (val)=>{
    const num = Number(val);
    if (!Number.isFinite(num)) return 0;
    if (isMoney || isOrders || isHours) return Math.max(0, Math.round(num));
    return Math.max(0, num);
  };
  let quickLabel;
  if (quick.length) {
    if (isMoney) quickLabel = quickLabelRub;
    else if (isOrders) quickLabel = (v)=>`+${v}`;
    else if (isHours) quickLabel = (v)=>`+${v} ч`;
  }
  let placeholder = null;
  if (isManual) {
    const prev = day[field];
    day[field] = null;
    const auto = field === 'commissionManual' ? calcCommission(day) : calcTax(day);
    placeholder = `Авто: ${rub(auto)}`;
    day[field] = prev;
  }
  openModal({
    title,
    value: current,
    quick,
    quickLabel,
    quickMode: 'add',
    sanitize,
    allowNull: isManual,
    placeholder,
    onSave:(value)=>{
      if (value == null && isManual) {
        day[field] = null;
      } else {
        day[field]=value;
      }
      applyAutoRent(day);
      saveAll();
      render();
      // === ДОБАВЛЕНО: синхронизация смены в облако ===
      syncShiftToCloud(currentDate);
    }
  });
}

function sanitizeMoneyValue(value){
  return safeMoney(value);
}

function sanitizeOptionalMoney(value){
  if (value === null || value === undefined || value === '') return null;
  return safeMoney(value);
}

function sanitizePercentValue(value){
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.round(num * 10) / 10);
}

function attachModalInput(input, getContext){
  if (!input) return;
  input._modalGetContext = getContext;
  if (!input.dataset.modalBound) {
    input.dataset.modalBound = '1';
    input.readOnly = true;
    input.classList.add('modal-trigger');
    let touchSession = null;

    const triggerModal = (ev) => {
      if (ev) ev.preventDefault();
      const ctxGetter = input._modalGetContext;
      const ctx = ctxGetter && ctxGetter();
      if (ctx) openModal(ctx);
    };

    input.addEventListener('pointerdown', (ev)=>{
      if (ev.pointerType === 'touch') {
        touchSession = {
          id: ev.pointerId,
          x: ev.clientX,
          y: ev.clientY,
          moved: false,
          triggered: false
        };
      } else {
        touchSession = null;
      }
    });

    input.addEventListener('pointermove', (ev)=>{
      if (!touchSession || ev.pointerId !== touchSession.id) return;
      const dx = Math.abs(ev.clientX - touchSession.x);
      const dy = Math.abs(ev.clientY - touchSession.y);
      if (dx > 14 || dy > 14) {
        touchSession.moved = true;
      }
    });

    input.addEventListener('pointerup', (ev)=>{
      if (ev.pointerType === 'touch') {
        if (!touchSession || ev.pointerId !== touchSession.id) {
          touchSession = null;
          return;
        }
        if (!touchSession.moved) {
          touchSession.triggered = true;
          triggerModal(ev);
        }
        return;
      }
      triggerModal(ev);
    });

    input.addEventListener('pointercancel', ()=>{
      touchSession = null;
    });

    input.addEventListener('click', (ev)=>{
      ev.preventDefault();
      if (touchSession) {
        if (touchSession.moved) {
          touchSession = null;
          return;
        }
        if (touchSession.triggered) {
          touchSession = null;
          return;
        }
        triggerModal(ev);
        touchSession = null;
        return;
      }
      triggerModal(ev);
    });
    input.addEventListener('keydown', (ev)=>{
      if (ev.key==='Enter' || ev.key===' ' || ev.key==='Space' || ev.key==='Spacebar') {
        ev.preventDefault();
        const ctxGetter = input._modalGetContext;
        const ctx = ctxGetter && ctxGetter();
        if (ctx) openModal(ctx);
      }
    });
  }
}

/* ========= Car Edit Modal ========= */
const carEditBg=document.getElementById('carEditBg');
const carEditName=document.getElementById('carEditName');
const carEditClass=document.getElementById('carEditClass');
const carEditTank=document.getElementById('carEditTank');
const carEditRent=document.getElementById('carEditRent');
const carEditCancel=document.getElementById('carEditCancel');
const carEditSave=document.getElementById('carEditSave');
let editingCarId=null;

function openCarEdit(car){
  editingCarId=car.id;
  carEditName.value=car.name||'';
  if(car.cls){
    let option=[...carEditClass.options].find(opt=>opt.value===car.cls);
    if(!option){
      option=document.createElement('option');
      option.value=car.cls;
      option.textContent=car.cls;
      carEditClass.appendChild(option);
    }
  }
  carEditClass.value=car.cls||'Эконом';
  carEditTank.value=car.tank||50;
  carEditRent.value=car.rentPerDay||0;
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
  if(carEditTank.value!=='' && carEditTank.value!=null){
    car.tank=clampTank(carEditTank.value);
  }
  if(carEditRent.value!=='' && carEditRent.value!=null){
    car.rentPerDay=safeMoney(carEditRent.value);
  }
  saveAll(); closeCarEdit(); render();
};

/* ========= Cars UI ========= */
const carName=document.getElementById('carName');
const carRentInput=document.getElementById('carRent');
const carTankInput=document.getElementById('carTank');
const classButtons=document.getElementById('classButtons');
let newCarClass='Эконом';

if (carRentInput) {
  attachModalInput(carRentInput, ()=>({
    title: 'Сумма в сутки',
    value: carRentInput.value==='' ? 0 : Number(carRentInput.value),
    min: 0,
    step: 50,
    quick: [500,1000,2000,3000],
    quickLabel: quickLabelRub,
    quickMode: 'add',
    sanitize: sanitizeMoneyValue,
    onSave:(value)=>{ carRentInput.value = value; }
  }));
}

classButtons.querySelectorAll('button').forEach(b=>{
  b.onclick=()=>{
    newCarClass=b.dataset.cls;
    classButtons.querySelectorAll('button').forEach(x=>x.classList.remove('primary'));
    b.classList.add('primary');
  };
});
const defaultClassBtn=classButtons.querySelector('button[data-cls="Эконом"]');
if(defaultClassBtn) defaultClassBtn.classList.add('primary');
const addCarBtn=document.getElementById('addCarBtn');
const carsContainer=document.getElementById('carsContainer');

function resetUiInputs(){
  if (carName) carName.value='';
  if (carRentInput) carRentInput.value='';
  if (carTankInput) carTankInput.value='';
  if (fromDateInput) fromDateInput.value='';
  if (toDateInput) toDateInput.value='';
  newCarClass='Эконом';
  if (classButtons) {
    classButtons.querySelectorAll('button').forEach(x=>x.classList.remove('primary'));
  }
  if (defaultClassBtn) defaultClassBtn.classList.add('primary');
}

if (firstLaunchResetPerformed) {
  resetUiInputs();
}

function renderCars(){
  const items = APP.cars.map(c=>`
    <div class="car-item">
      <div class="car-info"><b>${c.name}</b> · <span class="car-class">${c.cls||'-'}</span> · ${rub(c.rentPerDay||0)} / сутки</div>
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
    b.onclick=async ()=>{
      const id=b.dataset.del;
      const car=APP.cars.find(x=>x.id===id);
      const ok = await showConfirm(`Удалить авто «${car ? car.name : 'Без названия'}» и все связанные данные?`, { okLabel: 'Удалить' });
      if(!ok) return;
      APP.cars=APP.cars.filter(x=>x.id!==id);
      delete APP.dataByCar[id];
      if(APP.activeCarId===id) APP.activeCarId=APP.cars[0]?APP.cars[0].id:null;
      if(!APP.activeCarId) currentDate=todayISO();
      saveAll();
      render();
      showToast('Авто удалено.');
    };
  });
  carsContainer.querySelectorAll('button[data-edit]').forEach(b=>{
    b.onclick=()=>{ const car=APP.cars.find(x=>x.id===b.dataset.edit); if(car) openCarEdit(car); };
  });
}
addCarBtn.onclick=()=>{
  const name=(carName.value||'').trim();
  if(!name) { showToast('Укажи название авто.'); return; }
  const id=crypto.randomUUID();
  const rentPerDay=safeMoney(carRentInput && carRentInput.value!==undefined ? carRentInput.value : 0);
  const tankRaw=carTankInput && carTankInput.value!==undefined && carTankInput.value!=='' ? carTankInput.value : 50;
  APP.cars.push({id,name,cls:newCarClass,tank:clampTank(tankRaw),rentPerDay});
  APP.dataByCar[id]={};
  APP.activeCarId=id;
  carName.value='';
  if(carRentInput) carRentInput.value='';
  if(carTankInput) carTankInput.value='';
  newCarClass='Эконом';
  classButtons.querySelectorAll('button').forEach(x=>x.classList.remove('primary'));
  if(defaultClassBtn) defaultClassBtn.classList.add('primary');
  saveAll(); render();
  showToast('Авто добавлено.');
};

function performAppReset(options = {}) {
  const { silent = false } = options;
  APP = normalizeApp(createEmptyApp());
  saveAll();
  currentPeriod = 'day';
  jumpToLatestDate();
  resetUiInputs();
  render();
  if (!silent) {
    showToast('Данные очищены.');
  }
}

/* ========= Settings (commission & tax) ========= */
function bindSettingsRadios(){
  const park = APP.settings.park;
  document.querySelectorAll('input[name="park"]').forEach(r=>{
    r.checked = (park.mode===r.value);
    r.onchange = ()=>{ park.mode=r.value; saveAll(); render(); };
  });

  const bindParkInput = (input, key, options = {}) => {
    if(!input) return;
    const sanitize = options.sanitize || sanitizeMoneyValue;
    const parse = options.parse || defaultParse;
    const display = options.display || ((v)=>v);
    const quick = options.quick || [];
    const quickLabel = options.quickLabel;
    const min = options.min != null ? options.min : 0;
    const step = options.step != null ? options.step : 1;
    const inputMode = options.inputMode;
    const quickMode = options.quickMode || 'add';

    const sanitized = sanitize(park[key]);
    park[key] = sanitized;
    input.value = display(sanitized);

    attachModalInput(input, ()=>({
      title: options.title || 'Введите значение',
      value: park[key] != null ? park[key] : 0,
      min,
      step,
      quick,
      quickLabel,
      quickMode,
      parse,
      sanitize,
      inputMode,
      onSave:(value)=>{
        park[key] = value;
        input.value = display(value);
        saveAll();
        render();
      }
    }));
  };

  bindParkInput(parkDayInput, 'dayFee', {
    title: 'Фикс за сутки',
    quick: [150,200,300,500],
    quickLabel: quickLabelRub,
    sanitize: sanitizeMoneyValue,
    step: 10,
    quickMode: 'add'
  });
  bindParkInput(parkOrderInput, 'orderFee', {
    title: 'С заказа',
    quick: [10,15,20,25],
    quickLabel: quickLabelRub,
    sanitize: sanitizeMoneyValue,
    step: 5,
    quickMode: 'add'
  });
  bindParkInput(parkPercentInput, 'percent', {
    title: 'Процент с дохода',
    quick: [1,3,4,5,7],
    quickLabel: quickLabelPercent,
    sanitize: sanitizePercentValue,
    parse: (raw)=>{
      const num = parseFloat(raw);
      return Number.isFinite(num) ? num : 0;
    },
    step: 0.1,
    inputMode: 'decimal',
    quickMode: 'add'
  });

  document.querySelectorAll('input[name="tax"]').forEach(r=>{
    r.checked = (APP.settings.taxMode===r.value);
    r.onchange = ()=>{ APP.settings.taxMode=r.value; saveAll(); render(); };
  });
  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) {
    resetBtn.onclick = async () => {
      const ok = await showConfirm('Сбросить все локальные данные? Все данные будут безвозвратно удалены.', { okLabel: 'Очистить' });
      if (!ok) return;
      performAppReset();
    };
  }

  const demoBtn = document.getElementById('demoBtn');
  if (demoBtn) {
    demoBtn.onclick = async () => {
      const ok = await showConfirm('Сбросить все локальные данные и загрузить демо-пример? Все текущие записи будут удалены.', { okLabel: 'Загрузить' });
      if (!ok) return;
      APP = normalizeApp(createDemoApp());
      saveAll();
      currentPeriod = 'day';
      jumpToLatestDate();
      resetUiInputs();
      render();
      showToast('Демо-режим активирован.');
    };
  }

}

/* ========= Calculations ========= */
function hasFeeActivity(d) {
  if (!d) return false;
  return (
    Number(d.income || 0) > 0 ||
    Number(d.orders || 0) > 0 ||
    Number(d.otherIncome || 0) > 0 ||
    Number(d.tips || 0) > 0
  );
}

function applyAutoRent(day) {
  if (!day || !day.settings) return false;
  if (!hasFeeActivity(day)) return false;
  if (Number(day.rent || 0) > 0) return false;
  const rentDefault = sanitizeRentPerDay(day.settings.rentPerDay, 0);
  if (rentDefault > 0) {
    day.rent = rentDefault;
    return true;
  }
  return false;
}

function calcCommission(d){ // парк
  if (d && d.commissionManual != null) {
    const manual = Number(d.commissionManual);
    if (Number.isFinite(manual)) return Math.max(0, Math.round(manual));
  }
  const settings = (d && d.settings) ? d.settings : currentSettingsSnapshot();
  const park = settings.park || {};
  const mode = park.mode || 'none';
  if(mode==='none') return 0;
  if(mode==='day'){
    return hasFeeActivity(d) ? park.dayFee : 0;
  }
  if(mode==='order'){ return (d.orders||0) * park.orderFee; }
  if(mode==='percent'){ return (d.income||0) * (park.percent/100); } // с дохода (без чаевых/прочих доходов)
  return 0;
}
function calcTax(d){
  if (d && d.taxManual != null) {
    const manual = Number(d.taxManual);
    if (Number.isFinite(manual)) return Math.max(0, Math.round(manual));
  }
  const settings = (d && d.settings) ? d.settings : currentSettingsSnapshot();
  const mode = settings.taxMode || 'none';
  if(mode==='self4') return (d.income||0) * 0.04;
  if(mode==='ip6')   return (d.income||0) * 0.06;
  return 0;
}
function calcDay(iso){
  const d = readDay(iso);
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
  const store = byCar();
  if (!store) {
    return {orders:0,income:0,rent:0,fuel:0,tips:0,otherIncome:0,otherExpense:0,fines:0,hours:0,commission:0,tax:0};
  }
  let dirty = false;
  const summary = arr.reduce((acc,iso)=>{
    const d = store[iso];
    if(!d) return acc;
    if (applyAutoRent(d)) dirty = true;
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
  if (dirty) saveAll();
  return summary;
}

function jumpToLatestDate() {
  const carId = APP.activeCarId;
  if (!carId) {
    currentDate = todayISO();
    return;
  }
  const data = APP.dataByCar[carId] || {};
  const dates = Object.keys(data).sort();
  if (dates.length) {
    currentDate = dates[dates.length - 1];
  } else {
    currentDate = todayISO();
  }
}

/* ========= ДОБАВЛЕНО: отправка смены в облако ========= */
function syncShiftToCloud(dateISO) {
  try {
    const userId = localStorage.getItem('userId');
    if (!userId) return;
    const d = calcDay(dateISO);
    const payload = {
      userId: Number(userId),
      date: dateISO,
      income: Number(d.income || 0),
      tipsExtra: Number(d.tips || 0),
      rent: Number(d.rent || 0),
      fuel: Number(d.fuel || 0),
      other: Number(d.otherExpense || 0),
      fines: Number(d.fines || 0),
      hours: Number(d.hours || 0),
      profit: Number(d.profit || 0)
    };
    fetch('https://taxipro-api.onrender.com/api/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(r => r.json())
      .then(() => console.log('☁️ Смена сохранена в облаке', payload))
      .catch(console.error);
  } catch (e) {
    console.error('Cloud sync error:', e);
  }
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
        currentDate = dates[i];
        currentPeriod = 'day';
        tabs.forEach(x => x.classList.remove('active'));
        document.querySelector('.tab[data-period="day"]').classList.add('active');
        dateInput.value = currentDate;
        render();
      } 
      else if (currentPeriod === 'week') {
        const endISO = dates[i];
        const range = rangeDays(endISO, 7);
        const summary = sumRange(range);
        showReportModal('Неделя', range[0], range[6], summary);
      } 
      else if (currentPeriod === 'month') {
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
  activeCarChip.textContent = 'Авто: ' + (car ? `${car.name} · ${car.cls}` : '—');

  const d = new Date(currentDate);
  subtitle.textContent = (currentPeriod==='day')
    ? `Главная · ${d.toLocaleDateString('ru-RU')}`
    : (currentPeriod==='week' ? 'Главная · недели' : 'Главная · месяцы');

  // ====== ДЕНЬ ======
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

 // ====== НЕДЕЛЯ ======
if (currentPeriod === 'week') {
  const weeks = 8; // последние 8 календарных недель, включая текущую
  const arr = [];
  const today = new Date();

  const currentMonday = new Date(today);
  const day = currentMonday.getDay() || 7; // 1=пн, 7=вс
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
    const profit =
      gross -
      (sum.rent +
        sum.fuel +
        sum.otherExpense +
        sum.fines +
        sum.commission +
        sum.tax);

    arr.push({
      label: `${start.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
      })}–${end.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
      })}`,
      startISO,
      endISO,
      profit,
    });
  }

  const vals = arr.map((w) => Math.max(0, w.profit));
  const labels = arr.map((w) => w.label);
  const dates = arr.map((w) => w.endISO);
  renderTimeline(vals, labels, dates);

  const startThisWeek = currentMonday.toLocaleDateString('en-CA');
  const endThisWeek = new Date(currentMonday);
  endThisWeek.setDate(currentMonday.getDate() + 6);

  const rangeThisWeek = [];
  let cur = new Date(currentMonday);
  while (cur <= endThisWeek) {
    rangeThisWeek.push(cur.toLocaleDateString('en-CA'));
    cur.setDate(cur.getDate() + 1);
  }

  const s = sumRange(rangeThisWeek);
  const gross = s.income + s.tips + s.otherIncome;
  const profit =
    gross -
    (s.rent +
      s.fuel +
      s.otherExpense +
      s.fines +
      s.commission +
      s.tax);
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

// ====== МЕСЯЦ ======
if(currentPeriod==='month'){
  const months = 6; // последние 6 календарных месяцев, включая текущий
  const arr = [];
  const now = new Date();

  for(let i = months - 1; i >= 0; i--){
    const year = now.getFullYear();
    const month = now.getMonth() - i;
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    const startISO = start.toLocaleDateString('en-CA');
    const endISO = end.toLocaleDateString('en-CA');

    const range = [];
    let cur = new Date(start);
    while(cur <= end){
      range.push(cur.toLocaleDateString('en-CA'));
      cur.setDate(cur.getDate() + 1);
    }

    const sum = sumRange(range);
    const gross = sum.income + sum.tips + sum.otherIncome;
    const profit = gross - (sum.rent + sum.fuel + sum.otherExpense + sum.fines + sum.commission + sum.tax);

    arr.push({
      label: start.toLocaleString('ru-RU',{month:'short'}),
      startISO,
      endISO,
      profit
    });
  }

  const vals = arr.map(m => Math.max(0, m.profit));
  const labels = arr.map(m => m.label);
  const dates = arr.map(m => m.endISO);
  renderTimeline(vals, labels, dates);

  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const rangeThisMonth = [];
  let cur = new Date(startThisMonth);
  while(cur <= endThisMonth){
    rangeThisMonth.push(cur.toLocaleDateString('en-CA'));
    cur.setDate(cur.getDate() + 1);
  }

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
    let dirty = false;
    for(const car of APP.cars){
      const data = APP.dataByCar[car.id]||{};
      let sum = {orders:0,income:0,rent:0,fuel:0,tips:0,otherIncome:0,otherExpense:0,fines:0,hours:0,commission:0,tax:0};
      Object.keys(data).forEach(iso=>{
        const d=data[iso];
        if (applyAutoRent(d)) dirty = true;
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
    if (dirty) saveAll();
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
// tabs
tabs.forEach(t=>t.addEventListener('click',()=>{
  tabs.forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  currentPeriod=t.dataset.period;
  render();
}));
// nav
navbtns.forEach(n=>n.addEventListener('click',()=>{
  currentScreen=n.dataset.screen;
  render();
}));
// date
dateInput.addEventListener('change', (e)=>{
  currentDate = e.target.value || todayISO();
  if (APP.activeCarId) {
    ensureDay(currentDate);
    saveAll();
  }
  tabs.forEach(x=>x.classList.remove('active'));
  document.querySelector('.tab[data-period="day"]').classList.add('active');
  currentPeriod='day';
  render();
});
// editable cards
document.querySelectorAll('.card[data-edit]').forEach(c=>{
  c.addEventListener('click', ()=>{
    if(currentPeriod!=='day'){
      tabs.forEach(x=>x.classList.remove('active'));
      document.querySelector('.tab[data-period="day"]').classList.add('active');
      currentPeriod='day';
    }
    if(!APP.activeCarId){
      showToast('Добавьте авто в настройках, чтобы вносить данные.');
      return;
    }
    const field=c.dataset.edit;
    const titles={
      income:'Доход за день', tips:'Чаевые за день', otherIncome:'Прочие доходы за день',
      orders:'Количество заказов', rent:'Аренда за день', fuel:'Топливо за день',
      otherExpense:'Прочие расходы за день', fines:'Штрафы за день', hours:'Часы за день',
      commissionManual:'Комиссия парка (ручной ввод)', taxManual:'Налог (ручной ввод)'
    };
    openDayModal(field, titles[field]||'Изменить');
  });
});
// reports tabs
rTabs.forEach(rt=>rt.addEventListener('click',()=>{
  rTabs.forEach(x=>x.classList.remove('active'));
  rt.classList.add('active');
  rMode=rt.dataset.r;
  render();
}));

/* ========= First render ========= */
 // ===== Отчёт по диапазону =====
if (rangeBtn) {
  rangeBtn.onclick = () => {
    const from = fromDateInput ? fromDateInput.value : '';
    const to = toDateInput ? toDateInput.value : '';
    if (!from || !to) { showToast('Укажите обе даты.'); return; }
    if (from > to) { showToast('Дата начала позже даты окончания.'); return; }

    const arr = [];
    let cur = new Date(from);
    const end = new Date(to);
    while (cur <= end) {
      arr.push(cur.toLocaleDateString('en-CA'));
      cur.setDate(cur.getDate() + 1);
    }

    const s = sumRange(arr);
    reportsBody.innerHTML = `
      <div style="margin-bottom:10px;font-size:13px;color:var(--muted);text-align:center;">
        📅 Период: ${isoToShort(from)} — ${isoToShort(to)}
      </div>
      ${buildSummaryCard('Отчёт по диапазону', s)}
    `;
  };
}

 // Первый рендер
 render();

// ==== Телеграм-специфика и защита от свайпов ====
(function initTelegram() {
  const enforceExpand = () => {
    try { Telegram.WebApp.expand(); } catch (e) {}
  };

  try {
    if (window.Telegram && Telegram.WebApp) {
      Telegram.WebApp.ready();

     
      enforceExpand();

      if (Telegram.WebApp.disableVerticalSwipes) {
        Telegram.WebApp.disableVerticalSwipes();
      }

      if (Telegram.WebApp.onEvent) {
        Telegram.WebApp.onEvent('viewportChanged', (state = {}) => {
          const collapsed = state.isExpanded === false;
          const heightShrunk = typeof state.height === 'number'
            && Telegram.WebApp.viewportStableHeight
            && state.height + 2 < Telegram.WebApp.viewportStableHeight;
          if (collapsed || heightShrunk) {
            enforceExpand();
            setTimeout(enforceExpand, 120);
          }
        });
      }

      setTimeout(enforceExpand, 150);
      setTimeout(enforceExpand, 600);

      console.log('[TaxiPro] Telegram WebApp initialized');
    } else {
      console.warn('[TaxiPro] Telegram WebApp не обнаружен');
    }
  } catch (e) {
    console.error('[TaxiPro] Telegram init error:', e);
  }
})();

// Встроенный контейнер `.content` получает собственный скролл, поэтому
// дополнительных обработчиков касаний не требуется: Telegram не получает
// overscroll, а пользователи сохраняют нативные жесты.

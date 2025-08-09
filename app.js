// --- Storage helpers ---
const LS_KEY = 'gastos.records.v1';
const META_KEY = 'gastos.meta.v1';
const DEFAULT_CATS = [
  { key:'comida', name:'Comida', color:'#2ca58d' },
  { key:'mercado', name:'Mercado', color:'#2a6f97' },
  { key:'transporte', name:'Transporte', color:'#ff9f1c' },
  { key:'vivienda', name:'Vivienda', color:'#8d99ae' },
  { key:'servicios', name:'Servicios', color:'#4cc9f0' },
  { key:'salud', name:'Salud', color:'#c77dff' },
  { key:'entretenimiento', name:'Entretenimiento', color:'#f72585' },
  { key:'mascotas', name:'Mascotas', color:'#90be6d' },
  { key:'otros', name:'Otros', color:'#adb5bd' },
];

let records = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
let meta = JSON.parse(localStorage.getItem(META_KEY) || '{}');

function save() {
  localStorage.setItem(LS_KEY, JSON.stringify(records));
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function nowISO() { return new Date().toISOString(); }

// --- Cycle handling ---
function ensureCycleStart() {
  if (!meta.cycleStart) {
    meta.cycleStart = nowISO();
    save();
  }
}

function formatMoney(n) {
  const val = Number(n || 0);
  return '$' + val.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
}

function withinCycle(d) {
  const start = new Date(meta.cycleStart);
  return new Date(d) >= start;
}

// --- UI refs ---
const amountEl = document.getElementById('amount');
const categoryEl = document.getElementById('category');
const addBtn = document.getElementById('addBtn');
const filterBtn = document.getElementById('filterBtn');
const exportBtn = document.getElementById('exportBtn');
const totalEl = document.getElementById('total');
const listEl = document.getElementById('list');
const chipsEl = document.getElementById('chips');
const periodEl = document.getElementById('period');
const pieCanvas = document.getElementById('pie');
const remindersToggle = document.getElementById('remindersToggle');
const closeCycleBtn = document.getElementById('closeCycleBtn');
const showAllBtn = document.getElementById('showAll');
const showIncomeBtn = document.getElementById('showIncome');
const showExpenseBtn = document.getElementById('showExpense');
const budgetNote = document.getElementById('budgetNote');

// --- Filters ---
let activeCat = null;
let typeFilter = 'all'; // all | income | expense

// --- Init categories ---
function populateCategories() {
  DEFAULT_CATS.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.key;
    opt.textContent = c.name;
    categoryEl.appendChild(opt);
  });
}

function drawChips() {
  chipsEl.innerHTML = '';
  const allChip = chipEl('Todas', null, '#28b487');
  chipsEl.appendChild(allChip);
  DEFAULT_CATS.forEach(c => {
    chipsEl.appendChild(chipEl(c.name, c.key, c.color));
  });
}

function chipEl(label, key, color) {
  const div = document.createElement('div');
  div.className = 'chip';
  div.innerHTML = `<span class="dot" style="background:${color}"></span>${label}`;
  div.onclick = () => { activeCat = key; render(); };
  return div;
}

// --- Add record ---
addBtn.onclick = () => {
  const amount = parseFloat(amountEl.value);
  if (isNaN(amount)) return;
  ensureCycleStart();
  const cat = categoryEl.value || 'otros';
  const rec = {
    id: crypto.randomUUID(),
    amount,
    category: cat,
    // type: expense by default; negative amounts considered expense, positive => income
    type: amount >= 0 ? 'expense' : 'income',
    createdAt: nowISO()
  };
  records.unshift(rec);
  save();
  amountEl.value = '';
  render();
};

// --- Filter dialog (simple prompt) ---
filterBtn.onclick = () => {
  const start = prompt('Filtrar desde (YYYY-MM-DD) o vacío');
  const end = prompt('Hasta (YYYY-MM-DD) o vacío');
  meta.rangeFilter = {start, end};
  save();
  render();
};

// --- Export CSV ---
exportBtn.onclick = () => {
  const header = 'id,fecha,importe,tipo,categoria\n';
  const rows = records.map(r => `${r.id},${r.createdAt},${r.amount},${r.type},${r.category}`).join('\n');
  const csv = header + rows;
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gastos.csv';
  a.click();
  URL.revokeObjectURL(url);
};

// --- Render list & totals ---
function render() {
  // period label
  periodEl.textContent = meta.cycleStart ? 
    `Ciclo: ${new Date(meta.cycleStart).toLocaleDateString()}` : 'Ciclo: —';
  
  // compute filtered list
  const rf = meta.rangeFilter || {};
  const start = rf.start ? new Date(rf.start) : null;
  const end = rf.end ? new Date(rf.end) : null;
  const filtered = records.filter(r => {
    if (!withinCycle(r.createdAt)) return false;
    if (activeCat && r.category !== activeCat) return false;
    if (typeFilter === 'income' && r.type !== 'income') return false;
    if (typeFilter === 'expense' && r.type !== 'expense') return false;
    const d = new Date(r.createdAt);
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });

  // totals
  const total = filtered.reduce((acc, r) => acc + (r.type === 'expense' ? Math.abs(r.amount) : -Math.abs(r.amount)), 0);
  totalEl.textContent = formatMoney(total);

  // list
  listEl.innerHTML = '';
  filtered.forEach(r => {
    const c = DEFAULT_CATS.find(x => x.key === r.category) || DEFAULT_CATS.at(-1);
    const row = document.createElement('div');
    row.className = 'item';
    const date = new Date(r.createdAt).toLocaleString();
    const sign = r.type === 'income' ? '+' : '-';
    row.innerHTML = `
      <div class="left">
        <span class="dot" style="background:${c.color}"></span>
        <div>
          <div>${c.name}</div>
          <div class="meta">${date}</div>
        </div>
      </div>
      <div>
        <div class="amt">${sign}${formatMoney(Math.abs(r.amount))}</div>
        <div class="edit"><a href="#" data-id="${r.id}" class="editLink">Editar</a> · <a href="#" data-id="${r.id}" class="delLink">Borrar</a></div>
      </div>
    `;
    listEl.appendChild(row);
  });

  // attach edit/delete
  listEl.querySelectorAll('.delLink').forEach(a => a.onclick = (e) => {
    e.preventDefault();
    const id = a.getAttribute('data-id');
    records = records.filter(r => r.id !== id);
    save(); render();
  });
  listEl.querySelectorAll('.editLink').forEach(a => a.onclick = (e) => {
    e.preventDefault();
    const id = a.getAttribute('data-id');
    const r = records.find(x => x.id === id);
    if (!r) return;
    const newAmt = parseFloat(prompt('Nuevo monto', r.amount));
    if (!isNaN(newAmt)) r.amount = newAmt;
    const newCat = prompt('Nueva categoría (clave):\n' + DEFAULT_CATS.map(c=>`${c.key}=${c.name}`).join(', '), r.category);
    if (newCat) r.category = newCat;
    r.type = newAmt >= 0 ? 'expense' : 'income';
    save(); render();
  });

  drawPie(filtered);
  updateBudgetAdvice();
}

// --- Pie chart (vanilla canvas) ---
function drawPie(items) {
  const ctx = pieCanvas.getContext('2d');
  const w = pieCanvas.width = pieCanvas.clientWidth * devicePixelRatio;
  const h = pieCanvas.height = pieCanvas.clientHeight * devicePixelRatio;
  ctx.clearRect(0,0,w,h);
  const centerX = w/2, centerY = h/2, radius = Math.min(w,h)/2 - 20*devicePixelRatio;

  // sum by category (expenses only)
  const sums = {};
  items.filter(r=>r.type==='expense').forEach(r => {
    sums[r.category] = (sums[r.category] || 0) + Math.abs(r.amount);
  });
  const entries = Object.entries(sums);
  const total = entries.reduce((a,[,v])=>a+v,0);
  if (!total) return;

  let startAngle = -Math.PI/2;
  entries.forEach(([cat, val]) => {
    const c = DEFAULT_CATS.find(x=>x.key===cat);
    const angle = (val/total) * Math.PI*2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fillStyle = (c && c.color) || '#888';
    ctx.fill();
    startAngle += angle;
  });
}

// --- Budget suggestion after 30 days ---
function daysSince(dateISO) {
  const d1 = new Date(dateISO);
  const d2 = new Date();
  return Math.floor((d2 - d1) / (1000*60*60*24));
}

function updateBudgetAdvice() {
  if (!records.length || !meta.cycleStart) {
    budgetNote.textContent = 'Sugerencias de presupuesto disponibles tras 30 días de historial.';
    return;
  }
  const oldest = records.at(-1)?.createdAt || meta.cycleStart;
  const days = daysSince(oldest);
  if (days < 30) {
    budgetNote.textContent = `Llevás ${days} días de historial. Recomendaciones en ${30-days} días.`;
    return;
  }
  // compute rolling 30-day spend per category
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const last30 = records.filter(r => new Date(r.createdAt) >= cutoff && r.type==='expense');
  const sums = {};
  last30.forEach(r => { sums[r.category] = (sums[r.category] || 0) + Math.abs(r.amount); });
  const total = Object.values(sums).reduce((a,b)=>a+b,0);
  // suggest: round up to nearest $10; add 5% buffer
  const lines = Object.entries(sums).sort((a,b)=>b[1]-a[1]).map(([cat, val]) => {
    const c = DEFAULT_CATS.find(x=>x.key===cat);
    const suggested = Math.ceil((val*1.05)/10)*10;
    return `${c?.name || cat}: ${formatMoney(suggested)}`;
  });
  const global = Math.ceil((total*1.05)/10)*10;
  budgetNote.textContent = `Presupuesto sugerido (basado en tus últimos 30 días +5%): Total ${formatMoney(global)} · ` + lines.join(' · ');
}

// --- Reminders (Web Notifications; only works if installed PWA + permission) ---
remindersToggle.onchange = async () => {
  if (remindersToggle.checked) {
    if (Notification && Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { remindersToggle.checked = false; return; }
    }
    meta.reminders = true;
    save();
    scheduleLocalReminder();
  } else {
    meta.reminders = false; save();
    // Note: no reliable cancel without push or Alarm API; we rely on daily trigger when app opens.
  }
};

function scheduleLocalReminder() {
  if (!('Notification' in window)) return;
  // Fire a gentle reminder if app is open around 21:00 local
  const now = new Date();
  const target = new Date();
  target.setHours(21, 0, 0, 0);
  if (now > target) target.setDate(target.getDate()+1);
  const delay = target - now;
  setTimeout(() => {
    if (meta.reminders) new Notification('Recordatorio de gastos', { body: '¿Anotaste tus gastos de hoy?' });
    scheduleLocalReminder();
  }, Math.min(delay, 12*60*60*1000)); // safety cap
}

// --- Footer filters ---
showAllBtn.onclick = () => { typeFilter='all'; render(); };
showIncomeBtn.onclick = () => { typeFilter='income'; render(); };
showExpenseBtn.onclick = () => { typeFilter='expense'; render(); };

// --- Close cycle ---
closeCycleBtn.onclick = () => {
  if (!confirm('¿Cerrar ciclo actual y empezar uno nuevo?')) return;
  meta.cycleStart = new Date().toISOString();
  save(); render();
};

// --- Register SW ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}

// --- Init ---
populateCategories();
drawChips();
render();
if (meta.reminders) { remindersToggle.checked = true; scheduleLocalReminder(); }
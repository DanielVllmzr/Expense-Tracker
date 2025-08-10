// app.js adaptado para Firestore
// Mantiene las preferencias locales, pero guarda/lee gastos desde Firestore en tiempo real.

const META_KEY='gastos.meta.v4';
const DEFAULT_CATS=[
  {key:'todas',name:'Todas',color:'#28b487'},
  {key:'comida',name:'Comida',color:'#2ca58d'},
  {key:'mercado',name:'Mercado',color:'#2a6f97'},
  {key:'transporte',name:'Transporte',color:'#ff9f1c'},
  {key:'vivienda',name:'Vivienda',color:'#8d99ae'},
  {key:'servicios',name:'Servicios',color:'#4cc9f0'},
  {key:'salud',name:'Salud',color:'#c77dff'},
  {key:'entretenimiento',name:'Entretenimiento',color:'#f72585'},
  {key:'mascotas',name:'Mascotas',color:'#90be6d'},
  {key:'otros',name:'Otros',color:'#adb5bd'}
];

let records = [];
let meta = JSON.parse(localStorage.getItem(META_KEY)||'{}');
if(!meta.selectedDate){ meta.selectedDate = todayYMD(); }
if(!meta.chartOrientation){ meta.chartOrientation='vertical'; }
saveMeta();

function saveMeta(){ localStorage.setItem(META_KEY, JSON.stringify(meta)); }
function toYMD(d){ const z=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; }
function todayYMD(){ return toYMD(new Date()); }
function localYMDfromISO(iso){ return toYMD(new Date(iso)); }
function formatMoney(n){ const val=Number(n||0); return '$'+val.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }

// UI refs
const amountEl=document.getElementById('amount');
const categoryEl=document.getElementById('category');
const addBtn=document.getElementById('addBtn');
const filterBtn=document.getElementById('filterBtn');
const exportBtn=document.getElementById('exportBtn');
const listEl=document.getElementById('list');
const chipsEl=document.getElementById('chips');
const periodEl=document.getElementById('period');
const pieCanvas=document.getElementById('pie');
const remindersToggle=document.getElementById('remindersToggle');
const todayBtn=document.getElementById('todayBtn');
const datePicker=document.getElementById('datePicker');
const showAllBtn=document.getElementById('showAll');
const showIncomeBtn=document.getElementById('showIncome');
const showExpenseBtn=document.getElementById('showExpense');
const budgetNote=document.getElementById('budgetNote');
const segExpense=document.getElementById('segExpense');
const segIncome=document.getElementById('segIncome');
const totExpenses=document.getElementById('totExpenses');
const totIncomes=document.getElementById('totIncomes');
const totNet=document.getElementById('totNet');
const chartOrientation=document.getElementById('chartOrientation');
const normalizeBtn=document.getElementById('normalizeBtn');

// Filtros
let activeCat=null;
let typeFilter='all';
let addType='expense';

// Categorías
function populateCategories(){
  categoryEl.innerHTML='';
  DEFAULT_CATS.slice(1).forEach(c=>{
    const opt=document.createElement('option'); opt.value=c.key; opt.textContent=c.name; categoryEl.appendChild(opt);
  });
}
function drawChips(){
  chipsEl.innerHTML='';
  DEFAULT_CATS.forEach(c=>chipsEl.appendChild(chipEl(c.name,c.key,c.color)));
}
function chipEl(label,key,color){
  const div=document.createElement('div');
  div.className='chip';
  div.innerHTML=`<span class="dot" style="background:${color}"></span>${label}`;
  div.onclick=()=>{ activeCat=(key==='todas'?null:key); render(); };
  return div;
}

// Segment
segExpense.onclick=()=>{ addType='expense'; segExpense.classList.add('active'); segIncome.classList.remove('active'); };
segIncome.onclick=()=>{ addType='income'; segIncome.classList.add('active'); segExpense.classList.remove('active'); };

// Agregar registro (Firestore)
addBtn.onclick=async ()=>{
  const amount=parseFloat(amountEl.value);
  if(isNaN(amount)) return;
  const cat=categoryEl.value||'otros';
  const ymd=meta.selectedDate||todayYMD();
  const now=new Date();
  const [yy,mm,dd]=ymd.split('-').map(Number);
  const at=new Date(yy, (mm||1)-1, dd||1, now.getHours(), now.getMinutes(), now.getSeconds(), 0);
  await window.dataStore.addExpense({
    amount: Math.abs(amount),
    category: cat,
    type: addType,
    createdAtISO: at.toISOString()
  });
  amountEl.value='';
};

// Filtrar
filterBtn.onclick=()=>{
  const start=prompt('Filtrar desde (YYYY-MM-DD) o vacío');
  const end=prompt('Hasta (YYYY-MM-DD) o vacío');
  meta.rangeFilter={start,end}; saveMeta(); render();
};

// Export CSV
exportBtn.onclick=()=>{
  const header='id,fecha,importe,tipo,categoria\n';
  const rows=records.map(r=>`${r.id},${r.createdAt},${r.amount},${r.type},${r.category}`).join('\n');
  const blob=new Blob([header+rows],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='gastos.csv'; a.click(); URL.revokeObjectURL(url);
};

// Render
function render(){
  chartOrientation.value=meta.chartOrientation;
  periodEl.textContent=`Día: ${meta.selectedDate}`;
  datePicker.value=meta.selectedDate;

  const rf=meta.rangeFilter||{}; const start=rf.start?new Date(rf.start):null; const end=rf.end?new Date(rf.end):null;
  const filtered=records.filter(r=>{
    if(localYMDfromISO(r.createdAt)!==meta.selectedDate) return false;
    if(activeCat && r.category!==activeCat) return false;
    if(typeFilter==='income' && r.type!=='income') return false;
    if(typeFilter==='expense' && r.type!=='expense') return false;
    const d=new Date(r.createdAt);
    if(start && d<start) return false;
    if(end && d>end) return false;
    return true;
  });

  const expenses = filtered.filter(r=>r.type==='expense').reduce((a,r)=>a+Math.abs(r.amount),0);
  const incomes  = filtered.filter(r=>r.type==='income').reduce((a,r)=>a+Math.abs(r.amount),0);
  totExpenses.textContent=formatMoney(expenses);
  totIncomes.textContent=formatMoney(incomes);
  totNet.textContent=formatMoney(expenses - incomes);

  listEl.innerHTML='';
  filtered.forEach(r=>{
    const c=DEFAULT_CATS.find(x=>x.key===r.category) || DEFAULT_CATS.at(-1);
    const row=document.createElement('div'); row.className='item';
    const date=new Date(r.createdAt).toLocaleString();
    const sign=r.type==='income'?'+':'-';
    row.innerHTML=`
      <div class="left">
        <span class="dot" style="background:${c.color}"></span>
        <div><div>${c.name}</div><div class="meta">${date}</div></div>
      </div>
      <div>
        <div class="amt">${sign}${formatMoney(Math.abs(r.amount))}</div>
        <div class="edit"><a href="#" data-id="${r.id}" class="editLink">Editar</a> · <a href="#" data-id="${r.id}" class="delLink del">Borrar</a></div>
      </div>`;
    listEl.appendChild(row);
  });

  listEl.querySelectorAll('.delLink').forEach(a=>a.onclick=async (e)=>{
    e.preventDefault(); const id=a.getAttribute('data-id'); await window.dataStore.deleteExpense(id);
  });
  listEl.querySelectorAll('.editLink').forEach(a=>a.onclick=async (e)=>{
    e.preventDefault();
    const id=a.getAttribute('data-id');
    const r=records.find(x=>x.id===id); if(!r) return;
    const newAmt=parseFloat(prompt('Nuevo monto', r.amount)); 
    const newCat=prompt('Nueva categoría (clave):\n'+DEFAULT_CATS.slice(1).map(c=>`${c.key}=${c.name}`).join(', '), r.category);
    const newType=prompt('Tipo (expense/income)', r.type);
    const patch={};
    if(!isNaN(newAmt)) patch.amount=Math.abs(newAmt);
    if(newCat) patch.category=newCat;
    if(newType==='expense'||newType==='income') patch.type=newType;
    if(Object.keys(patch).length) await window.dataStore.updateExpense(id, patch);
  });

  if(meta.chartOrientation==='horizontal'){ drawBarsHorizontal(filtered);} else { drawBarsVertical(filtered); }
  updateBudgetAdvice();
}

// Gráficos, recordatorios y demás funciones: se mantienen igual que antes (no mostradas aquí por brevedad).
// Al final:
populateCategories();
drawChips();
render();
window.dataStore?.onReady(()=>{ window.dataStore.watchExpenses((items)=>{ records=items||[]; render(); }); });

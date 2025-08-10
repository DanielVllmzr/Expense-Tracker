// app.js adaptado para Firestore (completo)
// Guarda/lee gastos desde Firestore en tiempo real. Mantiene preferencias locales (meta).

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
if(!meta.viewMode){ meta.viewMode='day'; }
if(!meta.customCats){ meta.customCats=[]; }
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
const monthToggle=document.getElementById('monthToggle');
const noteEl=document.getElementById('note');
const manageCats=document.getElementById('manageCats');

// Filtros
let activeCat=null;
let typeFilter='all';
let addType='expense';

// Categorías
function allCategories(){
  const base=[...DEFAULT_CATS];
  (meta.customCats||[]).forEach(c=>{ if(!base.some(b=>b.key===c.key)){ base.push(c); } });
  return base;
}
function populateCategories(){
  categoryEl.innerHTML='';
  allCategories().slice(1).forEach(c=>{
    const opt=document.createElement('option'); opt.value=c.key; opt.textContent=c.name; categoryEl.appendChild(opt);
  });
}
function drawChips(){
  chipsEl.innerHTML='';
  allCategories().forEach(c=>chipsEl.appendChild(chipEl(c.name,c.key,c.color)));
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
  try{
    if(!window.dataStore || !window.dataStore.addExpense){
      alert('La base se está inicializando. Probá de nuevo en 1-2 segundos.');
      return;
    }
    addBtn.disabled = true;
    const raw = (amountEl.value||'').replace(',', '.');
    const amount=parseFloat(raw);
    if(isNaN(amount)) { alert('Ingresá un monto'); addBtn.disabled=false; return; }
    const cat=categoryEl.value||'otros';
    const ymd=meta.selectedDate||todayYMD();
    const now=new Date();
    const [yy,mm,dd]=ymd.split('-').map(Number);
    const at=new Date(yy,(mm||1)-1,dd||1, now.getHours(),now.getMinutes(),now.getSeconds(),0);
    await window.dataStore.addExpense({
      amount: Math.abs(amount),
      category: cat,
      type: addType,
      note: (noteEl?.value||'').trim() || null,
      createdAtISO: at.toISOString()
    });
    amountEl.value=''; if(noteEl) noteEl.value='';
  }catch(err){
    console.error('[Agregar] Error', err);
    alert('No se pudo guardar: '+(err?.message||err));
  } finally {
    addBtn.disabled = false;
  }
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
function ymOfISO(iso){ const d=new Date(iso); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function render(){
  chartOrientation.value=meta.chartOrientation;
  periodEl.textContent=(meta.viewMode==='month' ? `Mes: ${meta.selectedDate.slice(0,7)}` : `Día: ${meta.selectedDate}`);
  datePicker.value=meta.selectedDate;
  const rf=meta.rangeFilter||{};

  const rf=meta.rangeFilter||{}; const start=rf.start?new Date(rf.start):null; const end=rf.end?new Date(rf.end):null;
  const filtered=records.filter(r=>{
    if(meta.viewMode==='day'){ if(localYMDfromISO(r.createdAt)!==meta.selectedDate) return false; }
    else { if(ymOfISO(r.createdAt)!==meta.selectedDate.slice(0,7)) return false; }
    if(activeCat && r.category!==activeCat) return false;
    if(typeFilter==='income' && r.type!=='income') return false;
    if(typeFilter==='expense' && r.type!=='expense') return false;
    const rf=meta.rangeFilter||{}; const start=rf.start?new Date(rf.start):null; const end=rf.end?new Date(rf.end):null;
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
    const c=(allCategories().find(x=>x.key===r.category)) || DEFAULT_CATS.at(-1);
    const row=document.createElement('div'); row.className='item';
    const date=new Date(r.createdAt).toLocaleString(); const note=r.note?`<div class=\"meta\">${r.note}</div>`:'';
    const sign=r.type==='income'?'+':'-';
    row.innerHTML=`
      <div class="left">
        <span class="dot" style="background:${c.color}"></span>
        <div><div>${c.name}</div><div class=\"meta\">${date}</div>${note}</div>
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

// Barras
function drawBarsHorizontal(items){
  const ctx=pieCanvas.getContext('2d');
  const w=pieCanvas.width=pieCanvas.clientWidth*devicePixelRatio;
  const h=pieCanvas.height=pieCanvas.clientHeight*devicePixelRatio;
  ctx.clearRect(0,0,w,h);
  const sums={}; items.filter(r=>r.type==='expense').forEach(r=>{ sums[r.category]=(sums[r.category]||0)+Math.abs(r.amount); });
  const entries=Object.entries(sums).sort((a,b)=>b[1]-a[1]); if(!entries.length) return;
  const pad=20*devicePixelRatio, barH=20*devicePixelRatio, gap=12*devicePixelRatio, labelW=100*devicePixelRatio;
  const maxVal=Math.max(...entries.map(([,v])=>v)); let y=pad;
  ctx.font=`${12*devicePixelRatio}px -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, Arial`; ctx.textBaseline='middle';
  entries.forEach(([cat,val])=>{
    const c=allCategories().find(x=>x.key===cat); const barW=Math.max(2,(w-pad*2-labelW)*(val/maxVal));
    ctx.fillStyle='#8b94a7'; ctx.fillText(c?.name||cat, pad, y+barH/2);
    ctx.fillStyle=(c&&c.color)||'#888'; ctx.fillRect(pad+labelW, y, barW, barH);
    ctx.fillStyle='#e9edf5'; ctx.fillText(formatMoney(val), Math.min(w-pad-40*devicePixelRatio, pad+labelW+barW+6*devicePixelRatio), y+barH/2);
    y+=barH+gap;
  });
}
function drawBarsVertical(items){
  const ctx=pieCanvas.getContext('2d');
  const w=pieCanvas.width=pieCanvas.clientWidth*devicePixelRatio;
  const h=pieCanvas.height=pieCanvas.clientHeight*devicePixelRatio;
  ctx.clearRect(0,0,w,h);
  const sums={}; items.filter(r=>r.type==='expense').forEach(r=>{ sums[r.category]=(sums[r.category]||0)+Math.abs(r.amount); });
  const entries=Object.entries(sums).sort((a,b)=>b[1]-a[1]); if(!entries.length) return;
  const pad=20*devicePixelRatio; const labelH=30*devicePixelRatio; const innerH=h-pad*2-labelH;
  const approxChar=8*devicePixelRatio; const barW=Math.max(10*devicePixelRatio, approxChar*6); const gap=8*devicePixelRatio;
  const maxVal=Math.max(...entries.map(([,v])=>v));
  let x=pad + ((w - pad*2) - (entries.length*(barW+gap)-gap))/2;
  ctx.font=`${11*devicePixelRatio}px -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, Arial`; ctx.textAlign='center';
  entries.forEach(([cat,val])=>{
    const c=allCategories().find(x=>x.key===cat);
    const barH=Math.max(2, innerH*(val/maxVal)); const y=pad+(innerH-barH);
    ctx.fillStyle=(c&&c.color)||'#888'; ctx.fillRect(x,y,barW,barH);
    ctx.fillStyle='#e9edf5'; ctx.textBaseline='bottom'; ctx.fillText(formatMoney(val), x+barW/2, y-4*devicePixelRatio);
    ctx.fillStyle='#8b94a7'; ctx.textBaseline='top'; ctx.fillText(c?.name||cat, x+barW/2, pad+innerH+4*devicePixelRatio);
    x+=barW+gap;
  });
}

// Presupuesto
function daysSince(dateISO){ const d1=new Date(dateISO), d2=new Date(); return Math.floor((d2-d1)/(1000*60*60*24)); }
function updateBudgetAdvice(){
  if(!records.length){ budgetNote.textContent='Sugerencias de presupuesto disponibles tras 30 días de historial.'; return; }
  const oldest = records.at(-1)?.createdAt || new Date().toISOString();
  const days=daysSince(oldest);
  if(days<30){ budgetNote.textContent=`Llevás ${days} días de historial. Recomendaciones en ${30-days} días.`; return; }
  const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-30);
  const last30=records.filter(r=>new Date(r.createdAt)>=cutoff && r.type==='expense');
  const sums={}; last30.forEach(r=>{ sums[r.category]=(sums[r.category]||0)+Math.abs(r.amount); });
  const total=Object.values(sums).reduce((a,b)=>a+b,0);
  const lines=Object.entries(sums).sort((a,b)=>b[1]-a[1]).map(([cat,val])=>{
    const c=allCategories().find(x=>x.key===cat); const suggested=Math.ceil((val*1.05)/10)*10; return `${c?.name||cat}: ${formatMoney(suggested)}`;
  });
  const global=Math.ceil((total*1.05)/10)*10;
  budgetNote.textContent=`Presupuesto sugerido (últimos 30 días +5%): Total ${formatMoney(global)} · `+lines.join(' · ');
}

// Recordatorios
remindersToggle.onchange=async()=>{
  if(remindersToggle.checked){
    if(Notification && Notification.permission!=='granted'){ const perm=await Notification.requestPermission(); if(perm!=='granted'){ remindersToggle.checked=false; return; } }
    meta.reminders=true; saveMeta(); scheduleLocalReminder();
  } else { meta.reminders=false; saveMeta(); }
};
function scheduleLocalReminder(){
  if(!('Notification' in window)) return;
  const now=new Date(); const target=new Date(); target.setHours(21,0,0,0); if(now>target) target.setDate(target.getDate()+1);
  const delay=target-now; setTimeout(()=>{ if(meta.reminders) new Notification('Recordatorio de gastos',{body:'¿Anotaste tus gastos de hoy?'}); scheduleLocalReminder(); }, Math.min(delay, 12*60*60*1000));
}

// Footer filtros
showAllBtn.onclick=()=>{ typeFilter='all'; render(); };
showIncomeBtn.onclick=()=>{ typeFilter='income'; render(); };
showExpenseBtn.onclick=()=>{ typeFilter='expense'; render(); };

// Fecha
datePicker.value=meta.selectedDate;
datePicker.onchange=()=>{ meta.selectedDate=datePicker.value||todayYMD(); saveMeta(); render(); };
todayBtn.onclick=()=>{ meta.selectedDate=todayYMD(); datePicker.value=meta.selectedDate; saveMeta(); render(); };

// Orientación barras
chartOrientation.value=meta.chartOrientation;
chartOrientation.onchange=()=>{ meta.chartOrientation=chartOrientation.value; saveMeta(); render(); };

// Normalizar (deshabilitado para cambios masivos en Firestore)
async function normalizeNoonTimes(){
  alert('Con Firestore, esta acción masiva se deshabilita para evitar sobrescrituras. Editá cada gasto desde la lista.');
}
normalizeBtn.onclick=normalizeNoonTimes;

// Pull to refresh
(function(){
  const ptr=document.getElementById('ptr'); const bubble=ptr.querySelector('.bubble');
  let startY=0, pulling=false, pulled=0, threshold=70;
  window.addEventListener('touchstart',(e)=>{ if(document.scrollingElement.scrollTop===0){ startY=e.touches[0].clientY; pulling=true; pulled=0; } }, {passive:true});
  window.addEventListener('touchmove',(e)=>{ if(!pulling) return; const dy=e.touches[0].clientY-startY; if(dy>0){ pulled=Math.min(dy,120); ptr.style.transform=`translateY(${pulled/3}px)`; ptr.classList.add('show'); bubble.textContent = pulled>threshold ? '✓' : '↻'; } }, {passive:true});
  window.addEventListener('touchend', async ()=>{ if(!pulling) return; pulling=false; ptr.style.transform=''; if(pulled>threshold){ setTimeout(()=>location.reload(),300); } else { ptr.classList.remove('show'); } setTimeout(()=>{ ptr.classList.remove('spin'); ptr.classList.remove('show'); },600); });
})();

// Service worker
if('serviceWorker' in navigator){ window.addEventListener('load', ()=>{ navigator.serviceWorker.register('./sw-v29.js'); }); }

// Realtime de Firestore
function startRealtime(){
  const unsubscribe = window.dataStore.watchExpenses((items)=>{
    records = items || [];
    render();
  });
  return unsubscribe;
}

// Init visual
populateCategories();
drawChips();
render();

// Esperar sesión y enganchar data
window.dataStore?.onReady(()=>{ startRealtime(); });

// Toggle día/mes
monthToggle.onclick=()=>{
  if(meta.viewMode==='day'){ meta.viewMode='month'; }
  else { meta.viewMode='day'; }
  saveMeta(); render();
};

// Gestionar categorías
manageCats.onclick=()=>{
  const action = prompt('Acción: add / rename / remove');
  if(!action) return;
  if(action==='add'){
    const key = prompt('Clave (sin espacios, ej: gimnasio)');
    const name= prompt('Nombre visible (ej: Gimnasio)');
    const color= prompt('Color hex (ej: #ff8800)', '#ff8800');
    if(key && name){ meta.customCats = meta.customCats||[]; meta.customCats.push({key,name,color}); saveMeta(); populateCategories(); drawChips(); render(); }
  } else if(action==='rename'){
    const key = prompt('Clave a renombrar:');
    const name= prompt('Nuevo nombre:');
    const c = (meta.customCats||[]).find(x=>x.key===key);
    if(c && name){ c.name=name; saveMeta(); drawChips(); render(); }
  } else if(action==='remove'){
    const key = prompt('Clave a eliminar:');
    meta.customCats = (meta.customCats||[]).filter(x=>x.key!==key);
    saveMeta(); populateCategories(); drawChips(); render();
  }
};

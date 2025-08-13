// app.js (v41)
const META_KEY='gastos.meta.v6';
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
const CUSTOM_CATS_KEY='gastos.customCats.v1';
function loadCustomCats(){ try{ return JSON.parse(localStorage.getItem(CUSTOM_CATS_KEY)||'[]'); }catch(e){ return []; } }
function saveCustomCats(cats){ localStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify(cats||[])); }
function allCats(){
  const map=new Map(DEFAULT_CATS.map(c=>[c.key,c]));
  for(const c of loadCustomCats()){ map.set(c.key,c); }
  const arr=[...map.values()];
  const i=arr.findIndex(c=>c.key==='todas'); if(i>0){ const [a]=arr.splice(i,1); arr.unshift(a); }
  return arr;
}

let records=[];
let meta=JSON.parse(localStorage.getItem(META_KEY)||'{}');
if(!meta.selectedDate){ meta.selectedDate = todayYMD(); }
if(!meta.viewMode){ meta.viewMode='day'; }
if(!meta.chartOrientation){ meta.chartOrientation='vertical'; }
saveMeta();

// === NUEVO: para animar sólo los nuevos y evitar animar todo en el primer snapshot ===
const seenIds = new Set();

function saveMeta(){ localStorage.setItem(META_KEY, JSON.stringify(meta)); }
function toYMD(d){ const z=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; }
function toYM(d){ const z=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}`; }
function todayYMD(){ return toYMD(new Date()); }
function localYMDfromISO(iso){ return toYMD(new Date(iso)); }
function formatMoney(n){ const val=Number(n||0); return '$'+val.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }

// refs
const amountEl=document.getElementById('amount');
const categoryEl=document.getElementById('category');
const noteEl=document.getElementById('note');
const addBtn=document.getElementById('addBtn');
const filterBtn=document.getElementById('filterBtn');
const exportBtn=document.getElementById('exportBtn');
const listEl=document.getElementById('list');
const chipsEl=document.getElementById('chips');
const periodEl=document.getElementById('period');
const pieCanvas=document.getElementById('pie');
const remindersToggle=document.getElementById('remindersToggle');
const todayBtn=document.getElementById('todayBtn');
const monthBtn=document.getElementById('monthBtn');
const datePicker=document.getElementById('datePicker');
const showAllBtn=document.getElementById('showAll');
const showIncomeBtn=document.getElementById('showIncome');
const showExpenseBtn=document.getElementById('showExpense');
const segExpense=document.getElementById('segExpense');
const segIncome=document.getElementById('segIncome');
const totExpenses=document.getElementById('totExpenses');
const totIncomes=document.getElementById('totIncomes');
const totNet=document.getElementById('totNet');
const chartOrientation=document.getElementById('chartOrientation');
const normalizeBtn=document.getElementById('normalizeBtn');
const manageCatsBtn=document.getElementById('manageCatsBtn');
const catsPanel=document.getElementById('catsPanel');
const catsBody=document.getElementById('catsBody');
const addCatBtn=document.getElementById('addCatBtn');
const newKey=document.getElementById('newKey');
const newName=document.getElementById('newName');
const newColor=document.getElementById('newColor');

// state filtros
let activeCat=null, typeFilter='all', addType='expense';

function populateCategories(){
  categoryEl.innerHTML='';
  allCats().slice(1).forEach(c=>{
    const opt=document.createElement('option'); opt.value=c.key; opt.textContent=c.name; categoryEl.appendChild(opt);
  });
}
function drawChips(){
  chipsEl.innerHTML='';
  allCats().forEach(c=>chipsEl.appendChild(chipEl(c.name,c.key,c.color)));
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

// Add
addBtn.onclick=async ()=>{
  try{
    if(!window.dataStore || !window.dataStore.addExpense){ alert('Cargando base… probá en un momento'); return; }
    addBtn.disabled=true;
    const raw=(amountEl.value||'').replace(',','.');
    const amount=parseFloat(raw);
    if(isNaN(amount)){ alert('Ingresá un monto válido'); addBtn.disabled=false; return; }
    const cat=categoryEl.value||'otros';
    const ymd=meta.selectedDate||todayYMD();
    const [yy,mm,dd]=ymd.split('-').map(Number);
    const now=new Date();
    const at=new Date(yy,(mm||1)-1,(dd||1), now.getHours(), now.getMinutes(), now.getSeconds(), 0);
    const note=(noteEl && typeof noteEl.value==='string') ? noteEl.value.trim() : '';
    await window.dataStore.addExpense({
      amount: Math.abs(amount),
      category: cat,
      type: addType,
      note,
      createdAtISO: at.toISOString()
    });
    amountEl.value=''; if(noteEl) noteEl.value='';
  }catch(e){
    console.error(e);
    alert('No se pudo guardar: '+(e?.message||e));
  }finally{
    addBtn.disabled=false;
  }
};

// Filter simple
filterBtn.onclick=()=>{
  const start=prompt('Filtrar desde (YYYY-MM-DD) o vacío');
  const end=prompt('Hasta (YYYY-MM-DD) o vacío');
  meta.rangeFilter={start,end}; saveMeta(); render();
};

// Export CSV
exportBtn.onclick=()=>{
  const header='id,fecha,importe,tipo,categoria,nota\n';
  const rows=records.map(r=>`${r.id},${r.createdAt},${r.amount},${r.type},${r.category},"${(r.note||'').replaceAll('"','""')}"`).join('\n');
  const blob=new Blob([header+rows],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='gastos.csv'; a.click(); URL.revokeObjectURL(url);
};

// === NUEVO: swipe con acciones Editar (verde) y Borrar (rojo), estilo iOS ===
function attachSwipeHandlers(cell, front, record){
  const ACTION_W = 88;               // ancho de cada botón
  const MAX_OPEN = ACTION_W*2 + 8;   // dos botones + gap
  let startX=0, dx=0, dragging=false, openX=0;

  // Delegación de clicks en los botones
  cell.querySelector('.swipe-actions')?.addEventListener('click', async (ev)=>{
    const btn = ev.target.closest('.action');
    if(!btn) return;
    const act = btn.getAttribute('data-act');

    if(act==='del'){
      if(confirm('¿Borrar este movimiento?')){
        await window.dataStore.deleteExpense(record.id);
      }
    } else if(act==='edit'){
      const newAmt = parseFloat(prompt('Nuevo monto', record.amount));
      const newCat = prompt('Nueva categoría (clave):\n'+DEFAULT_CATS.slice(1).map(c=>`${c.key}=${c.name}`).join(', '), record.category);
      const newType= prompt('Tipo (expense/income)', record.type);
      const patch = {};
      if(!isNaN(newAmt)) patch.amount = Math.abs(newAmt);
      if(newCat) patch.category = newCat;
      if(newType==='expense'||newType==='income') patch.type=newType;
      if(Object.keys(patch).length) await window.dataStore.updateExpense(record.id, patch);
    }

    // cerrar al terminar
    openX = 0;
    front.style.transition = 'transform .18s cubic-bezier(.22,.61,.36,1)';
    front.style.transform  = 'translateX(0)';
    setTimeout(()=>front.style.transition='', 200);
  });

  cell.addEventListener('touchstart',(e)=>{
    if(!e.touches?.length) return;
    startX   = e.touches[0].clientX;
    dx       = 0;
    dragging = true;
    front.style.transition = '';
  }, {passive:true});

  cell.addEventListener('touchmove',(e)=>{
    if(!dragging || !e.touches?.length) return;
    dx = e.touches[0].clientX - startX + openX;
    dx = Math.min(0, dx);                  // sólo abre hacia la izquierda
    dx = Math.max(-MAX_OPEN, dx);          // límite máximo
    front.style.transform = `translateX(${dx}px)`;
    front.style.setProperty('--dx', `${dx}px`);
    front.classList.toggle('hint-left', dx< -12);
    front.classList.toggle('hint-right', dx> 12);
  }, {passive:true});

  cell.addEventListener('touchend', ()=>{
    if(!dragging) return;
    dragging = false;

    // snap natural a 0, -88 o -184
    const positions = [0, -ACTION_W, -(ACTION_W*2 + 8)];
    const current   = parseFloat((front.style.transform.match(/-?\d+(\.\d+)?/g)||[0])[0]);
    let snap = positions.reduce((p, n)=> Math.abs(n-current) < Math.abs(p-current) ? n : p, positions[0]);

    front.style.transition = 'transform .18s cubic-bezier(.22,.61,.36,1)';
    front.style.transform  = `translateX(${snap}px)`;
    openX = snap;
    setTimeout(()=>front.style.transition='', 200);
  }, {passive:true});

  // tap para cerrar si está abierto
  front.addEventListener('click', ()=>{
    if(openX!==0){
      openX = 0;
      front.style.transition = 'transform .18s cubic-bezier(.22,.61,.36,1)';
      front.style.transform  = 'translateX(0)';
      setTimeout(()=>front.style.transition='', 200);
    }
  });
}

// Render
function render(){
  // toolbar labels
  monthBtn.textContent = meta.viewMode==='month' ? 'Día' : 'Mes';
  datePicker.value = meta.selectedDate;
  periodEl.textContent = meta.viewMode==='month' ? `Mes: ${toYM(new Date(meta.selectedDate))}` : `Día: ${meta.selectedDate}`;

  const rf=meta.rangeFilter||{}; const start=rf.start?new Date(rf.start):null; const end=rf.end?new Date(rf.end):null;
  const filtered=records.filter(r=>{
    if(meta.viewMode==='day'){
      if(localYMDfromISO(r.createdAt)!==meta.selectedDate) return false;
    } else {
      const ym=toYM(new Date(r.createdAt));
      if(ym!==toYM(new Date(meta.selectedDate))) return false;
    }
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
    const c=allCats().find(x=>x.key===r.category) || allCats().at(-1);
    const date=new Date(r.createdAt).toLocaleString();
    const sign=r.type==='income'?'+':'-';

    // Contenedor swipe
    const cell = document.createElement('div');
    cell.className = 'swipe-cell';

    // Acciones (detrás)
    cell.innerHTML = `
      <div class="swipe-actions">
        <button class="action edit"  data-act="edit"  data-id="${r.id}" aria-label="Editar">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L18.81 8.94l-3.75-3.75L3 17.25Zm15.71-9.46c.39-.39.39-1.02 0-1.41l-2.09-2.09a1 1 0 0 0-1.41 0l-1.67 1.67 3.75 3.75 1.42-1.92Z" fill="currentColor"/></svg>
        </button>
        <button class="action del"   data-act="del"   data-id="${r.id}" aria-label="Borrar">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H6v2h12V4h-2.5l-1-1Z" fill="currentColor"/></svg>
        </button>
      </div>`;

    // Fila (frente)
    const row = document.createElement('div');
    row.className = 'item swipe-foreground';
    row.innerHTML = `
      <div class="left">
        <span class="dot" style="background:${c?.color||'#888'}"></span>
        <div><div>${c?.name||r.category}</div><div class="meta">${date}${r.note?(' · '+r.note):''}</div></div>
      </div>
      <div>
        <div class="amt">${sign}${formatMoney(Math.abs(r.amount))}</div>
      </div>`;

    cell.appendChild(row);
    listEl.appendChild(cell);

    // handlers de swipe + animación si es nuevo
    // === Swipe con ancho dinámico (iOS-like) ===
function attachSwipeHandlers(cell, front, record){
  const actions = cell.querySelector('.swipe-actions');
  const EDIT_BTN = actions?.querySelector('.action.edit');
  const DEL_BTN  = actions?.querySelector('.action.del');

  // ancho total a revelar (dos botones + gap + paddings)
  function computeMaxOpen(){
    if (!actions) return 184; // fallback
    // forzamos que las acciones ocupen la altura de la fila
    actions.style.height = front.offsetHeight + 'px';
    return actions.scrollWidth; // ancho real de lo que hay detrás
  }
  let MAX_OPEN = computeMaxOpen();

  let startX=0, dx=0, dragging=false, openX=0;

  // delegación de clicks en acciones
  actions?.addEventListener('click', async (ev)=>{
    const btn = ev.target.closest('.action');
    if(!btn) return;
    const act = btn.dataset.act;

    if(act==='del'){
      if(confirm('¿Borrar este movimiento?')){
        await window.dataStore.deleteExpense(record.id);
      }
    }else if(act==='edit'){
      const newAmt = parseFloat(prompt('Nuevo monto', record.amount));
      const newCat = prompt('Nueva categoría (clave):\n'+DEFAULT_CATS.slice(1).map(c=>`${c.key}=${c.name}`).join(', '), record.category);
      const newType= prompt('Tipo (expense/income)', record.type);
      const patch={};
      if(!isNaN(newAmt)) patch.amount=Math.abs(newAmt);
      if(newCat) patch.category=newCat;
      if(newType==='expense'||newType==='income') patch.type=newType;
      if(Object.keys(patch).length) await window.dataStore.updateExpense(record.id, patch);
    }

    // cerrar
    openX = 0;
    front.style.transition='transform .18s cubic-bezier(.22,.61,.36,1)';
    front.style.transform='translateX(0)';
    setTimeout(()=>front.style.transition='', 200);
  });

  // recalcular si cambia el tamaño (orientación, etc.)
  new ResizeObserver(()=>{ MAX_OPEN = computeMaxOpen(); }).observe(front);

  cell.addEventListener('touchstart',(e)=>{
    if(!e.touches?.length) return;
    startX = e.touches[0].clientX;
    dx=0; dragging=true;
    front.style.transition='';
  }, {passive:true});

  cell.addEventListener('touchmove',(e)=>{
    if(!dragging || !e.touches?.length) return;
    dx = e.touches[0].clientX - startX + openX;
    dx = Math.min(0, dx);               // sólo a la izquierda
    dx = Math.max(-MAX_OPEN, dx);       // no más que lo disponible
    front.style.transform = `translateX(${dx}px)`;
  }, {passive:true});

  cell.addEventListener('touchend', ()=>{
    if(!dragging) return; dragging=false;

    // Snap natural a: cerrado, medio (1 botón) o abierto total
    const oneBtn = actions ? (EDIT_BTN?.offsetWidth || 88) : 88;
    const positions = [0, -oneBtn, -MAX_OPEN];
    const current = parseFloat((front.style.transform.match(/-?\d+(\.\d+)?/g)||[0])[0]);
    let snap = positions.reduce((p,n)=>Math.abs(n-current)<Math.abs(p-current)?n:p, positions[0]);

    front.style.transition='transform .18s cubic-bezier(.22,.61,.36,1)';
    front.style.transform=`translateX(${snap}px)`;
    openX = snap;
    setTimeout(()=>front.style.transition='', 200);
  }, {passive:true});

  // tap para cerrar si está abierto
  front.addEventListener('click', ()=>{
    if(openX!==0){
      openX=0;
      front.style.transition='transform .18s cubic-bezier(.22,.61,.36,1)';
      front.style.transform='translateX(0)';
      setTimeout(()=>front.style.transition='', 200);
    }
  });
}
    if (!seenIds.has(r.id)) {
      row.classList.add('just-added');
      seenIds.add(r.id);
      setTimeout(()=>row.classList.remove('just-added'), 450);
    }
  });

  if(meta.chartOrientation==='horizontal'){ drawBarsHorizontal(filtered);} else { drawBarsVertical(filtered); }
  updateBudgetAdvice();
}

// Chart helpers
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
    const c=allCats().find(x=>x.key===cat); const barW=Math.max(2,(w-pad*2-labelW)*(val/maxVal));
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
    const c=allCats().find(x=>x.key===cat);
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
  if(!records.length){ document.getElementById('budgetNote').textContent='Sugerencias de presupuesto disponibles tras 30 días de historial.'; return; }
  const oldest = records.at(-1)?.createdAt || new Date().toISOString();
  const days=daysSince(oldest);
  if(days<30){ document.getElementById('budgetNote').textContent=`Llevás ${days} días de historial. Recomendaciones en ${30-days} días.`; return; }
  const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-30);
  const last30=records.filter(r=>new Date(r.createdAt)>=cutoff && r.type==='expense');
  const sums={}; last30.forEach(r=>{ sums[r.category]=(sums[r.category]||0)+Math.abs(r.amount); });
  const total=Object.values(sums).reduce((a,b)=>a+b,0);
  const lines=Object.entries(sums).sort((a,b)=>b[1]-a[1]).map(([cat,val])=>{
    const c=allCats().find(x=>x.key===cat); const suggested=Math.ceil((val*1.05)/10)*10; return `${c?.name||cat}: ${formatMoney(suggested)}`;
  });
  const global=Math.ceil((total*1.05)/10)*10;
  document.getElementById('budgetNote').textContent=`Presupuesto sugerido (últimos 30 días +5%): Total ${formatMoney(global)} · `+lines.join(' · ');
}

// Filtros footer
showAllBtn.onclick=()=>{ typeFilter='all'; render(); };
showIncomeBtn.onclick=()=>{ typeFilter='income'; render(); };
showExpenseBtn.onclick=()=>{ typeFilter='expense'; render(); };

// Fecha
datePicker.value = meta.selectedDate;
datePicker.onchange=()=>{ meta.selectedDate=datePicker.value||todayYMD(); saveMeta(); render(); };
todayBtn.onclick=()=>{ meta.selectedDate=todayYMD(); datePicker.value=meta.selectedDate; saveMeta(); render(); };
monthBtn.onclick=()=>{ meta.viewMode = (meta.viewMode==='month'?'day':'month'); saveMeta(); render(); };

// Orientación
chartOrientation.value=meta.chartOrientation;
chartOrientation.onchange=()=>{ meta.chartOrientation=chartOrientation.value; saveMeta(); render(); };

// Normalizar
normalizeBtn.onclick=()=>alert('Acción masiva deshabilitada para evitar sobrescrituras. Editá cada gasto desde la lista.');

// Gestionar categorías
if(manageCatsBtn){
  manageCatsBtn.onclick=()=>{
    if(catsPanel.hasAttribute('hidden')){ catsPanel.removeAttribute('hidden'); renderCatManager(); }
    else { catsPanel.setAttribute('hidden',''); }
  };
}
function renderCatManager(){
  if(!catsBody) return;
  catsBody.innerHTML='';
  const base=DEFAULT_CATS.slice(1).map(c=>({...c,_base:true}));
  const custom=loadCustomCats().map(c=>({...c,_base:false}));
  const all=[...base, ...custom];
  all.forEach(c=>{
    const row=document.createElement('div'); row.className='cat-row';
    row.innerHTML=`
      <input type="color" value="${c.color}" class="colInp">
      <input type="text" value="${c.key}" class="keyInp" ${c._base?'disabled':''}>
      <input type="text" value="${c.name}" class="nameInp" ${c._base?'disabled':''}>
      <div class="actions">
        <button class="ghost saveBtn">Guardar</button>
        ${c._base ? '' : '<button class="danger delBtn">Eliminar</button>'}
      </div>`;
    const [col,key,name]=row.querySelectorAll('input');
    const save=row.querySelector('.saveBtn');
    const del=row.querySelector('.delBtn');
    save.onclick=()=>{
      if(c._base){
        const next=loadCustomCats().filter(x=>x.key!==c.key);
        next.push({key:c.key, name:c.name, color:col.value});
        saveCustomCats(next);
      } else {
        const nk=(key.value||'').trim()||c.key;
        const nn=(name.value||'').trim()||c.name;
        const next=loadCustomCats().filter(x=>x.key!==c.key);
        next.push({key:nk, name:nn, color:col.value});
        saveCustomCats(next);
      }
      populateCategories(); drawChips(); renderCatManager(); render();
    };
    if(del){ del.onclick=()=>{ const next=loadCustomCats().filter(x=>x.key!==c.key); saveCustomCats(next); populateCategories(); drawChips(); renderCatManager(); render(); }; }
    catsBody.appendChild(row);
  });
}
if(addCatBtn){
  addCatBtn.onclick=()=>{
    const key=(newKey.value||'').trim();
    const name=(newName.value||'').trim();
    const color=(newColor.value||'#999').trim();
    if(!key || key==='todas'){ alert('Clave inválida'); return; }
    const next=loadCustomCats().filter(x=>x.key!==key); next.push({key,name:name||key,color});
    saveCustomCats(next);
    newKey.value=''; newName.value='';
    populateCategories(); drawChips(); renderCatManager(); render();
  };
}

// Pull to refresh
(function(){
  const ptr=document.getElementById('ptr'); const bubble=ptr.querySelector('.bubble');
  let startY=0, pulling=false, pulled=0, threshold=70;
  window.addEventListener('touchstart',(e)=>{ if(document.scrollingElement.scrollTop===0){ startY=e.touches[0].clientY; pulling=true; pulled=0; } }, {passive:true});
  window.addEventListener('touchmove',(e)=>{ if(!pulling) return; const dy=e.touches[0].clientY-startY; if(dy>0){ pulled=Math.min(dy,120); ptr.style.transform=`translateY(${pulled/3}px)`; ptr.classList.add('show'); bubble.textContent = pulled>threshold ? '✓' : '↻'; } }, {passive:true});
  window.addEventListener('touchend', async ()=>{ if(!pulling) return; pulling=false; ptr.style.transform=''; if(pulled>threshold){ setTimeout(()=>location.reload(),300); } else { ptr.classList.remove('show'); } setTimeout(()=>{ ptr.classList.remove('spin'); ptr.classList.remove('show'); },600); });
})();

// Service worker (nuevo)
if('serviceWorker' in navigator){ window.addEventListener('load', ()=>{ navigator.serviceWorker.register('./sw-v41.js'); }); }

// Realtime
function startRealtime(){
  let first = true;
  const unsubscribe = window.dataStore.watchExpenses((items)=>{
    // Primera hidratación: no animar los existentes
    if (first && Array.isArray(items)) {
      items.forEach(it => seenIds.add(it.id));
      first = false;
    }
    records=items||[];
    render();
  });
  return unsubscribe;
}
populateCategories(); drawChips(); render();

if(window.dataStore && window.dataStore.onReady){ window.dataStore.onReady(()=>startRealtime()); }
else { window.addEventListener('dataStoreReady', ()=>{ window.dataStore?.onReady(()=>startRealtime()); }, {once:true}); }
// firestore-data.js
import { getApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import {
  getFirestore, collection, addDoc, query, orderBy, onSnapshot,
  doc, deleteDoc, updateDoc, Timestamp
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

// Re-usa la app ya inicializada en index.html
const app = getApp();
const auth = getAuth(app);
const db   = getFirestore(app);

function enqueuePending(op){ try{ const arr=JSON.parse(localStorage.getItem('gastos.queue')||'[]'); arr.push(op); localStorage.setItem('gastos.queue', JSON.stringify(arr)); }catch{} }
async function flushQueue(){
  const arr=JSON.parse(localStorage.getItem('gastos.queue')||'[]');
  if(!arr.length) return;
  const u = auth.currentUser; if(!u) return;
  const remaining=[];
  for (const op of arr){
    try{
      if(op.kind==='add'){
        const when = op.createdAtISO ? Timestamp.fromDate(new Date(op.createdAtISO)) : Timestamp.now();
        await addDoc(userCol(u), { amount:Number(op.amount), category:op.category||'otros', type:(op.type==='income'?'income':'expense'), note: op.note||null, createdAt: when });
      }
    }catch(e){ remaining.push(op); }
  }
  localStorage.setItem('gastos.queue', JSON.stringify(remaining));
}
window.addEventListener('online', ()=>{ flushQueue(); });


// Helpers
const userCol = (u) => collection(db, `users/${u.uid}/expenses`);
const userDoc = (u, id) => doc(db, `users/${u.uid}/expenses/${id}`);

window.dataStore = {
  onReady(fn) { onAuthStateChanged(auth, async (u) => { if(u){ await flushQueue(); fn(u); } }); },

  watchExpenses(cb) {
    const u = auth.currentUser;
    if (!u) throw new Error('No hay usuario logueado');
    const q = query(userCol(u), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      const items = [];
      snap.forEach(d => {
        const x = d.data();
        const iso = x.createdAt?.toDate ? x.createdAt.toDate().toISOString() : (x.createdAt || new Date().toISOString());
        items.push({ id: d.id, amount: x.amount, category: x.category, type: x.type, note: x.note||null, createdAt: iso });
      });
      cb(items);
    });
  },

  async addExpense({ amount, category, type, note, createdAtISO }) {
    const u = auth.currentUser;
    if (!u) throw new Error('No hay usuario logueado');
    const when = createdAtISO ? Timestamp.fromDate(new Date(createdAtISO)) : Timestamp.now();
    if(!navigator.onLine){ enqueuePending({kind:'add', amount, category, type, note, createdAtISO}); return; }
    try{
      await addDoc(userCol(u), { amount: Number(amount), category: category || 'otros', type: type === 'income' ? 'income' : 'expense', note: note||null, createdAt: when });
    } catch(e){ enqueuePending({kind:'add', amount, category, type, note, createdAtISO}); }
  },

  async updateExpense(id, data) {
    const u = auth.currentUser;
    if (!u) throw new Error('No hay usuario logueado');
    if (data.createdAt && typeof data.createdAt === 'string') {
      data.createdAt = Timestamp.fromDate(new Date(data.createdAt));
    }
    await updateDoc(userDoc(u, id), data);
  },

  async deleteExpense(id) {
    const u = auth.currentUser;
    if (!u) throw new Error('No hay usuario logueado');
    await deleteDoc(userDoc(u, id));
  }
};

window.dispatchEvent(new Event('dataStoreReady'));
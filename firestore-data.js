// firestore-data.js (v41)
import { getApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import {
  getFirestore, collection, addDoc, query, orderBy, onSnapshot,
  doc, deleteDoc, updateDoc, Timestamp
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

const app = getApp();
const auth = getAuth(app);
const db   = getFirestore(app);

const userCol = (u) => collection(db, `users/${u.uid}/expenses`);
const userDoc = (u, id) => doc(db, `users/${u.uid}/expenses/${id}`);

window.dataStore = {
  onReady(fn) { onAuthStateChanged(auth, (u) => u && fn(u)); },

  watchExpenses(cb) {
    const u = auth.currentUser;
    if (!u) throw new Error('No hay usuario logueado');
    const q = query(userCol(u), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      const items = [];
      snap.forEach(d => {
        const x = d.data();
        const iso = x.createdAt?.toDate ? x.createdAt.toDate().toISOString() : (x.createdAt || new Date().toISOString());
        items.push({ id: d.id, amount: x.amount, category: x.category, type: x.type, createdAt: iso, note: x.note || '' });
      });
      cb(items);
    });
  },

  async addExpense({ amount, category, type, createdAtISO, note }) {
    const u = auth.currentUser;
    if (!u) throw new Error('No hay usuario logueado');
    const when = createdAtISO ? Timestamp.fromDate(new Date(createdAtISO)) : Timestamp.now();
    await addDoc(userCol(u), {
      amount: Number(amount),
      category: category || 'otros',
      type: type === 'income' ? 'income' : 'expense',
      createdAt: when,
      note: typeof note === 'string' ? note : ''
    });
  },

  async updateExpense(id, data) {
    const u = auth.currentUser;
    if (!u) throw new Error('No hay usuario logueado');
    const patch = { ...data };
    if (patch.createdAt && typeof patch.createdAt === 'string') {
      patch.createdAt = Timestamp.fromDate(new Date(patch.createdAt));
    }
    await updateDoc(userDoc(u, id), patch);
  },

  async deleteExpense(id) {
    const u = auth.currentUser;
    if (!u) throw new Error('No hay usuario logueado');
    await deleteDoc(userDoc(u, id));
  }
};

// avisar que data store cargó
window.dispatchEvent(new Event('dataStoreReady'));

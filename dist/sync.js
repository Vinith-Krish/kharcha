import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import { doc, getFirestore, onSnapshot, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const OWNER_EMAIL = 'vinithkrishna20@gmail.com';

export async function createCloudSync(callbacks) {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  let currentUser = null;
  let unsubscribe = null;
  let writeTimer = null;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });

  const ledgerRef = user => doc(db, 'users', user.uid, 'ledgers', 'main');

  async function push(data, immediate = false) {
    if (!currentUser) return;
    clearTimeout(writeTimer);
    const write = async () => {
      callbacks.onStatus('syncing');
      try {
        await setDoc(ledgerRef(currentUser), { salaries:data.salaries || {}, expenses:data.expenses || [], updatedAt:serverTimestamp() });
        callbacks.onStatus('synced');
        return true;
      } catch (error) {
        callbacks.onStatus('error', friendlyError(error));
        return false;
      }
    };
    if (immediate) return write();
    writeTimer = setTimeout(write, 450);
  }

  onAuthStateChanged(auth, user => {
    clearTimeout(writeTimer);
    unsubscribe?.();
    unsubscribe = null;
    currentUser = user?.email?.toLowerCase() === OWNER_EMAIL ? user : null;
    callbacks.onUser(currentUser);
    resolveReady?.();
    resolveReady = null;
    if (!currentUser) {
      callbacks.onStatus('offline');
      if (user) firebaseSignOut(auth);
      return;
    }
    callbacks.onStatus('syncing');
    let receivedFirstSnapshot = false;
    unsubscribe = onSnapshot(ledgerRef(currentUser), snapshot => {
      if (auth.currentUser?.uid !== user.uid) return;
      if (snapshot.exists()) {
        const remote = normalizeSyncData(snapshot.data());
        if (!receivedFirstSnapshot) {
          const local = normalizeSyncData(callbacks.getLocalData());
          const merged = mergeLedgers(local, remote);
          callbacks.onData(merged);
          push(merged, true);
        } else {
          callbacks.onData(remote);
          callbacks.onStatus('synced');
        }
      } else if (!receivedFirstSnapshot) {
        push(normalizeSyncData(callbacks.getLocalData()), true);
      } else {
        callbacks.onStatus('synced');
      }
      receivedFirstSnapshot = true;
    }, error => callbacks.onStatus('error', friendlyError(error)));
  });

  await ready;
  return {
    get user() { return currentUser; },
    signIn: async (email, password) => {
      if (email.trim().toLowerCase() !== OWNER_EMAIL) throw new Error('This account is not allowed to use this app.');
      return signInWithEmailAndPassword(auth, email, password);
    },
    signOut: async () => {
      if (!await push(normalizeSyncData(callbacks.getLocalData()), true)) {
        throw new Error('Could not save your latest changes. Check your connection before signing out.');
      }
      return firebaseSignOut(auth);
    },
    push: (data, immediate = false) => push(normalizeSyncData(data || callbacks.getLocalData()), immediate),
    syncNow: () => push(normalizeSyncData(callbacks.getLocalData()), true)
  };
}

function normalizeSyncData(data) {
  const source = data && typeof data === 'object' ? data : {};
  const salaries = source.salaries && typeof source.salaries === 'object' ? source.salaries : {};
  const expenses = Array.isArray(source.expenses) ? source.expenses : [];
  return { salaries, expenses };
}

function mergeLedgers(local, remote) {
  const salaries = { ...(remote.salaries || {}) };
  Object.entries(local.salaries || {}).forEach(([key, value]) => {
    if (!(key in salaries)) salaries[key] = value;
  });
  const byId = new Map();
  (remote.expenses || []).forEach(expense => {
    if (expense && typeof expense === 'object' && expense.id) byId.set(expense.id, expense);
  });
  (local.expenses || []).forEach(expense => {
    if (expense && typeof expense === 'object' && expense.id && !byId.has(expense.id)) byId.set(expense.id, expense);
  });
  return { salaries, expenses: [...byId.values()] };
}

function friendlyError(error) {
  const code = error?.code || '';
  if (code.includes('invalid-credential')) return 'Incorrect email or password.';
  if (code.includes('email-already-in-use')) return 'An account already exists for this email.';
  if (code.includes('weak-password')) return 'Use a password with at least 6 characters.';
  if (code.includes('network-request-failed')) return 'No internet connection. Changes remain saved on this device.';
  if (code.includes('permission-denied')) return 'Cloud access was denied. Please sign in again.';
  return error?.message?.replace(/^Firebase:\s*/, '') || 'Cloud sync could not complete.';
}

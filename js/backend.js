// Accès aux données : Firebase Firestore (base temps réel) + Firebase Authentication (connexion des coachs).
import { firebaseConfig } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const configured = !!(firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("REMPLACER"));

let db = null, auth = null, F = null, A = null;
if (configured) {
  const [app, firestore, authMod] = await Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-firestore.js"),
    import(SDK + "firebase-auth.js"),
  ]);
  F = firestore; A = authMod;
  const fbApp = app.initializeApp(firebaseConfig);
  db = F.getFirestore(fbApp);
  auth = A.getAuth(fbApp);
  // La connexion ne survit pas à la fermeture du navigateur (il faut se reconnecter à la prochaine ouverture).
  try { await A.setPersistence(auth, A.browserSessionPersistence); } catch (e) { console.warn("persistance", e); }
}

export const backend = {
  configured,

  // Écoute une collection entière ; cb reçoit { id: data }. Retourne la fonction de désabonnement.
  watchCollection(col, cb, onError) {
    return F.onSnapshot(F.collection(db, col), snap => {
      const out = {};
      snap.forEach(d => { out[d.id] = d.data(); });
      cb(out);
    }, err => { console.error(col, err); onError && onError(err); });
  },

  watchDoc(col, id, cb, onError) {
    return F.onSnapshot(F.doc(db, col, id), d => cb(d.exists() ? d.data() : null), err => { console.error(col, err); onError && onError(err); });
  },

  // Écoute les documents d'une collection filtrés par égalité : filters = [[champ, valeur], ...].
  watchWhere(col, filters, cb, onError) {
    const q = F.query(F.collection(db, col), ...filters.map(([f, v]) => F.where(f, "==", v)));
    return F.onSnapshot(q, snap => {
      const out = {};
      snap.forEach(d => { out[d.id] = d.data(); });
      cb(out);
    }, err => { console.error(col, err); onError && onError(err); });
  },

  async getAll(col) {
    const snap = await F.getDocs(F.collection(db, col));
    const out = {};
    snap.forEach(d => { out[d.id] = d.data(); });
    return out;
  },

  set: (col, id, data) => F.setDoc(F.doc(db, col, id), data),
  remove: (col, id) => F.deleteDoc(F.doc(db, col, id)),

  // Écrit toutes les collections d'une sauvegarde { collection: { id: data } } par lots de 400.
  async importAll(dump) {
    const writes = [];
    for (const col of Object.keys(dump)) {
      for (const [id, data] of Object.entries(dump[col] || {})) writes.push([col, id, data]);
    }
    for (let i = 0; i < writes.length; i += 400) {
      const batch = F.writeBatch(db);
      writes.slice(i, i + 400).forEach(([col, id, data]) => batch.set(F.doc(db, col, id), data));
      await batch.commit();
    }
    return writes.length;
  },

  onAuth: cb => A.onAuthStateChanged(auth, cb),
  login: (email, password) => A.signInWithEmailAndPassword(auth, email, password),
  logout: () => A.signOut(auth),
  resetPassword: email => A.sendPasswordResetEmail(auth, email),
};

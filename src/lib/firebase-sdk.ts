/**
 * The only file that imports the Firebase SDK. It is only ever loaded with import() from ./firebase,
 * so a guest who never uses accounts never downloads it (docs/ACCOUNTS.md ADR-A5).
 */
export { initializeApp } from 'firebase/app';
export { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
export {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  onAuthStateChanged,
  GoogleAuthProvider,
  EmailAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  deleteUser,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
} from 'firebase/auth';
export {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  connectFirestoreEmulator,
  doc,
  onSnapshot,
  runTransaction,
  deleteDoc,
  serverTimestamp,
  terminate,
  clearIndexedDbPersistence,
} from 'firebase/firestore';

import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

/** Canonical web config for project yoselinscleaning-cdee8 (public client keys). */
const CANONICAL_WEB_CONFIG = {
  apiKey: 'AIzaSyCY9KLQ92zEUWyPGIDiz5dEYhMkoy8-frA',
  authDomain: 'yoselinscleaning-cdee8.firebaseapp.com',
  projectId: 'yoselinscleaning-cdee8',
  storageBucket: 'yoselinscleaning-cdee8.firebasestorage.app',
  messagingSenderId: '351796906675',
  appId: '1:351796906675:web:98c3f9daa91698c8657ec6',
};

function resolveWebConfig() {
  const fromEnv = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const looksValid = fromEnv.apiKey
    && fromEnv.projectId
    && fromEnv.authDomain
    && fromEnv.appId
    && !String(fromEnv.apiKey).includes('your_')
    && !String(fromEnv.projectId).includes('your_')
    && fromEnv.projectId === CANONICAL_WEB_CONFIG.projectId;

  // Ignore misconfigured env (wrong project / placeholders) so Google login works in production.
  return looksValid ? fromEnv : CANONICAL_WEB_CONFIG;
}

const firebaseConfig = resolveWebConfig();

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
// Persistence is set per sign-in flow — do not force session here (breaks mobile Google auth).

export const db = getFirestore(app);
export const storage = getStorage(app);
export const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'pgyb41494@gmail.com';
export const ADMIN_EMAILS = [
  'pgyb41494@gmail.com',
  'Cardonayoselin422@gmail.com',
  'cardonayoselin422@gmail.com',
];

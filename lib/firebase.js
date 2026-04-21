import { initializeApp, getApps } from 'firebase/app';
import { getAuth, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Export mutable bindings so callers can import them safely even when Firebase
// is disabled in the runtime environment.
export let auth = null;
export let db = null;
export let storage = null;

// Simple flag consumers can check to know whether Firebase is available.
export const FIREBASE_ENABLED = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
  process.env.NEXT_PUBLIC_FIREBASE_APP_ID
);

if (FIREBASE_ENABLED) {
  const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
  auth = getAuth(app);
  // Session-only login (clears when browser/tab is closed)
  try {
    setPersistence(auth, browserSessionPersistence).catch(() => {});
  } catch (e) {}
  db = getFirestore(app);
  storage = getStorage(app);
} else {
  if (typeof window !== 'undefined') {
    // Helpful debug message in client consoles when vars aren't set.
    // Avoid throwing so the app can gracefully degrade.
    // eslint-disable-next-line no-console
    console.warn('Firebase not configured - interactive features disabled');
  }
}

export const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'pgyb41494@gmail.com';
export const ADMIN_EMAILS = [
  process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'pgyb41494@gmail.com',
  'Cardonayoselin422@gmail.com',
  'cardonayoselin422@gmail.com',
];

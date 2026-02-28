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

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

// Session only  login clears when browser/tab is closed
setPersistence(auth, browserSessionPersistence).catch(() => {});

export const db = getFirestore(app);
export const storage = getStorage(app);
export const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'pgyb41494@gmail.com';
export const ADMIN_EMAILS = [
  'pgyb41494@gmail.com',
  'Cardonayoselin422@gmail.com',
  'cardonayoselin422@gmail.com',
];

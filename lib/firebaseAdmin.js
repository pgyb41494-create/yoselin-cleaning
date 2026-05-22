import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function readAdminConfig() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '';
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || '';
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) return null;

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

function getAdminApp() {
  const existingApps = getApps();
  if (existingApps.length) return getApp();

  const adminConfig = readAdminConfig();
  if (!adminConfig) {
    throw new Error('Firebase Admin credentials are not configured.');
  }

  return initializeApp({
    credential: cert(adminConfig),
    projectId: adminConfig.projectId,
  });
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

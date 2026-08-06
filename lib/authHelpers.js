import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  fetchSignInMethodsForEmail,
} from 'firebase/auth';
import { auth, ADMIN_EMAILS } from './firebase';

export const MIN_PASSWORD_LENGTH = 8;
const PENDING_GOOGLE_REDIRECT_KEY = 'pendingGoogleRedirect';
const GOOGLE_REDIRECT_ERROR_KEY = 'googleRedirectError';

export function isAdminEmail(email) {
  if (!email) return false;
  const normalized = email.toLowerCase();
  return ADMIN_EMAILS.some((e) => e.toLowerCase() === normalized);
}

export function hasProvider(user, providerId) {
  return !!user?.providerData?.some((p) => p.providerId === providerId);
}

export function hasPasswordProvider(user) {
  return hasProvider(user, 'password');
}

export function hasGoogleProvider(user) {
  return hasProvider(user, 'google.com');
}

export function isMobileAuthClient() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua));
}

/** In-app browsers (Instagram, Facebook, etc.) often break Google OAuth. */
export function isEmbeddedBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat|WhatsApp|LinkedInApp|Pinterest/i.test(ua);
}

export function passwordChecks(password = '') {
  return {
    length: password.length >= MIN_PASSWORD_LENGTH,
    letter: /[A-Za-z]/.test(password),
    number: /\d/.test(password),
  };
}

export function isStrongPassword(password = '') {
  const checks = passwordChecks(password);
  return checks.length && checks.letter && checks.number;
}

export function mapAuthError(error, { mode = 'login' } = {}) {
  const code = error?.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'auth/email-already-in-use':
      return 'An account already exists for this email. Try logging in, or continue with Google if you signed up that way.';
    case 'auth/weak-password':
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters and include a letter and a number.`;
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Google sign-in was cancelled.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google window. Allow popups for this site, or open the page in Safari/Chrome and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'This email is already linked to a different sign-in method. Try Continue with Google or reset your password.';
    case 'auth/requires-recent-login':
      return 'Please sign in again, then retry this security change.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/unauthorized-domain':
      return 'This website domain is not authorized for Google sign-in yet. Please try again shortly, or use email sign-up.';
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled for this project. Please contact support.';
    case 'auth/internal-error':
      return 'Google sign-in hit a temporary error. Close other Google windows and try again.';
    case 'auth/web-storage-unsupported':
      return 'This browser blocks sign-in storage. Open the site in Safari or Chrome (not an in-app browser) and try again.';
    case 'auth/embedded-browser':
      return 'Google sign-in does not work inside this in-app browser. Tap ··· and choose “Open in Safari” or “Open in Chrome”, then try again.';
    case 'auth/missing-config':
      return 'Sign-in is misconfigured. Please contact support.';
    default:
      return mode === 'signup'
        ? 'Could not create your account. Please try again.'
        : 'Sign-in failed. Please try again.';
  }
}

export async function getSignInMethods(email) {
  try {
    return await fetchSignInMethodsForEmail(auth, email.trim().toLowerCase());
  } catch {
    return [];
  }
}

function assertAuthConfigured() {
  const cfg = auth?.app?.options || {};
  if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId
    || String(cfg.apiKey).includes('your_')
    || String(cfg.projectId).includes('your_')) {
    const err = new Error('Firebase web config is missing.');
    err.code = 'auth/missing-config';
    throw err;
  }
}

/**
 * Google sign-in: prefer popup (works on modern mobile Safari/Chrome).
 * Fall back to redirect only when the popup is blocked.
 * Embedded in-app browsers get a clear “open in browser” error.
 */
export async function signInWithGoogle({
  rememberMe = true,
  setPersistenceFn,
  localPersistence,
  sessionPersistence,
} = {}) {
  assertAuthConfigured();

  if (isEmbeddedBrowser()) {
    const err = new Error('Embedded browser');
    err.code = 'auth/embedded-browser';
    throw err;
  }

  // Always persist Google sessions locally so mobile navigations don't drop auth.
  if (setPersistenceFn && localPersistence) {
    await setPersistenceFn(auth, localPersistence);
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  provider.addScope('email');
  provider.addScope('profile');

  try {
    const result = await signInWithPopup(auth, provider);
    return { redirected: false, user: result.user };
  } catch (error) {
    const code = error?.code || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw error;
    }
    const canFallback = code === 'auth/popup-blocked'
      || code === 'auth/operation-not-supported-in-this-environment'
      || isMobileAuthClient();
    if (!canFallback) throw error;
  }

  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(PENDING_GOOGLE_REDIRECT_KEY, '1');
    }
  } catch { /* ignore */ }

  await signInWithRedirect(auth, provider);
  return { redirected: true, user: null };
}

export async function completeGoogleRedirect() {
  try {
    const result = await getRedirectResult(auth);
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(PENDING_GOOGLE_REDIRECT_KEY);
        sessionStorage.removeItem(GOOGLE_REDIRECT_ERROR_KEY);
      }
    } catch { /* ignore */ }
    return result?.user || null;
  } catch (error) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(GOOGLE_REDIRECT_ERROR_KEY, mapAuthError(error));
        sessionStorage.removeItem(PENDING_GOOGLE_REDIRECT_KEY);
      }
    } catch { /* ignore */ }
    return { error };
  }
}

export function consumeGoogleRedirectError() {
  try {
    if (typeof sessionStorage === 'undefined') return '';
    const msg = sessionStorage.getItem(GOOGLE_REDIRECT_ERROR_KEY) || '';
    if (msg) sessionStorage.removeItem(GOOGLE_REDIRECT_ERROR_KEY);
    return msg;
  } catch {
    return '';
  }
}

export function needsEmailVerification(user) {
  if (!user) return false;
  if (isAdminEmail(user.email)) return false;
  // Google accounts are treated as verified for portal access.
  if (hasGoogleProvider(user)) return false;
  return !user.emailVerified;
}

/**
 * Wait until Firebase finishes restoring any persisted session.
 * Prevents protected pages from bouncing users home on a transient null.
 */
export async function whenAuthReady() {
  try {
    if (typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
  } catch { /* ignore */ }
  return auth.currentUser;
}

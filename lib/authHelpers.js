import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  fetchSignInMethodsForEmail,
} from 'firebase/auth';
import { auth, ADMIN_EMAILS } from './firebase';

export const MIN_PASSWORD_LENGTH = 8;

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
  return /Android|iPhone|iPad|iPod|Mobile|FBAN|FBAV|Instagram|Line\//i.test(ua)
    || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua));
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
      return 'Your browser blocked the Google popup. Try again, or use a different browser.';
    case 'auth/account-exists-with-different-credential':
      return 'This email is already linked to a different sign-in method. Try Continue with Google or reset your password.';
    case 'auth/requires-recent-login':
      return 'Please sign in again, then retry this security change.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
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

export async function signInWithGoogle({ rememberMe = false, setPersistenceFn, localPersistence, sessionPersistence } = {}) {
  if (setPersistenceFn) {
    await setPersistenceFn(auth, rememberMe ? localPersistence : sessionPersistence);
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (isMobileAuthClient()) {
    await signInWithRedirect(auth, provider);
    return { redirected: true, user: null };
  }
  const result = await signInWithPopup(auth, provider);
  return { redirected: false, user: result.user };
}

export async function completeGoogleRedirect() {
  try {
    const result = await getRedirectResult(auth);
    return result?.user || null;
  } catch (error) {
    return { error };
  }
}

export function needsEmailVerification(user) {
  if (!user) return false;
  if (isAdminEmail(user.email)) return false;
  if (hasGoogleProvider(user) && user.emailVerified) return false;
  return !user.emailVerified;
}

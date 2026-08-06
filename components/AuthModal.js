'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  GoogleAuthProvider, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  updateProfile, sendEmailVerification, signOut,
  setPersistence, browserLocalPersistence, browserSessionPersistence,
} from 'firebase/auth';
import { auth, ADMIN_EMAILS } from '../lib/firebase';

function EyeIcon({ visible }) {
  if (visible) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3l18 18M10.6 10.6A3 3 0 0 0 12 16a3 3 0 0 0 1.4-.35M6.2 6.2C3.9 7.7 2.5 12 2.5 12s3.5 7 9.5 7c1.9 0 3.5-.4 4.9-1.1M9.9 4.3A10 10 0 0 1 12 4c6 0 9.5 8 9.5 8a19.4 19.4 0 0 1-4.4 5.3" />
    </svg>
  );
}

export default function AuthModal({ mode, onClose, onModeChange, redirectTo = '/dashboard' }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifyResent, setVerifyResent] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    if (!mode) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [mode]);

  if (!mode) return null;

  const redirect = (user) => {
    if (ADMIN_EMAILS.includes(user.email?.toLowerCase()) || ADMIN_EMAILS.includes(user.email)) {
      router.push('/admin');
    } else if (!user.emailVerified) {
      onModeChange?.('verify');
      setBusy(false);
    } else {
      router.push(redirectTo || '/dashboard');
    }
  };

  const handleGoogle = async () => {
    setError('');
    setBusy(true);
    try {
      const r = await signInWithPopup(auth, new GoogleAuthProvider());
      redirect(r.user);
    } catch {
      setError('Google sign-in failed. Please try again.');
      setBusy(false);
    }
  };

  const handleLogin = async () => {
    setError('');
    setBusy(true);
    if (!email || !password) { setError('Please fill in all fields.'); setBusy(false); return; }
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      const r = await signInWithEmailAndPassword(auth, email, password);
      redirect(r.user);
    } catch (e) {
      setError(
        e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found'
          ? 'Incorrect email or password.'
          : 'Login failed. Please try again.'
      );
      setBusy(false);
    }
  };

  const handleSignup = async () => {
    setError('');
    setBusy(true);
    if (!name.trim()) { setError('Please enter your name.'); setBusy(false); return; }
    if (!email || !password) { setError('Please fill in all fields.'); setBusy(false); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); setBusy(false); return; }
    try {
      const r = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(r.user, { displayName: name.trim() });
      await sendEmailVerification(r.user);
      redirect(r.user);
    } catch (e) {
      setError(e.code === 'auth/email-already-in-use'
        ? 'An account with this email already exists. Try logging in.'
        : 'Sign up failed. Please try again.');
      setBusy(false);
    }
  };

  const checkVerification = async () => {
    setBusy(true);
    setVerifyError('');
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) router.push(redirectTo || '/dashboard');
      else setVerifyError('Email not verified yet. Check your inbox and click the link.');
    } catch {
      setVerifyError('Something went wrong. Please try again.');
    }
    setBusy(false);
  };

  const resendVerification = async () => {
    setBusy(true);
    setVerifyError('');
    setVerifyResent(false);
    try {
      await sendEmailVerification(auth.currentUser);
      setVerifyResent(true);
    } catch {
      setVerifyError('Could not resend. Try again in a minute.');
    }
    setBusy(false);
  };

  if (mode === 'verify') {
    return (
      <div className="modal-overlay" role="dialog" aria-modal="true">
        <div className="modal-card modal-card--center">
          <div className="modal-icon">✉️</div>
          <h2>Check your email</h2>
          <p className="modal-sub">
            We sent a verification link to<br />
            <strong>{auth.currentUser?.email}</strong>
          </p>
          <p className="modal-hint">Click the link, then press the button below.</p>
          {verifyError && <p className="form-error">{verifyError}</p>}
          {verifyResent && <p className="form-success">Email resent! Check your inbox.</p>}
          <button type="button" className="btn btn-primary btn-block" onClick={checkVerification} disabled={busy}>
            {busy ? 'Checking…' : "I've verified my email"}
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={resendVerification} disabled={busy}>
            Resend verification email
          </button>
          <button type="button" className="btn btn-ghost btn-block btn-danger-text" onClick={() => { signOut(auth); onClose(); }}>
            Sign out and use a different account
          </button>
        </div>
      </div>
    );
  }

  const isLogin = mode === 'login';

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <div className="modal-brand">
          <img src="/icon.png" alt="" width={48} height={48} />
          <h2>{isLogin ? 'Welcome back' : 'Create account'}</h2>
          <p className="modal-sub">{isLogin ? 'Sign in to manage your bookings' : 'Free estimates — takes 30 seconds'}</p>
        </div>

        {!isLogin && (
          <div className="form-field">
            <label htmlFor="auth-name">Your name</label>
            <input id="auth-name" type="text" placeholder="First and last name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <div className="form-field">
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="auth-pass">Password</label>
          <div className="form-pass">
            <input id="auth-pass" type={showPass ? 'text' : 'password'} placeholder={isLogin ? 'Your password' : 'At least 6 characters'} value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="form-pass-toggle" onClick={() => setShowPass((s) => !s)} aria-label={showPass ? 'Hide password' : 'Show password'}>
              <EyeIcon visible={showPass} />
            </button>
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        {isLogin && (
          <label className="form-check">
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
            Stay logged in
          </label>
        )}

        <button type="button" className="btn btn-primary btn-block" onClick={isLogin ? handleLogin : handleSignup} disabled={busy}>
          {busy ? 'Please wait…' : isLogin ? 'Log in' : 'Create account'}
        </button>

        {isLogin && (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => router.push('/reset-password')}>
            Forgot password?
          </button>
        )}

        <div className="modal-divider"><span>or</span></div>

        <button type="button" className="btn btn-google btn-block" onClick={handleGoogle} disabled={busy}>
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" height="18" alt="" />
          Continue with Google
        </button>

        <p className="modal-switch">
          {isLogin ? (
            <>No account? <button type="button" onClick={() => { onModeChange?.('signup'); setError(''); }}>Sign up</button></>
          ) : (
            <>Already have an account? <button type="button" onClick={() => { onModeChange?.('login'); setError(''); }}>Log in</button></>
          )}
        </p>
      </div>
    </div>
  );
}

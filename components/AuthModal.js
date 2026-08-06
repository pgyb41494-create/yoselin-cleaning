'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  updateProfile, sendEmailVerification, signOut,
  setPersistence, browserLocalPersistence, browserSessionPersistence,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import {
  isAdminEmail,
  isStrongPassword,
  passwordChecks,
  mapAuthError,
  signInWithGoogle,
  needsEmailVerification,
  getSignInMethods,
  MIN_PASSWORD_LENGTH,
} from '../lib/authHelpers';

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

function PasswordChecklist({ password }) {
  const checks = passwordChecks(password);
  const items = [
    { ok: checks.length, label: `At least ${MIN_PASSWORD_LENGTH} characters` },
    { ok: checks.letter, label: 'Contains a letter' },
    { ok: checks.number, label: 'Contains a number' },
  ];
  return (
    <ul className="password-checklist" aria-live="polite">
      {items.map((item) => (
        <li key={item.label} className={item.ok ? 'password-checklist__ok' : ''}>
          <span aria-hidden="true">{item.ok ? '✓' : '○'}</span> {item.label}
        </li>
      ))}
    </ul>
  );
}

export default function AuthModal({ mode, onClose, onModeChange, redirectTo = '/dashboard' }) {
  const router = useRouter();
  const cardRef = useRef(null);
  const firstFieldRef = useRef(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifyResent, setVerifyResent] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const redirectUser = useCallback((user) => {
    if (isAdminEmail(user.email)) {
      router.push('/admin');
      return;
    }
    if (needsEmailVerification(user)) {
      onModeChange?.('verify');
      setBusy(false);
      return;
    }
    router.push(redirectTo || '/dashboard');
  }, [onModeChange, redirectTo, router]);

  useEffect(() => {
    if (!mode) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [mode]);

  useEffect(() => {
    if (!mode || mode === 'verify') return;
    const t = setTimeout(() => firstFieldRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [mode]);

  useEffect(() => {
    if (!mode) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && mode !== 'verify') onClose?.();
      if (e.key !== 'Tab' || !cardRef.current) return;
      const focusable = cardRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, onClose]);

  if (!mode) return null;

  const handleGoogle = async () => {
    setError('');
    setHint('');
    setBusy(true);
    try {
      const result = await signInWithGoogle({
        rememberMe,
        setPersistenceFn: setPersistence,
        localPersistence: browserLocalPersistence,
        sessionPersistence: browserSessionPersistence,
      });
      if (result.redirected) {
        setHint('Redirecting to Google…');
        return;
      }
      redirectUser(result.user);
    } catch (e) {
      setError(mapAuthError(e));
      setBusy(false);
    }
  };

  const handleLogin = async (event) => {
    event?.preventDefault?.();
    setError('');
    setHint('');
    setBusy(true);
    if (!email || !password) {
      setError('Please fill in all fields.');
      setBusy(false);
      return;
    }
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      const r = await signInWithEmailAndPassword(auth, email.trim(), password);
      redirectUser(r.user);
    } catch (e) {
      if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found') {
        const methods = await getSignInMethods(email);
        if (methods.includes('google.com') && !methods.includes('password')) {
          setError('This account uses Google sign-in — there is no password unless you add one in Settings after signing in with Google.');
          setHint('Use Continue with Google below.');
        } else {
          setError('Incorrect email or password.');
        }
      } else {
        setError(mapAuthError(e, { mode: 'login' }));
      }
      setBusy(false);
    }
  };

  const handleSignup = async (event) => {
    event?.preventDefault?.();
    setError('');
    setHint('');
    setBusy(true);
    if (!name.trim()) { setError('Please enter your name.'); setBusy(false); return; }
    if (!email || !password) { setError('Please fill in all fields.'); setBusy(false); return; }
    if (!isStrongPassword(password)) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters and include a letter and a number.`);
      setBusy(false);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setBusy(false);
      return;
    }
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      const r = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(r.user, { displayName: name.trim() });
      await sendEmailVerification(r.user);
      redirectUser(r.user);
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        const methods = await getSignInMethods(email);
        if (methods.includes('google.com')) {
          setError('This email already has a Google account. Continue with Google instead.');
          setHint('After signing in with Google you can add a password in Settings if you want.');
        } else {
          setError('An account with this email already exists. Try logging in.');
        }
      } else {
        setError(mapAuthError(e, { mode: 'signup' }));
      }
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
      <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="verify-title">
        <div className="modal-card modal-card--center" ref={cardRef}>
          <div className="modal-icon" aria-hidden="true">✉️</div>
          <h2 id="verify-title">Check your email</h2>
          <p className="modal-sub">
            We sent a verification link to<br />
            <strong>{auth.currentUser?.email}</strong>
          </p>
          <p className="modal-hint">Open the link on this device, then tap the button below.</p>
          {verifyError && <p className="form-error" role="alert">{verifyError}</p>}
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
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-title"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="modal-card" ref={cardRef}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <div className="modal-brand">
          <img src="/icon.png" alt="" width={48} height={48} />
          <h2 id="auth-title">{isLogin ? 'Welcome back' : 'Create account'}</h2>
          <p className="modal-sub">{isLogin ? 'Sign in to manage your bookings' : 'Free estimates — takes about a minute'}</p>
        </div>

        <button type="button" className="btn btn-google btn-block" onClick={handleGoogle} disabled={busy}>
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" height="18" alt="" />
          Continue with Google
        </button>
        <p className="auth-google-hint">
          Signed up with Google? Use the button above — Google accounts do not get an automatic password.
        </p>

        <div className="modal-divider"><span>or use email</span></div>

        <form onSubmit={isLogin ? handleLogin : handleSignup} noValidate>
          {!isLogin && (
            <div className="form-field">
              <label htmlFor="auth-name">Your name</label>
              <input
                ref={firstFieldRef}
                id="auth-name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="First and last name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
          <div className="form-field">
            <label htmlFor="auth-email">Email</label>
            <input
              ref={isLogin ? firstFieldRef : undefined}
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="auth-pass">Password</label>
            <div className="form-pass">
              <input
                id="auth-pass"
                name="password"
                type={showPass ? 'text' : 'password'}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                placeholder={isLogin ? 'Your password' : `At least ${MIN_PASSWORD_LENGTH} characters`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="form-pass-toggle" onClick={() => setShowPass((s) => !s)} aria-label={showPass ? 'Hide password' : 'Show password'}>
                <EyeIcon visible={showPass} />
              </button>
            </div>
          </div>

          {!isLogin && (
            <>
              <div className="form-field">
                <label htmlFor="auth-pass-confirm">Confirm password</label>
                <input
                  id="auth-pass-confirm"
                  name="confirmPassword"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <PasswordChecklist password={password} />
            </>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}
          {hint && <p className="form-success">{hint}</p>}

          <label className="form-check">
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
            Stay logged in on this device
          </label>

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Please wait…' : isLogin ? 'Log in with email' : 'Create account'}
          </button>
        </form>

        {isLogin && (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => router.push('/reset-password')}>
            Forgot password?
          </button>
        )}

        <p className="modal-switch">
          {isLogin ? (
            <>No account? <button type="button" onClick={() => { onModeChange?.('signup'); setError(''); setHint(''); }}>Sign up</button></>
          ) : (
            <>Already have an account? <button type="button" onClick={() => { onModeChange?.('login'); setError(''); setHint(''); }}>Log in</button></>
          )}
        </p>
      </div>
    </div>
  );
}

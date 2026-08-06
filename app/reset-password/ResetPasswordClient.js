'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  confirmPasswordReset,
  verifyPasswordResetCode,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { isStrongPassword, passwordChecks, MIN_PASSWORD_LENGTH, mapAuthError } from '../../lib/authHelpers';
import SiteHeader from '../../components/SiteHeader';
import SiteFooter from '../../components/SiteFooter';
import AuthModal from '../../components/AuthModal';

function getSearchParam(value) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

export default function ResetPasswordClient({ searchParams = {} }) {
  const router = useRouter();
  const oobCode = getSearchParam(searchParams.oobCode);
  const prefixedEmail = getSearchParam(searchParams.email);

  const [email, setEmail] = useState(prefixedEmail);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState(prefixedEmail);
  const [loadingCode, setLoadingCode] = useState(Boolean(oobCode));
  const [requestBusy, setRequestBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [resetComplete, setResetComplete] = useState(false);
  const [codeState, setCodeState] = useState(oobCode ? 'checking' : 'none');
  const [authMode, setAuthMode] = useState(null);

  useEffect(() => {
    setEmail(prefixedEmail);
    setVerifiedEmail(prefixedEmail);
  }, [prefixedEmail]);

  useEffect(() => {
    if (!oobCode) {
      setLoadingCode(false);
      setCodeState('none');
      return;
    }

    let active = true;
    setLoadingCode(true);
    setCodeState('checking');
    setError('');

    verifyPasswordResetCode(auth, oobCode)
      .then((resolvedEmail) => {
        if (!active) return;
        setVerifiedEmail(resolvedEmail);
        setEmail(resolvedEmail);
        setLoadingCode(false);
        setCodeState('valid');
      })
      .catch(() => {
        if (!active) return;
        setError('This reset link is invalid or expired. Request a new one below.');
        setLoadingCode(false);
        setCodeState('invalid');
      });

    return () => {
      active = false;
    };
  }, [oobCode]);

  const handleRequestReset = async (event) => {
    event.preventDefault();
    setError('');
    setStatus('');

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('Please enter the email address for the account.');
      return;
    }

    setRequestBusy(true);
    try {
      // Firebase sends the email server-side. Always show the same message
      // so we never reveal whether the account exists or return a reset link.
      await sendPasswordResetEmail(auth, trimmedEmail, {
        url: `${window.location.origin}/reset-password`,
        handleCodeInApp: false,
      });
      setStatus('If that email exists, a reset link has been sent. Check your inbox (and spam folder).');
    } catch (requestError) {
      // Keep response generic for enumeration safety, except for rate limits.
      if (requestError?.code === 'auth/too-many-requests') {
        setError(mapAuthError(requestError));
      } else if (requestError?.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setStatus('If that email exists, a reset link has been sent. Check your inbox (and spam folder).');
      }
    } finally {
      setRequestBusy(false);
    }
  };

  const handleConfirmReset = async (event) => {
    event.preventDefault();
    setError('');
    setStatus('');

    if (!oobCode) {
      setError('Missing reset code. Request a new link below.');
      return;
    }

    if (!isStrongPassword(newPassword)) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters and include a letter and a number.`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setResetBusy(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setResetComplete(true);
      setStatus('Your password has been updated. You can sign in with the new password now.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (resetError) {
      setError(mapAuthError(resetError) || 'Could not update the password. Try requesting a fresh link.');
    } finally {
      setResetBusy(false);
    }
  };

  const isResetFlow = codeState === 'valid' && !resetComplete;
  const showRequestFlow = !resetComplete && codeState !== 'valid';
  const checks = passwordChecks(newPassword);

  return (
    <>
      <SiteHeader onLoginClick={setAuthMode} />
      <main className="rp-page">
        <section className="rp-card">
          <div className="rp-brand">
            <img src="/icon.png" alt="Yoselin's Cleaning" width={56} height={56} />
          </div>

          <h1 className="rp-title">
            {resetComplete ? 'Password Updated' : isResetFlow ? 'Choose a New Password' : 'Forgot Your Password?'}
          </h1>
          <p className="rp-sub">
            {resetComplete
              ? 'Your password is updated. Sign in with the new password.'
              : isResetFlow
                ? 'Create a strong password you will remember. Google-only accounts can add a password here after using a reset link, or from Settings after signing in with Google.'
                : 'Enter the email for your account. If it exists, we will email a secure reset link. Google-only accounts have no password until you add one.'}
          </p>

          {loadingCode && <div className="rp-status">Verifying your reset link...</div>}
          {!loadingCode && status && <div className="rp-status success">{status}</div>}
          {!loadingCode && error && <div className="rp-status error" role="alert">{error}</div>}

          {!loadingCode && !resetComplete && isResetFlow && (
            <>
              <div className="rp-chip">Resetting password for {verifiedEmail || email || 'your account'}</div>
              <form className="rp-form" onSubmit={handleConfirmReset}>
                <div className="rp-field">
                  <label htmlFor="rp-new-pass">New Password</label>
                  <input
                    id="rp-new-pass"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                    autoComplete="new-password"
                  />
                </div>

                <div className="rp-field">
                  <label htmlFor="rp-confirm-pass">Confirm New Password</label>
                  <input
                    id="rp-confirm-pass"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat the new password"
                    autoComplete="new-password"
                  />
                </div>

                <ul className="password-checklist">
                  <li className={checks.length ? 'password-checklist__ok' : ''}>
                    <span aria-hidden="true">{checks.length ? '✓' : '○'}</span> At least {MIN_PASSWORD_LENGTH} characters
                  </li>
                  <li className={checks.letter ? 'password-checklist__ok' : ''}>
                    <span aria-hidden="true">{checks.letter ? '✓' : '○'}</span> Contains a letter
                  </li>
                  <li className={checks.number ? 'password-checklist__ok' : ''}>
                    <span aria-hidden="true">{checks.number ? '✓' : '○'}</span> Contains a number
                  </li>
                </ul>

                <div className="rp-actions">
                  <button className="rp-btn rp-btn-primary" type="submit" disabled={resetBusy}>
                    {resetBusy ? 'Saving...' : 'Update Password'}
                  </button>
                  <button className="rp-btn rp-btn-secondary" type="button" onClick={() => setAuthMode('login')}>
                    Back to Login
                  </button>
                </div>
              </form>
            </>
          )}

          {!loadingCode && showRequestFlow && (
            <>
              <form className="rp-form" onSubmit={handleRequestReset}>
                <div className="rp-field">
                  <label htmlFor="rp-email">Email</label>
                  <input
                    id="rp-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    autoComplete="email"
                    inputMode="email"
                  />
                </div>

                <div className="rp-actions">
                  <button className="rp-btn rp-btn-primary" type="submit" disabled={requestBusy}>
                    {requestBusy ? 'Sending...' : 'Send Reset Link'}
                  </button>
                  <button className="rp-btn rp-btn-secondary" type="button" onClick={() => setAuthMode('login')}>
                    Back to Login
                  </button>
                </div>
              </form>

              <p className="rp-help">
                Prefer Google? Sign in with Continue with Google instead — there is no automatic password for Google accounts.
              </p>
            </>
          )}

          {resetComplete && (
            <div className="rp-actions" style={{ marginTop: 16 }}>
              <button className="rp-btn rp-btn-primary" type="button" onClick={() => setAuthMode('login')}>
                Sign In
              </button>
              <button className="rp-btn rp-btn-secondary" type="button" onClick={() => router.push('/')}>
                Return home
              </button>
            </div>
          )}

          <a className="rp-back" href="/">Return home</a>
        </section>
      </main>
      <SiteFooter />
      <AuthModal
        mode={authMode}
        onClose={() => setAuthMode(null)}
        onModeChange={setAuthMode}
        redirectTo="/dashboard"
      />
    </>
  );
}

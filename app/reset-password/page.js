'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '../../lib/firebase';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oobCode = searchParams.get('oobCode') || '';
  const prefixedEmail = searchParams.get('email') || '';

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

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter the email address for the account.');
      return;
    }

    setRequestBusy(true);
    try {
      const response = await fetch('/api/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Unable to send the reset email right now.');
      }

      setStatus(data.message || 'If that email exists, check your inbox for a reset link.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to send the reset email right now.');
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

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
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
      setError(resetError?.message || 'Could not update the password. Try requesting a fresh link.');
    } finally {
      setResetBusy(false);
    }
  };

  const isResetFlow = codeState === 'valid' && !resetComplete;
  const showRequestFlow = !resetComplete && codeState !== 'valid';

  return (
    <main className="rp-page">
      <section className="rp-card">
        <div className="rp-brand">
          <img src="/logo.png" alt="Yoselin's Cleaning" />
        </div>

        <h1 className="rp-title">
          {resetComplete ? 'Password Updated' : isResetFlow ? 'Reset Your Password' : 'Forgot Your Password?'}
        </h1>
        <p className="rp-sub">
          {resetComplete
            ? 'Your password is updated. Head back to the login page and sign in with the new password.'
            : isResetFlow
              ? 'Enter a new password below to finish resetting your account.'
              : 'Enter the email tied to your account and we will send a secure reset link through EmailJS.'}
        </p>

        {loadingCode && <div className="rp-status">Verifying your reset link...</div>}
        {!loadingCode && status && <div className="rp-status success">{status}</div>}
        {!loadingCode && error && <div className="rp-status error">{error}</div>}

        {!loadingCode && !resetComplete && isResetFlow && (
          <>
            <div className="rp-chip">Resetting password for {verifiedEmail || email || 'your account'}</div>
            <form className="rp-form" onSubmit={handleConfirmReset}>
              <div className="rp-field">
                <label>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter a new password"
                  autoComplete="new-password"
                />
              </div>

              <div className="rp-field">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat the new password"
                  autoComplete="new-password"
                />
              </div>

              <div className="rp-actions">
                <button className="rp-btn rp-btn-primary" type="submit" disabled={resetBusy}>
                  {resetBusy ? 'Saving...' : 'Update Password'}
                </button>
                <button className="rp-btn rp-btn-secondary" type="button" onClick={() => router.push('/')}>
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
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  autoComplete="email"
                />
              </div>

              <div className="rp-actions">
                <button className="rp-btn rp-btn-primary" type="submit" disabled={requestBusy}>
                  {requestBusy ? 'Sending...' : 'Send Reset Link'}
                </button>
                <button className="rp-btn rp-btn-secondary" type="button" onClick={() => router.push('/')}>
                  Back to Login
                </button>
              </div>
            </form>

            <p className="rp-help">
              If you already have a reset email, open the link inside it to finish the process.
            </p>
          </>
        )}

        {resetComplete && (
          <div className="rp-status success">
            <p style={{ marginBottom: '12px' }}>Password updated successfully.</p>
            <div className="rp-actions">
              <button className="rp-btn rp-btn-primary" type="button" onClick={() => router.push('/')}>
                Return to Login
              </button>
              <button className="rp-btn rp-btn-secondary" type="button" onClick={() => router.push('/reset-password')}>
                Send Another Reset Link
              </button>
            </div>
          </div>
        )}

        <a className="rp-back" href="/">
          Return home
        </a>
      </section>
    </main>
  );
}

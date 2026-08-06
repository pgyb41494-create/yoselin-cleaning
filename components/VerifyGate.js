'use client';
import { useState } from 'react';
import { sendEmailVerification, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';

export default function VerifyGate({ user, onVerified, onLoginClick }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resent, setResent] = useState(false);

  const check = async () => {
    setBusy(true);
    setError('');
    try {
      await user.reload();
      if (auth.currentUser?.emailVerified) {
        onVerified?.(auth.currentUser);
      } else {
        setError('Email not verified yet. Open the link we sent, then try again.');
      }
    } catch {
      setError('Could not check verification. Please try again.');
    }
    setBusy(false);
  };

  const resend = async () => {
    setBusy(true);
    setError('');
    setResent(false);
    try {
      await sendEmailVerification(auth.currentUser || user);
      setResent(true);
    } catch {
      setError('Could not resend. Wait a minute and try again.');
    }
    setBusy(false);
  };

  return (
    <>
      <SiteHeader onLoginClick={onLoginClick} />
      <main className="verify-gate">
        <div className="verify-gate__card">
          <div className="modal-icon" aria-hidden="true">✉️</div>
          <h1>Verify your email</h1>
          <p>
            We sent a verification link to <strong>{user.email}</strong>.
            Verify your email before booking or opening your portal.
          </p>
          {error && <p className="form-error" role="alert">{error}</p>}
          {resent && <p className="form-success">Verification email resent.</p>}
          <button type="button" className="btn btn-primary btn-block" onClick={check} disabled={busy}>
            {busy ? 'Checking…' : "I've verified my email"}
          </button>
          <button type="button" className="btn btn-outline btn-block" onClick={resend} disabled={busy}>
            Resend email
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-block btn-danger-text"
            onClick={() => signOut(auth)}
          >
            Sign out
          </button>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

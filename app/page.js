'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from '../lib/firebase';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (user.email === ADMIN_EMAIL) {
          router.push('/admin');
        } else {
          // check if they have a request
          const q = query(collection(db, 'requests'), where('userId', '==', user.uid));
          const snap = await getDocs(q);
          router.push(snap.empty ? '/book' : '/portal');
        }
      } else {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  const signIn = async () => {
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      setError('Sign-in failed. Please try again.');
    }
  };

  if (loading) return (
    <div className="spinner-page"><div className="spinner"></div></div>
  );

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">✨</div>
        <h1 className="auth-title">Yoselin's <span>Cleaning</span></h1>
        <p className="auth-sub">
          Sign in with your Google account to book a cleaning or track your request.
        </p>
        <button className="google-btn" onClick={signIn}>
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20" alt="Google" />
          Continue with Google
        </button>
        {error && <p className="auth-err">{error}</p>}
      </div>
    </div>
  );
}

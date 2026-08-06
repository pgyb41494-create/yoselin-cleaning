'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, ADMIN_EMAILS } from '../../lib/firebase';
import SiteHeader from '../../components/SiteHeader';
import SiteFooter from '../../components/SiteFooter';
import BookingWizard from '../../components/BookingWizard';

export default function BookPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push('/'); return; }
      if (ADMIN_EMAILS.includes(u.email?.toLowerCase()) || ADMIN_EMAILS.includes(u.email)) {
        router.push('/admin');
        return;
      }
      const q = query(collection(db, 'requests'), where('userId', '==', u.uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        const latest = docs[0];
        if (latest.status !== 'done' && latest.status !== 'cancelled') {
          router.push('/dashboard');
          return;
        }
      }
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  if (loading) {
    return (
      <div className="spinner-page">
        <div className="spinner" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="success-screen">
        <div className="success-card">
          <div className="success-card__icon">✓</div>
          <h2>Quote submitted!</h2>
          <p>
            Yoselin will contact you within <strong>24 hours</strong> to confirm your appointment.
          </p>
          <p className="success-card__hint">
            Track your request and chat with Yoselin from your account.
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => router.push('/dashboard')}>
            Go to my account
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className="book-page">
        <div className="container book-page__head">
          <h1>Get your free quote</h1>
          <p>Fill out the form below — it only takes a few minutes.</p>
        </div>
        <BookingWizard user={user} onDone={() => setSubmitted(true)} />
      </main>
      <SiteFooter />
    </>
  );
}

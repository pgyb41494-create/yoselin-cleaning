'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from '../../lib/firebase';
import BookingWizard from '../../components/BookingWizard';

export default function BookPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push('/'); return; }
      if (u.email === ADMIN_EMAIL) { router.push('/admin'); return; }
      const q = query(collection(db, 'requests'), where('userId', '==', u.uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        const latest = docs[0];
        if (latest.status !== 'done') {
          router.push('/portal');
          return;
        }
      }
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  if (loading) return <div className="spinner-page"><div className="spinner"></div></div>;

  if (submitted) return (
    <div className="sov show">
      <div className="sbox">
        <div style={{fontSize:'2.8rem'}}>:)</div>
        <h2>Request Sent!</h2>
        <p><strong>Yoselin will contact you within 24 hours</strong> to confirm your appointment.</p>
        <br />
        <p style={{fontSize:'.82rem',background:'#f3f4f6',borderRadius:'10px',padding:'12px'}}>
          Track your request in your portal.
        </p>
        <button className="sclose" onClick={() => router.push('/portal')}>Go to My Portal</button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="sparkle-bar">\u2728\u2728\u2728</div>
      <div className="guest-header">
        <div style={{position:'absolute',top:'15px',right:'16px',display:'flex',gap:'8px',alignItems:'center'}}>
          {user?.photoURL && <img src={user.photoURL} className="nav-avatar" alt="" />}
          <button className="signout-btn" onClick={() => { signOut(auth); router.push('/'); }}>Sign Out</button>
        </div>
        <h1>Yoselin's<br /><span>Cleaning Service</span></h1>
        <p>Professional - Reliable - Sparkling Clean</p>
        <div className="header-badges">
          <span className="hbadge pink">\u2705 Licensed and Insured</span>
          <span className="hbadge blue">\u2B50 5-Star Rated</span>
          <span className="hbadge">\uD83C\uDF81 Free Estimates</span>
        </div>
      </div>
      <BookingWizard user={user} onDone={() => setSubmitted(true)} />
    </div>
  );
}

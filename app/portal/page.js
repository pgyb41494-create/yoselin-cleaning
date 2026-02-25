'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from '../../lib/firebase';

export default function PortalPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) { router.push('/'); return; }
      if (u.email === ADMIN_EMAIL) { router.push('/admin'); return; }
      setUser(u);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'requests'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      if (!snap.empty) {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setRequest(docs[0]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  if (loading) return <div className="spinner-page"><div className="spinner"></div></div>;

  const isDone = request?.status === 'done';
  const statusLabel = request?.status === 'new' ? '🆕 Pending Review' : request?.status === 'confirmed' ? '✅ Confirmed' : '🏁 Completed';

  const navStyle = {
    background: '#0d0d0d',
    borderBottom: '1px solid #1f1f1f',
    padding: '15px 26px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '10px',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      <nav style={navStyle}>
        <div className="nav-brand">Yoselin's <span>Cleaning</span></div>
        <div className="nav-user">
          {user?.photoURL && <img src={user.photoURL} className="nav-avatar" alt="" />}
          <span className="nav-email">{user?.displayName?.split(' ')[0]}</span>
          <button className="signout-btn" onClick={() => { signOut(auth); router.push('/'); }}>Sign Out</button>
        </div>
      </nav>

      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '32px 16px 80px' }}>

        {/* Page header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.5rem', fontWeight: '900', color: 'white', marginBottom: '4px' }}>
            My Cleaning Request 📋
          </h1>
          <p style={{ color: '#6b7280', fontSize: '.85rem' }}>Track your upcoming appointment.</p>
        </div>

        {!request ? (
          /* No request yet */
          <div style={{ background: '#111', borderRadius: '18px', border: '1px solid #222', padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '14px' }}>✨</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.3rem', fontWeight: '700', marginBottom: '8px', color: 'white' }}>No request yet</h2>
            <p style={{ color: '#9ca3af', fontSize: '.85rem', marginBottom: '24px' }}>Book your first cleaning and get an instant estimate!</p>
            <a href="/book" style={{ display: 'inline-block', padding: '13px 32px', background: 'linear-gradient(135deg, #1a6fd4, #db2777)', color: 'white', borderRadius: '12px', fontWeight: '700', textDecoration: 'none', fontSize: '.95rem' }}>
              Book a Cleaning →
            </a>
          </div>

        ) : isDone ? (
          /* Completed — thank you card, full black */
          <div style={{ background: '#111', borderRadius: '20px', border: '1px solid #222', overflow: 'hidden' }}>
            {/* Header bar */}
            <div style={{ background: '#0d0d0d', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1f1f1f' }}>
              <div style={{ fontWeight: '700', color: 'white', fontSize: '.95rem' }}>
                Request #{request.id.slice(-6).toUpperCase()}
              </div>
              <span style={{ background: '#d1fae5', color: '#065f46', padding: '4px 12px', borderRadius: '99px', fontSize: '.72rem', fontWeight: '700' }}>
                🏁 Completed
              </span>
            </div>

            {/* Thank you body */}
            <div style={{ padding: '52px 28px', textAlign: 'center' }}>
              <div style={{ fontSize: '3.2rem', marginBottom: '18px' }}>🎉</div>
              <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.5rem', fontWeight: '900', color: 'white', marginBottom: '10px' }}>
                Thanks for choosing Yoselin's!
              </h2>
              {request.date && request.date !== 'N/A' && (
                <p style={{ color: '#9ca3af', fontSize: '.88rem', lineHeight: '1.7', marginBottom: '8px' }}>
                  Your cleaning on <strong style={{ color: 'white' }}>{request.date}</strong> is complete.
                </p>
              )}
              <p style={{ color: '#9ca3af', fontSize: '.88rem', lineHeight: '1.7', marginBottom: '36px' }}>
                We hope everything looks sparkling clean! ✨
              </p>

              {/* Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                <a
                  href="/book?new=1"
                  style={{
                    display: 'inline-block', padding: '14px 36px',
                    background: 'linear-gradient(135deg, #1a6fd4, #db2777)',
                    color: 'white', borderRadius: '99px', fontWeight: '700',
                    textDecoration: 'none', fontSize: '.95rem',
                    boxShadow: '0 4px 20px rgba(26,111,212,.3)',
                  }}
                >
                  ✨ Book Another Cleaning
                </a>
                <button
                  onClick={() => router.push('/')}
                  style={{
                    background: 'none', border: '1.5px solid #333', color: '#9ca3af',
                    padding: '12px 32px', borderRadius: '99px', fontFamily: "'DM Sans', sans-serif",
                    fontWeight: '700', fontSize: '.88rem', cursor: 'pointer', transition: 'all .2s',
                  }}
                  onMouseEnter={e => { e.target.style.borderColor = '#555'; e.target.style.color = 'white'; }}
                  onMouseLeave={e => { e.target.style.borderColor = '#333'; e.target.style.color = '#9ca3af'; }}
                >
                  ← Back to Home
                </button>
              </div>
            </div>
          </div>

        ) : (
          /* Active request */
          <div style={{ background: '#111', borderRadius: '20px', border: '1px solid #222', overflow: 'hidden' }}>
            <div style={{ background: '#0d0d0d', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1f1f1f' }}>
              <div style={{ fontWeight: '700', color: 'white', fontSize: '.95rem' }}>
                Request #{request.id.slice(-6).toUpperCase()}
              </div>
              <span className={`badge badge-${request.status}`}>{statusLabel}</span>
            </div>
            <div style={{ padding: '20px 24px' }}>
              {[
                ['Submitted', request.submittedAt],
                ['Service Date', request.date || 'TBD'],
                ['Time', request.time || 'TBD'],
                ['Address', request.address],
                ['Rooms', request.rooms],
                ['Bathrooms', request.bathrooms],
                ['Frequency', request.frequency],
                ...(request.addons && request.addons !== 'None' ? [['Add-Ons', request.addons]] : []),
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1a1a1a', gap: '12px' }}>
                  <span style={{ fontSize: '.8rem', color: '#6b7280', fontWeight: '700', minWidth: '110px' }}>{k}</span>
                  <span style={{ fontSize: '.85rem', fontWeight: '600', color: '#e5e7eb', textAlign: 'right', flex: 1 }}>{v}</span>
                </div>
              ))}

              {/* Price chip */}
              <div style={{ background: '#0d0d0d', borderRadius: '14px', padding: '20px', textAlign: 'center', marginTop: '18px', border: '1px solid #1f1f1f' }}>
                <div style={{ fontSize: '.72rem', color: '#9ca3af', marginBottom: '4px', fontWeight: '700', letterSpacing: '.5px' }}>YOUR ESTIMATE</div>
                <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '2.2rem', fontWeight: '900', background: 'linear-gradient(135deg, #f472b6, #4a9eff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  ${request.estimate}
                </div>
              </div>

              {/* Back to home link */}
              <div style={{ textAlign: 'center', marginTop: '18px' }}>
                <button
                  onClick={() => router.push('/')}
                  style={{ background: 'none', border: 'none', color: '#6b7280', fontFamily: "'DM Sans', sans-serif", fontSize: '.82rem', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  ← Back to Home
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

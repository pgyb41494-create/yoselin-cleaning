'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from '../../lib/firebase';

export default function PortalPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const unsubReqRef = useRef(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) { router.push('/'); return; }
      if (u.email === ADMIN_EMAIL) { router.push('/admin'); return; }

      setUser(u);

      // Subscribe to all requests for this user
      const q = query(collection(db, 'requests'), where('userId', '==', u.uid));
      const unsubReq = onSnapshot(q, (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setRequests(docs);
        setLoading(false);
      }, (err) => {
        console.error('Firestore error:', err);
        setLoading(false);
      });

      unsubReqRef.current = unsubReq;
    });

    return () => {
      unsubAuth();
      if (unsubReqRef.current) unsubReqRef.current();
    };
  }, [router]);

  if (loading) return (
    <div className="spinner-page">
      <div className="spinner"></div>
    </div>
  );

  // Latest request is the first one (sorted by createdAt desc)
  const latest = requests[0] || null;
  const isDone = latest?.status === 'done';
  const isActive = latest && latest.status !== 'done';
  const statusLabel = latest?.status === 'new' ? 'Pending Review' : latest?.status === 'confirmed' ? 'Confirmed' : 'Completed';

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      {/* Nav */}
      <nav style={{ background: '#0d0d0d', borderBottom: '1px solid #1f1f1f', padding: '15px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div className="nav-brand">Yoselin's <span>Cleaning</span></div>
        <div className="nav-user">
          {user?.photoURL && <img src={user.photoURL} className="nav-avatar" alt="" />}
          <span className="nav-email">{user?.displayName?.split(' ')[0] || user?.email}</span>
          <button className="signout-btn" onClick={() => { signOut(auth); router.push('/'); }}>Sign Out</button>
        </div>
      </nav>

      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '32px 16px 80px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.5rem', fontWeight: '900', color: 'white', marginBottom: '4px' }}>
            My Portal
          </h1>
          <p style={{ color: '#6b7280', fontSize: '.85rem' }}>
            {user?.displayName ? 'Welcome back, ' + user.displayName.split(' ')[0] + '!' : 'Track your cleaning appointment.'}
          </p>
        </div>

        {/* NO REQUESTS */}
        {!latest && (
          <div style={{ background: '#111', borderRadius: '18px', border: '1px solid #222', padding: '56px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '14px' }}>:)</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.3rem', fontWeight: '700', marginBottom: '8px', color: 'white' }}>
              No booking yet
            </h2>
            <p style={{ color: '#9ca3af', fontSize: '.85rem', marginBottom: '28px', lineHeight: '1.6' }}>
              Book your first cleaning and get an instant estimate!
            </p>
            <a href="/book" style={{ display: 'inline-block', padding: '14px 36px', background: 'linear-gradient(135deg, #1a6fd4, #db2777)', color: 'white', borderRadius: '12px', fontWeight: '700', textDecoration: 'none', fontSize: '.95rem' }}>
              Book a Cleaning
            </a>
          </div>
        )}

        {/* COMPLETED */}
        {isDone && (
          <div>
            <div style={{ background: '#111', borderRadius: '20px', border: '1px solid #222', overflow: 'hidden', marginBottom: '16px' }}>
              <div style={{ background: '#0d0d0d', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1f1f1f' }}>
                <div style={{ fontWeight: '700', color: 'white', fontSize: '.95rem' }}>
                  Request #{latest.id.slice(-6).toUpperCase()}
                </div>
                <span style={{ background: '#d1fae5', color: '#065f46', padding: '4px 12px', borderRadius: '99px', fontSize: '.72rem', fontWeight: '700' }}>Completed</span>
              </div>
              <div style={{ padding: '44px 28px', textAlign: 'center' }}>
                <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.5rem', fontWeight: '900', color: 'white', marginBottom: '10px' }}>
                  Thanks for choosing Yoselin's!
                </h2>
                {latest.date && latest.date !== 'N/A' && (
                  <p style={{ color: '#9ca3af', fontSize: '.88rem', lineHeight: '1.7', marginBottom: '8px' }}>
                    Your cleaning on <strong style={{ color: 'white' }}>{latest.date}</strong> is complete.
                  </p>
                )}
                <p style={{ color: '#9ca3af', fontSize: '.88rem', lineHeight: '1.7', marginBottom: '36px' }}>
                  We hope everything looks sparkling clean!
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                  <a href="/book" style={{ display: 'inline-block', padding: '14px 36px', background: 'linear-gradient(135deg, #1a6fd4, #db2777)', color: 'white', borderRadius: '99px', fontWeight: '700', textDecoration: 'none', fontSize: '.95rem', boxShadow: '0 4px 20px rgba(26,111,212,.3)' }}>
                    Book Another Cleaning
                  </a>
                  <button onClick={() => router.push('/')} style={{ background: 'none', border: '1.5px solid #333', color: '#9ca3af', padding: '12px 32px', borderRadius: '99px', fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.88rem', cursor: 'pointer' }}>
                    Back to Home
                  </button>
                </div>
              </div>
            </div>

            {/* Past cleanings if more than 1 */}
            {requests.length > 1 && (
              <div style={{ background: '#111', borderRadius: '16px', border: '1px solid #222', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #1f1f1f', color: '#9ca3af', fontSize: '.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                  All Bookings ({requests.length})
                </div>
                {requests.map(r => (
                  <div key={r.id} style={{ padding: '14px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '.82rem', fontWeight: '700', color: 'white', marginBottom: '2px' }}>{r.date || 'No date set'}</div>
                      <div style={{ fontSize: '.75rem', color: '#6b7280' }}>{r.submittedAt}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                      <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: '900', color: '#60a5fa' }}>${r.estimate}</span>
                      <span className={'badge badge-' + r.status}>{r.status === 'new' ? 'New' : r.status === 'confirmed' ? 'Confirmed' : 'Done'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ACTIVE REQUEST */}
        {isActive && (
          <div style={{ background: '#111', borderRadius: '20px', border: '1px solid #222', overflow: 'hidden' }}>
            <div style={{ background: '#0d0d0d', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1f1f1f' }}>
              <div style={{ fontWeight: '700', color: 'white', fontSize: '.95rem' }}>
                Request #{latest.id.slice(-6).toUpperCase()}
              </div>
              <span className={'badge badge-' + latest.status}>{statusLabel}</span>
            </div>

            {/* Status banner */}
            {latest.status === 'confirmed' && (
              <div style={{ background: 'rgba(59,130,246,.1)', borderBottom: '1px solid rgba(59,130,246,.2)', padding: '12px 22px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }}></div>
                <span style={{ fontSize: '.82rem', color: '#93c5fd', fontWeight: '600' }}>
                  Your appointment is confirmed! Yoselin will see you on {latest.date}.
                </span>
              </div>
            )}
            {latest.status === 'new' && (
              <div style={{ background: 'rgba(245,158,11,.08)', borderBottom: '1px solid rgba(245,158,11,.15)', padding: '12px 22px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }}></div>
                <span style={{ fontSize: '.82rem', color: '#fcd34d', fontWeight: '600' }}>
                  Yoselin will review your request and confirm within 24 hours.
                </span>
              </div>
            )}

            <div style={{ padding: '20px 24px' }}>
              {[
                ['Submitted', latest.submittedAt],
                ['Service Date', latest.date || 'TBD'],
                ['Time', latest.time || 'TBD'],
                ['Address', latest.address],
                ['Rooms', latest.rooms],
                ['Bathrooms', latest.bathrooms],
                ['Frequency', latest.frequency],
                ...(latest.addons && latest.addons !== 'None' ? [['Add-Ons', latest.addons]] : []),
                ...(latest.pets === 'yes' ? [['Pets', 'Yes']] : []),
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1a1a1a', gap: '12px' }}>
                  <span style={{ fontSize: '.8rem', color: '#6b7280', fontWeight: '700', minWidth: '110px', flexShrink: 0 }}>{k}</span>
                  <span style={{ fontSize: '.85rem', fontWeight: '600', color: '#e5e7eb', textAlign: 'right', flex: 1 }}>{v}</span>
                </div>
              ))}

              {/* Estimate */}
              <div style={{ background: '#0d0d0d', borderRadius: '14px', padding: '20px', textAlign: 'center', marginTop: '18px', border: '1px solid #1f1f1f' }}>
                <div style={{ fontSize: '.72rem', color: '#9ca3af', marginBottom: '4px', fontWeight: '700', letterSpacing: '.5px' }}>YOUR ESTIMATE</div>
                <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '2.2rem', fontWeight: '900', background: 'linear-gradient(135deg, #f472b6, #4a9eff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  ${latest.estimate}
                </div>
                <div style={{ fontSize: '.72rem', color: '#6b7280', marginTop: '5px' }}>Final price confirmed after walkthrough or consultation</div>
              </div>

              <div style={{ textAlign: 'center', marginTop: '18px' }}>
                <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', color: '#6b7280', fontFamily: "'DM Sans', sans-serif", fontSize: '.82rem', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline' }}>
                  Back to Home
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

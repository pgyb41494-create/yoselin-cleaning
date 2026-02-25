'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from '../../lib/firebase';
import Chat from '../../components/Chat';

export default function PortalPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [request, setRequest] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    let timeout;
    try {
      const unsub = onAuthStateChanged(auth, (u) => {
        clearTimeout(timeout);
        if (!u) { router.push('/'); return; }
        if (u.email === ADMIN_EMAIL) { router.push('/admin'); return; }
        setUser(u);
      });
      timeout = setTimeout(() => { setLoading(false); setAuthError(true); }, 8000);
      return () => { unsub(); clearTimeout(timeout); };
    } catch (e) {
      setLoading(false);
      setAuthError(true);
    }
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

  if (authError) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0d0d0d',padding:'20px'}}>
      <div style={{background:'#181818',border:'1.5px solid #2a2a2a',borderRadius:'24px',padding:'48px 38px',maxWidth:'440px',textAlign:'center'}}>
        <div style={{fontSize:'2.5rem',marginBottom:'12px'}}>🛡️</div>
        <h2 style={{color:'white',fontFamily:'Playfair Display,serif',fontSize:'1.5rem',marginBottom:'8px'}}>Connection Blocked</h2>
        <p style={{color:'#9ca3af',fontSize:'.9rem',lineHeight:1.6,marginBottom:'20px'}}>It looks like an ad blocker or browser extension is preventing this page from loading. Please disable your ad blocker for this site and refresh the page.</p>
        <button onClick={() => window.location.reload()} style={{padding:'12px 28px',background:'linear-gradient(135deg,#1a6fd4,#db2777)',color:'white',border:'none',borderRadius:'12px',fontSize:'.95rem',fontWeight:700,cursor:'pointer'}}>Refresh Page</button>
      </div>
    </div>
  );

  const statusLabel = request?.status === 'new' ? '🆕 Pending Review' : request?.status === 'confirmed' ? '✅ Confirmed' : '🏁 Completed';

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d0d' }}>
      <nav className="nav">
        <div className="nav-brand">Yoselin's <span>Cleaning</span></div>
        <div className="nav-user">
          {user?.photoURL && <img src={user.photoURL} className="nav-avatar" alt="" />}
          <span className="nav-email">{user?.displayName?.split(' ')[0]}</span>
          <button className="signout-btn" onClick={() => { signOut(auth); router.push('/'); }}>Sign Out</button>
        </div>
      </nav>

      <div className="portal-body">
        {/* Back to dashboard */}
        <button
          onClick={() => router.push('/dashboard')}
          style={{ display:'flex', alignItems:'center', gap:'6px', background:'none', border:'none', color:'#6b7280', fontSize:'.82rem', fontWeight:600, cursor:'pointer', marginBottom:'16px', padding:'6px 0' }}
        >
          ← Back to Dashboard
        </button>

        <div className="portal-head">My Cleaning Request 📋</div>
        <div className="portal-sub">Track your request and chat with us.</div>

        {!request ? (
          <div className="book-cta">
            <h2>No request yet</h2>
            <p>Get a quote and get an instant estimate!</p>
            <a href="/book">Get a Quote →</a>
          </div>
        ) : (
          <div className="req-card">
            <div className="req-head">
              <div className="req-title">Request #{request.id.slice(-6).toUpperCase()}</div>
              <span className={`badge badge-${request.status}`}>{statusLabel}</span>
            </div>
            <div className="req-body">
              <div className="prow"><span className="pk">Submitted</span><span className="pv">{request.submittedAt}</span></div>
              <div className="prow"><span className="pk">Service Date</span><span className="pv">{request.date || 'TBD'}</span></div>
              <div className="prow"><span className="pk">Time</span><span className="pv">{request.time || 'TBD'}</span></div>
              <div className="prow"><span className="pk">Address</span><span className="pv">{request.address}</span></div>
              <div className="prow"><span className="pk">Frequency</span><span className="pv">{request.frequency}</span></div>
              <div className="prow"><span className="pk">Add-Ons</span><span className="pv">{request.addons || 'None'}</span></div>
              <div className="price-chip">
                <div className="price-chip-label">YOUR ESTIMATE</div>
                <div className="price-chip-val">${request.estimate}</div>
              </div>
              <div style={{ display:'flex', gap:'10px', marginTop:'4px' }}>
                <button className="chat-open-btn" style={{ flex:1 }} onClick={() => setChatOpen(true)}>💬 Chat with Owner</button>
                <button
                  onClick={() => router.push('/dashboard')}
                  style={{ flex:1, padding:'12px', background:'#f3f4f6', border:'1.5px solid #e2e8f0', borderRadius:'12px', fontWeight:700, fontSize:'.88rem', cursor:'pointer', color:'#374151' }}
                >
                  🏠 My Dashboard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {chatOpen && request && (
        <Chat requestId={request.id} currentUser={user} senderRole="customer" onClose={() => setChatOpen(false)} />
      )}
    </div>
  );
}

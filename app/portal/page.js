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

  const statusLabel = request?.status === 'new' ? '🆕 Pending Review' : request?.status === 'confirmed' ? '✅ Confirmed' : '🏁 Completed';

  return (
    <div style={{ minHeight: '100vh', background: '#f1f4f9' }}>
      <nav className="nav">
        <div className="nav-brand">Yoselin's <span>Cleaning</span></div>
        <div className="nav-user">
          {user?.photoURL && <img src={user.photoURL} className="nav-avatar" alt="" />}
          <span className="nav-email">{user?.displayName?.split(' ')[0]}</span>
          <button className="signout-btn" onClick={() => { signOut(auth); router.push('/'); }}>Sign Out</button>
        </div>
      </nav>

      <div className="portal-body">
        <div className="portal-head">My Cleaning Request 📋</div>
        <div className="portal-sub">Track your request and chat with Yoselin.</div>

        {!request ? (
          <div className="book-cta">
            <h2>No request yet</h2>
            <p>Book your first cleaning and get an instant estimate!</p>
            <a href="/book">Book a Cleaning →</a>
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
              <button className="chat-open-btn" onClick={() => setChatOpen(true)}>💬 Chat with Yoselin</button>
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

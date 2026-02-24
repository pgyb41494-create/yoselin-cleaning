'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from '../../lib/firebase';
import Chat from '../../components/Chat';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('home');

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

  const firstName = user?.displayName?.split(' ')[0] || 'there';
  const statusLabel = request?.status === 'new' ? '⏳ Pending' : request?.status === 'confirmed' ? '✅ Confirmed' : '🏁 Completed';
  const statusColor = request?.status === 'new' ? '#f59e0b' : request?.status === 'confirmed' ? '#10b981' : '#6b7280';

  return (
    <div className="cd-root">

      {/* NAV */}
      <nav className="cd-nav">
        <div className="cd-nav-brand">✨ Yoselins Cleaning</div>
        <div className="cd-nav-right">
          {user?.photoURL && <img src={user.photoURL} className="nav-avatar" alt="" />}
          <span className="cd-nav-name">{firstName}</span>
          <button className="signout-btn" onClick={() => { signOut(auth); router.push('/'); }}>Sign Out</button>
        </div>
      </nav>

      {/* GREETING */}
      <div className="cd-greeting">
        <h1>Hey, {firstName} 👋</h1>
        <p>What would you like to do today?</p>
      </div>

      {/* TAB BAR */}
      <div className="cd-tabs">
        <button className={`cd-tab ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>🏠 Home</button>
        <button className={`cd-tab ${activeTab === 'messages' ? 'active' : ''}`} onClick={() => setActiveTab('messages')}>💬 Messages</button>
        <button className={`cd-tab ${activeTab === 'request' ? 'active' : ''}`} onClick={() => setActiveTab('request')}>📋 My Request</button>
      </div>

      <div className="cd-body">

        {/* ── HOME TAB ── */}
        {activeTab === 'home' && (
          <div className="cd-home">

            {/* Quick status card if they have a request */}
            {request && (
              <div className="cd-status-card">
                <div className="csc-left">
                  <div className="csc-label">Current Request</div>
                  <div className="csc-id">#{request.id.slice(-6).toUpperCase()}</div>
                  <div className="csc-status" style={{ color: statusColor }}>{statusLabel}</div>
                </div>
                <div className="csc-right">
                  <div className="csc-price-label">Estimate</div>
                  <div className="csc-price">${request.estimate}</div>
                </div>
              </div>
            )}

            {/* Action cards */}
            <div className="cd-actions-grid">
              <div className="cd-action-card" onClick={() => request ? setActiveTab('request') : router.push('/book')}>
                <div className="cac-icon">🗓</div>
                <div className="cac-title">{request ? 'View Booking' : 'Book a Cleaning'}</div>
                <div className="cac-desc">{request ? 'See your appointment details' : 'Get an instant quote and schedule'}</div>
              </div>

              <div className="cd-action-card" onClick={() => request ? setActiveTab('messages') : null} style={{ opacity: request ? 1 : 0.5, cursor: request ? 'pointer' : 'not-allowed' }}>
                <div className="cac-icon">💬</div>
                <div className="cac-title">Messages</div>
                <div className="cac-desc">{request ? 'View and send messages' : 'Available after booking'}</div>
              </div>

              <div className="cd-action-card" onClick={() => router.push('/book')}>
                <div className="cac-icon">💰</div>
                <div className="cac-title">Get a Quote</div>
                <div className="cac-desc">See pricing for your space</div>
              </div>

              <div className="cd-action-card" onClick={() => setActiveTab('request')} style={{ opacity: request ? 1 : 0.5, cursor: request ? 'pointer' : 'not-allowed' }}>
                <div className="cac-icon">📋</div>
                <div className="cac-title">My Request</div>
                <div className="cac-desc">{request ? 'Track your cleaning request' : 'No request yet'}</div>
              </div>
            </div>

            {/* No booking CTA */}
            {!request && (
              <div className="cd-cta-box">
                <div style={{ fontSize: '2rem', marginBottom: '10px' }}>✨</div>
                <h3>Ready to get started?</h3>
                <p>Book your first cleaning and get an instant estimate in under 2 minutes.</p>
                <button className="cd-btn-primary" onClick={() => router.push('/book')}>Book a Cleaning →</button>
              </div>
            )}
          </div>
        )}

        {/* ── MESSAGES TAB ── */}
        {activeTab === 'messages' && (
          <div className="cd-messages">
            {!request ? (
              <div className="cd-empty">
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>💬</div>
                <h3>No messages yet</h3>
                <p>Messages will appear here after you book a cleaning.</p>
                <button className="cd-btn-primary" style={{ marginTop: '16px' }} onClick={() => router.push('/book')}>Book a Cleaning →</button>
              </div>
            ) : (
              <div className="cd-chat-wrap">
                <Chat requestId={request.id} currentUser={user} senderRole="customer" onClose={null} inline={true} />
              </div>
            )}
          </div>
        )}

        {/* ── MY REQUEST TAB ── */}
        {activeTab === 'request' && (
          <div className="cd-request">
            {!request ? (
              <div className="cd-empty">
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📋</div>
                <h3>No request yet</h3>
                <p>Book your first cleaning to see your request details here.</p>
                <button className="cd-btn-primary" style={{ marginTop: '16px' }} onClick={() => router.push('/book')}>Book a Cleaning →</button>
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
                  <div className="prow"><span className="pk">Rooms</span><span className="pv">{request.rooms}</span></div>
                  <div className="prow"><span className="pk">Bathrooms</span><span className="pv">{request.bathrooms}</span></div>
                  <div className="price-chip">
                    <div className="price-chip-label">YOUR ESTIMATE</div>
                    <div className="price-chip-val">${request.estimate}</div>
                  </div>
                  <button className="cd-btn-primary" style={{ width: '100%', marginTop: '14px' }} onClick={() => setActiveTab('messages')}>
                    💬 View Messages
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

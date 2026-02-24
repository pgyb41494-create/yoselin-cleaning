'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db, isAdmin } from '../../lib/firebase';
import ChatPanel from '../../components/ChatPanel';

const s = {
  page: { minHeight: '100vh', background: '#f1f4f9' },
  nav: { background: '#0d0d0d', padding: '15px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontFamily: "'Playfair Display', serif", color: 'white', fontSize: '1.1rem', fontWeight: 700 },
  brandSpan: { color: '#f472b6' },
  logoutBtn: { background: '#222', border: '1px solid #444', color: '#c0c4cc', padding: '8px 16px', borderRadius: '8px', fontFamily: "'DM Sans', sans-serif", fontSize: '.79rem', cursor: 'pointer' },
  body: { maxWidth: '700px', margin: '0 auto', padding: '28px 16px 60px' },
  heading: { fontFamily: "'Playfair Display', serif", fontSize: '1.4rem', fontWeight: 900, marginBottom: '4px', color: '#0d0d0d' },
  sub: { fontSize: '.85rem', color: '#4b5563', marginBottom: '22px' },
  card: { background: 'white', borderRadius: '18px', border: '1.5px solid #e2e8f0', marginBottom: '16px', overflow: 'hidden' },
  cardHead: { background: '#0d0d0d', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontWeight: 700, color: 'white', fontSize: '.95rem' },
  cardBody: { padding: '18px 20px' },
  row: { display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f3f4f6', fontSize: '.83rem' },
  rowKey: { color: '#4b5563', fontWeight: 600 },
  rowVal: { fontWeight: 600, color: '#111827' },
  priceChip: { background: '#0d0d0d', borderRadius: '12px', padding: '16px 20px', textAlign: 'center', marginTop: '14px' },
  priceLabel: { fontSize: '.72rem', color: '#9ca3af', marginBottom: '3px' },
  priceVal: { fontFamily: "'Playfair Display', serif", fontSize: '2rem', fontWeight: 900, background: 'linear-gradient(135deg,#f472b6,#4a9eff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  chatBtn: { width: '100%', marginTop: '16px', padding: '13px', background: 'linear-gradient(135deg,#1a6fd4,#db2777)', color: 'white', border: 'none', borderRadius: '12px', fontFamily: "'DM Sans', sans-serif", fontSize: '.95rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
  bookBtn: { display: 'block', width: '100%', marginTop: '12px', padding: '14px', background: 'linear-gradient(135deg,#1a6fd4,#db2777)', color: 'white', border: 'none', borderRadius: '14px', fontFamily: "'DM Sans', sans-serif", fontSize: '1rem', fontWeight: 700, cursor: 'pointer', textAlign: 'center' },
  emptyState: { textAlign: 'center', padding: '48px 20px', background: 'white', borderRadius: '18px', border: '1.5px solid #e2e8f0' },
};

function StatusBadge({ status }) {
  const map = {
    new: { bg: '#fce4f3', color: '#db2777', label: '🆕 Pending Review' },
    confirmed: { bg: '#e8f2ff', color: '#1a6fd4', label: '✅ Confirmed' },
    done: { bg: '#d1fae5', color: '#065f46', label: '🏁 Completed' },
  };
  const st = map[status] || map.new;
  return (
    <span style={{ background: st.bg, color: st.color, padding: '3px 10px', borderRadius: '99px', fontSize: '.69rem', fontWeight: 700 }}>
      {st.label}
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [requests, setRequests] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatReq, setChatReq] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) { router.replace('/'); return; }
      if (isAdmin(u)) { router.replace('/admin'); return; }
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'requests'), where('uid', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      reqs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setRequests(reqs);
    });
    return () => unsub();
  }, [user]);

  function openChat(req) {
    setChatReq(req);
    setChatOpen(true);
  }

  if (loading) return <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: '#6b7280' }}>Loading...</div></div>;

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <div style={s.brand}>Yoselin's <span style={s.brandSpan}>Cleaning</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {user?.photoURL && <img src={user.photoURL} alt="" style={{ width: 30, height: 30, borderRadius: '50%' }} />}
          <button style={s.logoutBtn} onClick={() => signOut(auth).then(() => router.replace('/'))}>Sign Out</button>
        </div>
      </nav>

      <div style={s.body}>
        <div style={s.heading}>My Requests 📋</div>
        <div style={s.sub}>Track your cleaning appointments and chat with Yoselin.</div>

        {requests.length === 0 ? (
          <div style={s.emptyState}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🧹</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px', color: '#0d0d0d' }}>No requests yet</div>
            <div style={{ color: '#6b7280', fontSize: '.85rem', marginBottom: '20px' }}>Book your first cleaning and we'll take care of the rest!</div>
            <button style={s.bookBtn} onClick={() => router.push('/booking')}>✨ Book a Cleaning</button>
          </div>
        ) : (
          <>
            <button style={{ ...s.bookBtn, marginBottom: '16px' }} onClick={() => router.push('/booking')}>✨ Book Another Cleaning</button>
            {requests.map(req => (
              <div key={req.id} style={s.card}>
                <div style={s.cardHead}>
                  <div style={s.cardTitle}>Cleaning Request</div>
                  <StatusBadge status={req.status} />
                </div>
                <div style={s.cardBody}>
                  {[
                    ['Submitted', req.submittedAt],
                    ['Service Date', req.date || 'TBD'],
                    ['Time', req.time || 'TBD'],
                    ['Address', req.address],
                    ['Frequency', req.frequency],
                    ['Add-Ons', req.addons || 'None'],
                  ].map(([k, v]) => (
                    <div key={k} style={{ ...s.row }}>
                      <span style={s.rowKey}>{k}</span>
                      <span style={s.rowVal}>{v}</span>
                    </div>
                  ))}
                  <div style={s.priceChip}>
                    <div style={s.priceLabel}>YOUR ESTIMATE</div>
                    <div style={s.priceVal}>${req.estimate}</div>
                  </div>
                  <button style={s.chatBtn} onClick={() => openChat(req)}>
                    💬 Chat with Yoselin
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {chatOpen && chatReq && (
        <ChatPanel
          requestId={chatReq.id}
          clientName={user?.displayName || user?.email}
          senderRole="customer"
          senderName={user?.displayName?.split(' ')[0] || 'You'}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}

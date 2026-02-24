'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from '../../lib/firebase';
import Chat from '../../components/Chat';

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [chatReq, setChatReq] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u || u.email !== ADMIN_EMAIL) { router.push('/'); return; }
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'requests'), orderBy('createdAt', 'desc')),
      snap => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [user]);

  const confirmReq = async (req) => {
    await updateDoc(doc(db, 'requests', req.id), { status: 'confirmed' });
    // send auto chat
    await addDoc(collection(db, 'chats', req.id, 'messages'), {
      text: `Hi ${req.name.split(' ')[0]}! 🎉 Your cleaning appointment has been confirmed for ${req.date}. Please reach out if you have any questions!`,
      sender: 'admin', senderName: 'Yoselin', createdAt: serverTimestamp(),
    });
    setSelected(r => r ? { ...r, status: 'confirmed' } : r);
  };

  const markDone = async (req) => {
    await updateDoc(doc(db, 'requests', req.id), { status: 'done' });
    setSelected(r => r ? { ...r, status: 'done' } : r);
  };

  if (loading) return <div className="spinner-page"><div className="spinner"></div></div>;

  const newCount = requests.filter(r => r.status === 'new').length;
  const avg = requests.length ? Math.round(requests.reduce((s, r) => s + (r.estimate || 0), 0) / requests.length) : 0;
  const pipeline = requests.reduce((s, r) => s + (r.estimate || 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f1f4f9' }}>
      <nav className="nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="nav-brand">Yoselin's <span>Cleaning</span></div>
          <span className="nav-badge">ADMIN</span>
        </div>
        <div className="nav-user">
          {user?.photoURL && <img src={user.photoURL} className="nav-avatar" alt="" />}
          <span className="nav-email">{user?.email}</span>
          <button className="signout-btn" onClick={() => { signOut(auth); router.push('/'); }}>Sign Out</button>
        </div>
      </nav>

      <div className="admin-body">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">TOTAL REQUESTS</div><div className="stat-val">{requests.length}</div></div>
          <div className="stat-card"><div className="stat-label">NEW</div><div className="stat-val">{newCount}</div><div className="stat-sub">Awaiting response</div></div>
          <div className="stat-card"><div className="stat-label">AVG ESTIMATE</div><div className="stat-val">${avg}</div></div>
          <div className="stat-card"><div className="stat-label">PIPELINE</div><div className="stat-val">${pipeline}</div></div>
        </div>

        <div className="section-head">📋 All Requests</div>
        <div className="table-wrap">
          {requests.length === 0 ? (
            <div className="empty-state"><div style={{ fontSize: '2.4rem', marginBottom: '10px' }}>📭</div>No requests yet.</div>
          ) : (
            <table>
              <thead><tr><th>Submitted</th><th>Client</th><th>Email</th><th>Date</th><th>Estimate</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id}>
                    <td>{r.submittedAt}</td>
                    <td><strong>{r.name}</strong></td>
                    <td>{r.email}</td>
                    <td>{r.date}</td>
                    <td><strong style={{ color: 'var(--blue)' }}>${r.estimate}</strong></td>
                    <td>
                      <span className={`badge badge-${r.status}`}>
                        {r.status === 'new' ? '🆕 New' : r.status === 'confirmed' ? '✅ Confirmed' : '🏁 Done'}
                      </span>
                    </td>
                    <td><button className="view-btn" onClick={() => setSelected(r)}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="overlay show" onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="modal">
            <div className="modal-head">
              <h3>Request Details</h3>
              <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className="price-box">
              <div className="price-label">ESTIMATED TOTAL</div>
              <div className="price-val">${selected.estimate}</div>
            </div>
            {[
              ['Submitted', selected.submittedAt], ['Client', selected.name], ['Phone', selected.phone],
              ['Email', selected.email], ['Address', selected.address], ['Date Requested', selected.date],
              ['Time', selected.time], ['Bathrooms', selected.bathrooms], ['Rooms', selected.rooms],
              ['Add-Ons', selected.addons], ['Pets', selected.pets === 'yes' ? 'Yes' : 'No'],
              ['Other Requests', selected.otherRequests || '—'], ['Walk-Through', selected.walkthrough || 'No'],
              ['Frequency', selected.frequency], ['First-Time?', selected.firstTime === 'yes' ? 'Yes (10% disc)' : 'No'],
              ['Senior?', selected.senior === 'yes' ? 'Yes (10% disc)' : 'No'],
              ['Home Access', selected.access], ['Referral', selected.referral || '—'], ['Notes', selected.notes || '—'],
            ].map(([k, v]) => (
              <div key={k} className="detail-row"><span className="dk">{k}</span><span className="dv">{v}</span></div>
            ))}
            <div className="modal-actions">
              {selected.status === 'new' && (
                <button className="act-btn act-confirm" onClick={() => confirmReq(selected)}>✅ Confirm Appointment</button>
              )}
              {selected.status === 'confirmed' && (
                <button className="act-btn act-done" onClick={() => markDone(selected)}>🏁 Mark Done</button>
              )}
              <button className="act-btn act-chat" onClick={() => { setChatReq(selected); setSelected(null); }}>💬 Chat with Client</button>
            </div>
          </div>
        </div>
      )}

      {/* Chat */}
      {chatReq && (
        <Chat
          requestId={chatReq.id}
          currentUser={user}
          senderRole="admin"
          clientName={chatReq.name}
          onClose={() => setChatReq(null)}
        />
      )}
    </div>
  );
}

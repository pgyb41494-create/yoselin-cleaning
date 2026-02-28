'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { auth, db, ADMIN_EMAILS } from '../../lib/firebase';
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
      if (!u || !ADMIN_EMAILS.includes(u.email)) { router.push('/'); return; }
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
    <div className="ad-root">
      {/* Nav */}
      <div className="ad-nav">
        <div className="ad-nav-left">
          <div className="ad-nav-brand">Yoselin's <span style={{color:'var(--pink)'}}>Cleaning</span></div>
          <span className="ad-badge">ADMIN</span>
        </div>
        <div className="nav-user">
          {user?.photoURL
            ? <img src={user.photoURL} className="nav-avatar" alt="" />
            : <div className="cd-avatar-initials">{user?.email?.[0]?.toUpperCase()}</div>
          }
          <span className="nav-email">{user?.email}</span>
          <button className="signout-btn" onClick={() => { signOut(auth); router.push('/'); }}>Sign Out</button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="ad-stats">
        <div className="ad-stat"><div className="ad-stat-val ad-stat-blue">{requests.length}</div><div className="ad-stat-label">Total Requests</div></div>
        <div className="ad-stat"><div className="ad-stat-val ad-stat-yellow">{newCount}</div><div className="ad-stat-label">New</div></div>
        <div className="ad-stat"><div className="ad-stat-val ad-stat-green">${avg}</div><div className="ad-stat-label">Avg Estimate</div></div>
        <div className="ad-stat"><div className="ad-stat-val ad-stat-pink">${pipeline}</div><div className="ad-stat-label">Pipeline</div></div>
      </div>

      {/* Table */}
      <div className="ad-body">
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
                    <td><strong style={{ color: 'var(--blue-light)' }}>${r.estimate}</strong></td>
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
            {/* Header */}
            <div className="modal-head">
              <div>
                <h3>{selected.name}</h3>
                <span className={`badge badge-${selected.status}`} style={{ marginTop: 4, display: 'inline-block' }}>
                  {selected.status === 'new' ? '🆕 New' : selected.status === 'confirmed' ? '✅ Confirmed' : '🏁 Done'}
                </span>
              </div>
              <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
            </div>

            {/* Price + quick info row */}
            <div className="modal-top-row">
              <div className="price-box">
                <div className="price-label">ESTIMATE</div>
                <div className="price-val">${selected.estimate}</div>
              </div>
              <div className="quick-info">
                <div className="qi-item"><span className="qi-label">📅 Date</span><span className="qi-val">{selected.date}</span></div>
                <div className="qi-item"><span className="qi-label">🕐 Time</span><span className="qi-val">{selected.time || '—'}</span></div>
                <div className="qi-item"><span className="qi-label">📱 Phone</span><span className="qi-val">{selected.phone}</span></div>
                <div className="qi-item"><span className="qi-label">🔁 Frequency</span><span className="qi-val">{selected.frequency || '—'}</span></div>
              </div>
            </div>

            {/* Two-column detail grid */}
            <div className="detail-grid">
              <div className="detail-cell"><span className="dk">Submitted</span><span className="dv">{selected.submittedAt}</span></div>
              <div className="detail-cell"><span className="dk">Email</span><span className="dv">{selected.email}</span></div>
              <div className="detail-cell full"><span className="dk">Address</span><span className="dv">{selected.address}</span></div>
              <div className="detail-cell full"><span className="dk">Bathrooms</span><span className="dv">{selected.bathrooms}</span></div>
              <div className="detail-cell full"><span className="dk">Rooms</span><span className="dv">{selected.rooms}</span></div>
              <div className="detail-cell full"><span className="dk">Add-Ons</span><span className="dv">{selected.addons || '—'}</span></div>
              <div className="detail-cell"><span className="dk">Pets</span><span className="dv">{selected.pets === 'yes' ? 'Yes' : 'No'}</span></div>
              <div className="detail-cell"><span className="dk">Walk-Through</span><span className="dv">{selected.walkthrough || 'No'}</span></div>
              <div className="detail-cell"><span className="dk">First-Time?</span><span className="dv">{selected.firstTime === 'yes' ? 'Yes (10% disc)' : 'No'}</span></div>
              <div className="detail-cell"><span className="dk">Senior?</span><span className="dv">{selected.senior === 'yes' ? 'Yes (10% disc)' : 'No'}</span></div>
              <div className="detail-cell"><span className="dk">Home Access</span><span className="dv">{selected.access || '—'}</span></div>
              <div className="detail-cell"><span className="dk">Referral</span><span className="dv">{selected.referral || '—'}</span></div>
              {selected.otherRequests && <div className="detail-cell full"><span className="dk">Other Requests</span><span className="dv">{selected.otherRequests}</span></div>}
              {selected.notes && <div className="detail-cell full"><span className="dk">Notes</span><span className="dv">{selected.notes}</span></div>}
            </div>

            {/* Actions */}
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

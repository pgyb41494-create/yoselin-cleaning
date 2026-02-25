'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from '../../lib/firebase';
import Chat from '../../components/Chat';
import BookingWizard from '../../components/BookingWizard';

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [requests, setRequests] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [selected, setSelected] = useState(null);
  const [chatReq, setChatReq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('requests');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [createDone, setCreateDone] = useState(false);

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
    const unsubReqs = onSnapshot(
      query(collection(db, 'requests'), orderBy('createdAt', 'desc')),
      snap => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubAvail = onSnapshot(collection(db, 'availability'), snap => {
      const slots = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      slots.sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
      setAvailability(slots);
    });
    return () => { unsubReqs(); unsubAvail(); };
  }, [user]);

  const confirmReq = async (req) => {
    await updateDoc(doc(db, 'requests', req.id), { status: 'confirmed' });
    await addDoc(collection(db, 'chats', req.id, 'messages'), {
      text: `Hi ${req.name.split(' ')[0]}! Your cleaning appointment has been confirmed for ${req.date}. Please reach out if you have any questions!`,
      sender: 'admin', senderName: 'Yoselin', createdAt: serverTimestamp(),
    });
    setSelected(r => r ? { ...r, status: 'confirmed' } : r);
  };

  const markDone = async (req) => {
    await updateDoc(doc(db, 'requests', req.id), { status: 'done' });
    setSelected(r => r ? { ...r, status: 'done' } : r);
  };

  const addSlot = async () => {
    if (!newDate.trim() || !newTime.trim()) { alert('Enter both a date and time.'); return; }
    await addDoc(collection(db, 'availability'), { date: newDate.trim(), time: newTime.trim(), createdAt: serverTimestamp() });
    setNewDate(''); setNewTime('');
  };

  const removeSlot = async (id) => {
    await deleteDoc(doc(db, 'availability', id));
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

      {/* Tab Bar */}
      <div style={{ background: 'white', borderBottom: '1.5px solid var(--border)', padding: '0 26px', display: 'flex' }}>
        {[['requests','📋 Requests'],['availability','📅 Availability'],['create','✏️ Create Quote']].map(([t, label]) => (
          <button key={t} onClick={() => { setTab(t); setCreateDone(false); }} style={{
            padding: '14px 20px', background: 'none', border: 'none',
            borderBottom: tab === t ? '3px solid var(--blue)' : '3px solid transparent',
            fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.85rem',
            color: tab === t ? 'var(--blue)' : '#6b7280', cursor: 'pointer', transition: 'color .15s',
          }}>{label}</button>
        ))}
      </div>

      <div className="admin-body">

        {/* REQUESTS TAB */}
        {tab === 'requests' && (
          <>
            <div className="stats-grid">
              <div className="stat-card"><div className="stat-label">TOTAL REQUESTS</div><div className="stat-val">{requests.length}</div></div>
              <div className="stat-card"><div className="stat-label">NEW</div><div className="stat-val">{newCount}</div><div className="stat-sub">Awaiting response</div></div>
              <div className="stat-card"><div className="stat-label">AVG ESTIMATE</div><div className="stat-val">${avg}</div></div>
              <div className="stat-card"><div className="stat-label">PIPELINE</div><div className="stat-val">${pipeline}</div></div>
            </div>
            <div className="section-head">📋 All Requests</div>
            <div className="table-wrap">
              {requests.length === 0 ? (
                <div className="empty-state"><div style={{fontSize:'2.4rem',marginBottom:'10px'}}>📭</div>No requests yet.</div>
              ) : (
                <table>
                  <thead><tr><th>Submitted</th><th>Client</th><th>Email</th><th>Date</th><th>Estimate</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {requests.map(r => (
                      <tr key={r.id}>
                        <td>{r.submittedAt}</td>
                        <td>
                          <strong>{r.name}</strong>
                          {r.createdByAdmin && <span style={{fontSize:'.65rem',color:'var(--blue)',marginLeft:'6px',fontWeight:'700',background:'var(--blue-pale)',padding:'2px 6px',borderRadius:'4px'}}>ADMIN</span>}
                        </td>
                        <td>{r.email}</td>
                        <td>{r.date}</td>
                        <td><strong style={{color:'var(--blue)'}}>${r.estimate}</strong></td>
                        <td><span className={`badge badge-${r.status}`}>{r.status==='new'?'🆕 New':r.status==='confirmed'?'✅ Confirmed':'🏁 Done'}</span></td>
                        <td><button className="view-btn" onClick={() => setSelected(r)}>View</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* AVAILABILITY TAB */}
        {tab === 'availability' && (
          <>
            <div className="section-head">📅 Manage Available Dates & Times</div>
            <p style={{fontSize:'.85rem',color:'#4b5563',marginBottom:'20px'}}>
              Add the dates and time slots customers can pick from when booking. They will appear as dropdowns on the booking form.
            </p>
            <div className="wcard" style={{marginBottom:'20px'}}>
              <div className="card-header">
                <div className="card-icon">➕</div>
                <div><div className="card-title">Add New Slot</div><div className="card-sub">e.g. "Monday, March 10" + "Morning (8am-12pm)"</div></div>
              </div>
              <div className="card-body">
                <div className="row2">
                  <div className="fg">
                    <label>Date</label>
                    <input type="text" value={newDate} onChange={e => setNewDate(e.target.value)} placeholder="e.g. Monday, March 10" />
                  </div>
                  <div className="fg">
                    <label>Time Slot</label>
                    <select value={newTime} onChange={e => setNewTime(e.target.value)}>
                      <option value="">Select a time slot</option>
                      <option>Morning (8am-12pm)</option>
                      <option>Afternoon (12pm-4pm)</option>
                      <option>Evening (4pm-7pm)</option>
                      <option>Flexible / Any Time</option>
                    </select>
                  </div>
                </div>
                <button className="btn-next" style={{maxWidth:'180px',padding:'11px 20px',fontSize:'.88rem'}} onClick={addSlot}>
                  + Add Slot
                </button>
              </div>
            </div>
            {availability.length === 0 ? (
              <div className="table-wrap">
                <div className="empty-state"><div style={{fontSize:'2rem',marginBottom:'8px'}}>📅</div>No slots yet. Add some above!</div>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Time Slot</th><th></th></tr></thead>
                  <tbody>
                    {availability.map(slot => (
                      <tr key={slot.id}>
                        <td><strong>{slot.date}</strong></td>
                        <td>{slot.time}</td>
                        <td>
                          <button onClick={() => removeSlot(slot.id)} style={{background:'#fee2e2',color:'#dc2626',border:'none',padding:'5px 12px',borderRadius:'8px',fontSize:'.75rem',fontWeight:'700',cursor:'pointer'}}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* CREATE QUOTE TAB */}
        {tab === 'create' && (
          <>
            {createDone ? (
              <div style={{background:'white',borderRadius:'18px',border:'1.5px solid var(--border)',padding:'48px 24px',textAlign:'center',maxWidth:'480px',margin:'0 auto'}}>
                <div style={{fontSize:'3rem',marginBottom:'14px'}}>✅</div>
                <h2 style={{fontFamily:'Playfair Display,serif',fontSize:'1.4rem',fontWeight:'700',marginBottom:'8px'}}>Quote Created!</h2>
                <p style={{color:'#4b5563',fontSize:'.87rem',marginBottom:'24px'}}>The new request has been added to your requests list.</p>
                <div style={{display:'flex',gap:'12px',justifyContent:'center',flexWrap:'wrap'}}>
                  <button className="act-btn act-confirm" onClick={() => { setTab('requests'); setCreateDone(false); }} style={{flex:'none',padding:'12px 24px'}}>View Requests →</button>
                  <button className="act-btn act-chat" onClick={() => setCreateDone(false)} style={{flex:'none',padding:'12px 24px'}}>Create Another</button>
                </div>
              </div>
            ) : (
              <>
                <div className="section-head">✏️ Create a Quote</div>
                <p style={{fontSize:'.85rem',color:'#4b5563',marginBottom:'20px'}}>Fill out the booking form on behalf of a client.</p>
                <div style={{background:'white',borderRadius:'18px',border:'1.5px solid var(--border)',overflow:'hidden'}}>
                  <div style={{background:'linear-gradient(135deg,var(--blue),var(--pink-deep))',padding:'18px 24px'}}>
                    <div style={{fontFamily:'Playfair Display,serif',color:'white',fontSize:'1.1rem',fontWeight:'700'}}>✨ New Client Quote</div>
                    <div style={{color:'rgba(255,255,255,.75)',fontSize:'.78rem',marginTop:'3px'}}>Same form your customers use</div>
                  </div>
                  <BookingWizard user={null} adminMode={true} onDone={() => setCreateDone(true)} />
                </div>
              </>
            )}
          </>
        )}
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

      {chatReq && (
        <Chat requestId={chatReq.id} currentUser={user} senderRole="admin" clientName={chatReq.name} onClose={() => setChatReq(null)} />
      )}
    </div>
  );
}

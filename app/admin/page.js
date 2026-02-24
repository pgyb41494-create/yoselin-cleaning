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
  const [adminTab, setAdminTab] = useState('new'); // 'new' | 'confirmed' | 'done'
  const [showQuoteBuilder, setShowQuoteBuilder] = useState(false);

  // Manual quote form
  const [qForm, setQForm] = useState({ name: '', email: '', phone: '', address: '', date: '', time: '', service: 'Standard Clean', estimate: '', notes: '' });
  const [qBusy, setQBusy] = useState(false);
  const [qDone, setQDone] = useState(false);

  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    let timeout;
    try {
      const unsub = onAuthStateChanged(auth, (u) => {
        clearTimeout(timeout);
        if (!u || u.email !== ADMIN_EMAIL) { router.push('/'); return; }
        setUser(u);
        setLoading(false);
      });
      // If auth never responds (blocked by ad blocker), show error after 8s
      timeout = setTimeout(() => { setLoading(false); setAuthError(true); }, 8000);
      return () => { unsub(); clearTimeout(timeout); };
    } catch (e) {
      setLoading(false);
      setAuthError(true);
    }
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

  const submitManualQuote = async () => {
    if (!qForm.name || !qForm.estimate) { alert('Name and estimate are required.'); return; }
    setQBusy(true);
    const ref = await addDoc(collection(db, 'requests'), {
      ...qForm,
      estimate: Number(qForm.estimate),
      userId: 'manual-' + Date.now(),
      userEmail: qForm.email,
      status: 'new',
      frequency: qForm.service,
      bathrooms: '—', rooms: '—', addons: '—', pets: 'no',
      submittedAt: new Date().toLocaleString(),
      createdAt: serverTimestamp(),
      isManual: true,
    });
    await addDoc(collection(db, 'chats', ref.id, 'messages'), {
      text: `Hi ${qForm.name.split(' ')[0]}! 👋 I've prepared a quote for your cleaning service. Your estimate is $${qForm.estimate}. Please reach out with any questions!`,
      sender: 'admin', senderName: 'Yoselin', createdAt: serverTimestamp(),
    });
    setQBusy(false); setQDone(true);
    setTimeout(() => { setShowQuoteBuilder(false); setQDone(false); setQForm({ name: '', email: '', phone: '', address: '', date: '', time: '', service: 'Standard Clean', estimate: '', notes: '' }); }, 2000);
  };

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

  const newReqs = requests.filter(r => r.status === 'new');
  const confirmedReqs = requests.filter(r => r.status === 'confirmed');
  const doneReqs = requests.filter(r => r.status === 'done');
  const pipeline = requests.filter(r => r.status !== 'done').reduce((s, r) => s + (r.estimate || 0), 0);
  const displayReqs = adminTab === 'new' ? newReqs : adminTab === 'confirmed' ? confirmedReqs : doneReqs;

  const setQ = (k, v) => setQForm(f => ({ ...f, [k]: v }));

  return (
    <div className="ad-root">

      {/* NAV */}
      <nav className="ad-nav">
        <div className="ad-nav-left">
          <div className="ad-nav-brand">✨ Yoselins Cleaning</div>
          <span className="ad-badge">ADMIN</span>
        </div>
        <div className="nav-user">
          {user?.photoURL && <img src={user.photoURL} className="nav-avatar" alt="" />}
          <button className="signout-btn" onClick={() => { signOut(auth); router.push('/'); }}>Sign Out</button>
        </div>
      </nav>

      {/* STATS */}
      <div className="ad-stats">
        <div className="ad-stat">
          <div className="ad-stat-val ad-stat-yellow">{newReqs.length}</div>
          <div className="ad-stat-label">New Quotes</div>
        </div>
        <div className="ad-stat">
          <div className="ad-stat-val ad-stat-blue">{confirmedReqs.length}</div>
          <div className="ad-stat-label">Confirmed</div>
        </div>
        <div className="ad-stat">
          <div className="ad-stat-val ad-stat-green">{doneReqs.length}</div>
          <div className="ad-stat-label">Completed</div>
        </div>
        <div className="ad-stat">
          <div className="ad-stat-val ad-stat-pink">${pipeline}</div>
          <div className="ad-stat-label">Pipeline</div>
        </div>
        <button className="ad-new-quote-btn" onClick={() => setShowQuoteBuilder(true)}>
          + Create Quote
        </button>
      </div>

      {/* TABS */}
      <div className="ad-tabs-row">
        <div className="ad-tabs">
          <button className={`ad-tab ${adminTab === 'new' ? 'active' : ''}`} onClick={() => setAdminTab('new')}>
            New Quotes {newReqs.length > 0 && <span className="ad-tab-badge">{newReqs.length}</span>}
          </button>
          <button className={`ad-tab ${adminTab === 'confirmed' ? 'active' : ''}`} onClick={() => setAdminTab('confirmed')}>
            Confirmed {confirmedReqs.length > 0 && <span className="ad-tab-badge">{confirmedReqs.length}</span>}
          </button>
          <button className={`ad-tab ${adminTab === 'done' ? 'active' : ''}`} onClick={() => setAdminTab('done')}>
            Completed
          </button>
        </div>
      </div>

      {/* REQUESTS TABLE */}
      <div className="ad-body">
        {displayReqs.length === 0 ? (
          <div className="ad-empty">
            <div className="ad-empty-icon">{adminTab === 'new' ? '📭' : adminTab === 'confirmed' ? '📅' : '🏁'}</div>
            <p>No {adminTab === 'new' ? 'new quotes' : adminTab === 'confirmed' ? 'confirmed bookings' : 'completed jobs'} yet.</p>
          </div>
        ) : (
          <div className="ad-cards">
            {displayReqs.map(r => (
              <div className="ad-req-card" key={r.id}>
                <div className="arc-top">
                  <div>
                    <div className="arc-name">{r.name}</div>
                    <div className="arc-email">{r.email}</div>
                  </div>
                  <div className="arc-price">${r.estimate}</div>
                </div>
                <div className="arc-meta">
                  <span>📅 {r.date || 'No date'}</span>
                  <span>📍 {r.address?.split(',')[0] || '—'}</span>
                  <span>🔁 {r.frequency}</span>
                </div>
                <div className="arc-actions">
                  <button className="arc-btn arc-view" onClick={() => setSelected(r)}>View Details</button>
                  <button className="arc-btn arc-chat" onClick={() => setChatReq(r)}>💬 Message</button>
                  {r.status === 'new' && (
                    <button className="arc-btn arc-confirm" onClick={() => confirmReq(r)}>✅ Confirm</button>
                  )}
                  {r.status === 'confirmed' && (
                    <button className="arc-btn arc-done" onClick={() => markDone(r)}>🏁 Mark Done</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DETAIL MODAL */}
      {selected && (
        <div className="overlay show" onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="modal">
            <div className="modal-head">
              <h3>Quote Details</h3>
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
              ['Home Access', selected.access || '—'], ['Referral', selected.referral || '—'], ['Notes', selected.notes || '—'],
            ].map(([k, v]) => (
              <div key={k} className="detail-row"><span className="dk">{k}</span><span className="dv">{v}</span></div>
            ))}
            <div className="modal-actions">
              {selected.status === 'new' && (
                <button className="act-btn act-confirm" onClick={() => confirmReq(selected)}>✅ Confirm</button>
              )}
              {selected.status === 'confirmed' && (
                <button className="act-btn act-done" onClick={() => markDone(selected)}>🏁 Mark Done</button>
              )}
              <button className="act-btn act-chat" onClick={() => { setChatReq(selected); setSelected(null); }}>💬 Message</button>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL QUOTE BUILDER */}
      {showQuoteBuilder && (
        <div className="overlay show" onClick={e => e.target === e.currentTarget && setShowQuoteBuilder(false)}>
          <div className="modal" style={{maxWidth:'520px'}}>
            <div className="modal-head">
              <h3>✍️ Create a Quote</h3>
              <button className="modal-close" onClick={() => setShowQuoteBuilder(false)}>✕</button>
            </div>
            {qDone ? (
              <div style={{textAlign:'center', padding:'32px 0'}}>
                <div style={{fontSize:'2.5rem', marginBottom:'10px'}}>🎉</div>
                <p style={{fontWeight:'700'}}>Quote created successfully!</p>
              </div>
            ) : (
              <>
                <div className="row2">
                  <div className="fg"><label>Client Name *</label><input type="text" value={qForm.name} onChange={e => setQ('name', e.target.value)} placeholder="Full name" /></div>
                  <div className="fg"><label>Phone</label><input type="tel" value={qForm.phone} onChange={e => setQ('phone', e.target.value)} placeholder="(555) 000-0000" /></div>
                </div>
                <div className="fg"><label>Email</label><input type="email" value={qForm.email} onChange={e => setQ('email', e.target.value)} placeholder="client@email.com" /></div>
                <div className="fg"><label>Address</label><input type="text" value={qForm.address} onChange={e => setQ('address', e.target.value)} placeholder="Street, City, ZIP" /></div>
                <div className="row2">
                  <div className="fg"><label>Date</label><input type="text" value={qForm.date} onChange={e => setQ('date', e.target.value)} placeholder="e.g. March 10" /></div>
                  <div className="fg"><label>Time</label>
                    <select value={qForm.time} onChange={e => setQ('time', e.target.value)}>
                      <option value="">Select time</option>
                      <option>Morning (8am–12pm)</option>
                      <option>Afternoon (12pm–4pm)</option>
                      <option>Evening (4pm–7pm)</option>
                      <option>Flexible</option>
                    </select>
                  </div>
                </div>
                <div className="row2">
                  <div className="fg"><label>Service Type</label>
                    <select value={qForm.service} onChange={e => setQ('service', e.target.value)}>
                      <option>Standard Clean</option>
                      <option>Deep Clean</option>
                      <option>Move In / Out</option>
                      <option>Office Cleaning</option>
                      <option>Custom</option>
                    </select>
                  </div>
                  <div className="fg"><label>Quote Amount ($) *</label><input type="number" value={qForm.estimate} onChange={e => setQ('estimate', e.target.value)} placeholder="e.g. 180" /></div>
                </div>
                <div className="fg"><label>Notes</label><textarea value={qForm.notes} onChange={e => setQ('notes', e.target.value)} placeholder="Any special instructions or notes..." style={{minHeight:'70px',resize:'vertical'}} /></div>
                <div className="modal-actions">
                  <button className="act-btn act-confirm" onClick={submitManualQuote} disabled={qBusy}>
                    {qBusy ? 'Creating...' : '✅ Create Quote'}
                  </button>
                  <button className="act-btn act-chat" onClick={() => setShowQuoteBuilder(false)}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* CHAT */}
      {chatReq && (
        <Chat requestId={chatReq.id} currentUser={user} senderRole="admin" clientName={chatReq.name} onClose={() => setChatReq(null)} />
      )}
    </div>
  );
}

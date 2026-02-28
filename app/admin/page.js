'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, setDoc, getDoc, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { auth, db, ADMIN_EMAILS } from '../../lib/firebase';
import Chat from '../../components/Chat';
import BookingWizard from '../../components/BookingWizard';

// ── Default pricing (mirrors BookingWizard) ──────────────────────────────────
const BPRICES_DEF = { half: 15, small: 50, medium: 65, large: 80 };
const RPRICES_DEF = { bed_small: 25, bed_medium: 30, bed_large: 35, liv_medium: 15, liv_large: 35, office: 10, kit_small: 45, kit_medium: 55, kit_large: 70, laundry: 10, basement: 75 };
const EXTRAS_DEF  = { cabinets: 16, pantry: 20, oven: 16, fridge: 16, baseboard: 5, windows: 5 };
const DISC_DEF    = { firstTime: 10, senior: 10, biweekly: 15, weekly: 17.5, monthly: 12.5 };

const BATH_LABELS  = { half: 'Half Bath', small: 'Small Full Bath', medium: 'Medium Full Bath', large: 'Large/Master Bath' };
const ROOM_LABELS  = { bed_small: 'Small Bedroom', bed_medium: 'Medium Bedroom', bed_large: 'Large/Master Bedroom', liv_medium: 'Medium Living Room', liv_large: 'Large Living Room', office: 'Office/Study', kit_small: 'Small Kitchen', kit_medium: 'Medium Kitchen', kit_large: 'Large Kitchen', laundry: 'Laundry Room', basement: 'Basement' };
const EXTRA_LABELS = { cabinets: 'Inside Cabinets', pantry: 'Inside Pantry', oven: 'Inside Oven', fridge: 'Inside Fridge', baseboard: 'Baseboard Cleaning', windows: 'Window Trim (per window)' };
const DISC_LABELS  = { firstTime: 'First-Time (%)', senior: 'Senior (%)', biweekly: 'Bi-Weekly (%)', weekly: 'Weekly (%)', monthly: '2-3x/Month (%)' };

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser]         = useState(null);
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [chatReq, setChatReq]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState('requests');
  const [quoteSuccess, setQuoteSuccess] = useState(false);

  // Availability
  const [slots, setSlots]       = useState([]);
  const [newDate, setNewDate]   = useState('');
  const [newTime, setNewTime]   = useState('');
  const [addingSlot, setAddingSlot] = useState(false);

  // Pricing
  const [prices, setPrices]     = useState(null);
  const [savingPrices, setSavingPrices] = useState(false);
  const [pricesSaved, setPricesSaved]   = useState(false);

  // ── Auth ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u || !ADMIN_EMAILS.includes(u.email)) { router.push('/'); return; }
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  // ── Requests listener ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'requests'), orderBy('createdAt', 'desc')),
      snap => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [user]);

  // ── Availability listener ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'availability'), snap => {
      const s = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      s.sort((a, b) => ((a.date||'')+(a.time||'')).localeCompare((b.date||'')+(b.time||'')));
      setSlots(s);
    });
    return () => unsub();
  }, [user]);

  // ── Pricing loader ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'settings', 'pricing')).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        setPrices({
          bathrooms: { ...BPRICES_DEF, ...(d.bathrooms || {}) },
          rooms:     { ...RPRICES_DEF, ...(d.rooms     || {}) },
          extras:    { ...EXTRAS_DEF,  ...(d.extras    || {}) },
          discounts: { ...DISC_DEF,    ...(d.discounts || {}) },
        });
      } else {
        setPrices({ bathrooms: { ...BPRICES_DEF }, rooms: { ...RPRICES_DEF }, extras: { ...EXTRAS_DEF }, discounts: { ...DISC_DEF } });
      }
    }).catch(() => {
      setPrices({ bathrooms: { ...BPRICES_DEF }, rooms: { ...RPRICES_DEF }, extras: { ...EXTRAS_DEF }, discounts: { ...DISC_DEF } });
    });
  }, [user]);

  // ── Actions ───────────────────────────────────────────────────────────────
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

  const addSlot = async () => {
    if (!newDate.trim() || !newTime.trim()) return;
    setAddingSlot(true);
    await addDoc(collection(db, 'availability'), { date: newDate.trim(), time: newTime.trim() });
    setNewDate(''); setNewTime('');
    setAddingSlot(false);
  };

  const removeSlot = async (id) => {
    await deleteDoc(doc(db, 'availability', id));
  };

  const savePrices = async () => {
    setSavingPrices(true);
    await setDoc(doc(db, 'settings', 'pricing'), prices);
    setSavingPrices(false);
    setPricesSaved(true);
    setTimeout(() => setPricesSaved(false), 2500);
  };

  const setPrice = (section, key, val) => {
    const n = parseFloat(val);
    setPrices(p => ({ ...p, [section]: { ...p[section], [key]: isNaN(n) ? 0 : n } }));
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return <div className="spinner-page"><div className="spinner"></div></div>;

  const newCount = requests.filter(r => r.status === 'new').length;
  const avg      = requests.length ? Math.round(requests.reduce((s, r) => s + (r.estimate || 0), 0) / requests.length) : 0;
  const pipeline = requests.reduce((s, r) => s + (r.estimate || 0), 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="ad-root">

      {/* ── Nav ── */}
      <div className="ad-nav">
        <div className="ad-nav-left">
          <div className="ad-nav-brand">Yoselin's <span style={{ color: 'var(--pink)' }}>Cleaning</span></div>
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

      {/* ── Stats bar ── */}
      <div className="ad-stats">
        <div className="ad-stat"><div className="ad-stat-val ad-stat-blue">{requests.length}</div><div className="ad-stat-label">Total</div></div>
        <div className="ad-stat"><div className="ad-stat-val ad-stat-yellow">{newCount}</div><div className="ad-stat-label">New</div></div>
        <div className="ad-stat"><div className="ad-stat-val ad-stat-green">${avg}</div><div className="ad-stat-label">Avg Est.</div></div>
        <div className="ad-stat"><div className="ad-stat-val ad-stat-pink">${pipeline}</div><div className="ad-stat-label">Pipeline</div></div>
      </div>

      {/* ── Tabs ── */}
      <div className="ad-tabs-row">
        <div className="ad-tabs">
          <button className={`ad-tab ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>
            📋 Requests {newCount > 0 && <span className="ad-tab-badge">{newCount}</span>}
          </button>
          <button className={`ad-tab ${tab === 'availability' ? 'active' : ''}`} onClick={() => setTab('availability')}>
            📅 Availability
          </button>
          <button className={`ad-tab ${tab === 'pricing' ? 'active' : ''}`} onClick={() => setTab('pricing')}>
            💲 Pricing
          </button>
          <button className={`ad-tab ${tab === 'quote' ? 'active' : ''}`} onClick={() => { setTab('quote'); setQuoteSuccess(false); }}>
            ✏️ Create Quote
          </button>
        </div>
      </div>

      <div className="ad-body">

        {/* ════════════════ REQUESTS TAB ════════════════ */}
        {tab === 'requests' && (
          <div className="table-wrap">
            {requests.length === 0 ? (
              <div className="empty-state"><div style={{ fontSize: '2.4rem', marginBottom: '10px' }}>📭</div>No requests yet.</div>
            ) : (
              <table>
                <thead>
                  <tr><th>Submitted</th><th>Client</th><th>Email</th><th>Date</th><th>Estimate</th><th>Status</th><th></th></tr>
                </thead>
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
        )}

        {/* ════════════════ AVAILABILITY TAB ════════════════ */}
        {tab === 'availability' && (
          <div style={{ maxWidth: '600px' }}>

            {/* Add slot */}
            <div style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
              <div style={{ fontSize: '.75rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '14px' }}>Add Available Slot</div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Date  e.g. March 10, 2026"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  style={{ flex: '1', minWidth: '160px', padding: '10px 13px', background: '#111', border: '1.5px solid #2a2a2a', borderRadius: '10px', color: 'white', fontSize: '.87rem', outline: 'none' }}
                />
                <input
                  type="text"
                  placeholder="Time  e.g. 9:00 AM"
                  value={newTime}
                  onChange={e => setNewTime(e.target.value)}
                  style={{ flex: '1', minWidth: '130px', padding: '10px 13px', background: '#111', border: '1.5px solid #2a2a2a', borderRadius: '10px', color: 'white', fontSize: '.87rem', outline: 'none' }}
                />
                <button
                  onClick={addSlot}
                  disabled={addingSlot || !newDate.trim() || !newTime.trim()}
                  style={{ padding: '10px 20px', background: 'linear-gradient(135deg,var(--blue),var(--pink-deep))', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', fontSize: '.86rem', cursor: 'pointer', opacity: (addingSlot || !newDate.trim() || !newTime.trim()) ? .5 : 1 }}
                >
                  {addingSlot ? 'Adding…' : '+ Add'}
                </button>
              </div>
            </div>

            {/* Slot list */}
            <div style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '16px', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #2a2a2a', fontSize: '.75rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                Available Slots ({slots.length})
              </div>
              {slots.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280', fontSize: '.86rem' }}>No slots yet — add some above.</div>
              ) : (
                slots.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px', borderBottom: '1px solid #1e1e1e' }}>
                    <div>
                      <div style={{ fontWeight: '700', color: 'white', fontSize: '.9rem' }}>{s.date}</div>
                      <div style={{ fontSize: '.78rem', color: '#9ca3af', marginTop: '2px' }}>{s.time}</div>
                    </div>
                    <button
                      onClick={() => removeSlot(s.id)}
                      style={{ background: 'rgba(239,68,68,.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,.3)', borderRadius: '8px', padding: '6px 13px', fontSize: '.76rem', fontWeight: '700', cursor: 'pointer' }}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ════════════════ CREATE QUOTE TAB ════════════════ */}
        {tab === 'quote' && (
          <div>
            {quoteSuccess ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', background: '#181818', borderRadius: '18px', border: '1.5px solid #2a2a2a' }}>
                <div style={{ fontSize: '2.8rem', marginBottom: '12px' }}>✅</div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.4rem', fontWeight: '900', color: 'white', marginBottom: '8px' }}>Quote Created!</div>
                <div style={{ color: '#9ca3af', fontSize: '.88rem', marginBottom: '24px' }}>The request has been added to the Requests tab.</div>
                <button
                  onClick={() => { setQuoteSuccess(false); setTab('requests'); }}
                  style={{ padding: '12px 28px', background: 'linear-gradient(135deg,var(--blue),var(--pink-deep))', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '700', fontSize: '.9rem', cursor: 'pointer' }}
                >
                  View Requests
                </button>
                <button
                  onClick={() => setQuoteSuccess(false)}
                  style={{ marginLeft: '10px', padding: '12px 28px', background: '#222', color: '#d1d5db', border: '1.5px solid #333', borderRadius: '12px', fontWeight: '700', fontSize: '.9rem', cursor: 'pointer' }}
                >
                  Create Another
                </button>
              </div>
            ) : (
              <BookingWizard user={user} adminMode={true} onDone={() => setQuoteSuccess(true)} />
            )}
          </div>
        )}

        {/* ════════════════ PRICING TAB ════════════════ */}
        {tab === 'pricing' && prices && (
          <div style={{ maxWidth: '700px' }}>

            {/* Save button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px', gap: '10px', alignItems: 'center' }}>
              {pricesSaved && <span style={{ color: '#10b981', fontSize: '.84rem', fontWeight: '700' }}>✅ Saved!</span>}
              <button
                onClick={savePrices}
                disabled={savingPrices}
                style={{ padding: '10px 24px', background: 'linear-gradient(135deg,var(--blue),var(--pink-deep))', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', fontSize: '.88rem', cursor: 'pointer', opacity: savingPrices ? .6 : 1 }}
              >
                {savingPrices ? 'Saving…' : '💾 Save Prices'}
              </button>
            </div>

            {/* Bathrooms */}
            <PriceSection title="🚿 Bathrooms" labels={BATH_LABELS} section="bathrooms" prices={prices} setPrice={setPrice} />

            {/* Rooms */}
            <PriceSection title="🛏 Rooms" labels={ROOM_LABELS} section="rooms" prices={prices} setPrice={setPrice} />

            {/* Extras */}
            <PriceSection title="✨ Add-On Extras" labels={EXTRA_LABELS} section="extras" prices={prices} setPrice={setPrice} />

            {/* Discounts */}
            <PriceSection title="🏷️ Discounts" labels={DISC_LABELS} section="discounts" prices={prices} setPrice={setPrice} suffix="%" />

          </div>
        )}

      </div>

      {/* ── Detail Modal ── */}
      {selected && (
        <div className="overlay show" onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="modal">
            <div className="modal-head">
              <div>
                <h3>{selected.name}</h3>
                <span className={`badge badge-${selected.status}`} style={{ marginTop: 4, display: 'inline-block' }}>
                  {selected.status === 'new' ? '🆕 New' : selected.status === 'confirmed' ? '✅ Confirmed' : '🏁 Done'}
                </span>
              </div>
              <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
            </div>

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

      {/* ── Chat ── */}
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

// ── Reusable pricing section component ───────────────────────────────────────
function PriceSection({ title, labels, section, prices, setPrice, suffix = '$' }) {
  return (
    <div style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '16px', overflow: 'hidden', marginBottom: '16px' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #2a2a2a', fontSize: '.82rem', fontWeight: '800', color: 'white' }}>{title}</div>
      <div style={{ padding: '8px 0' }}>
        {Object.entries(labels).map(([key, label]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid #1a1a1a' }}>
            <span style={{ fontSize: '.86rem', color: '#d1d5db', fontWeight: '600' }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {suffix === '$' && <span style={{ color: '#6b7280', fontSize: '.85rem' }}>$</span>}
              <input
                type="number"
                value={prices[section]?.[key] ?? ''}
                onChange={e => setPrice(section, key, e.target.value)}
                style={{ width: '70px', padding: '7px 10px', background: '#111', border: '1.5px solid #2a2a2a', borderRadius: '8px', color: 'white', fontSize: '.88rem', textAlign: 'right', outline: 'none' }}
              />
              {suffix === '%' && <span style={{ color: '#6b7280', fontSize: '.85rem' }}>%</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

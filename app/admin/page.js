'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from '../../lib/firebase';
import Chat from '../../components/Chat';
import BookingWizard from '../../components/BookingWizard';

function generateTimes() {
  const times = [];
  for (let h = 6; h <= 20; h++) {
    const ampm = h < 12 ? 'am' : 'pm';
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    times.push(h12 + ':00' + ampm);
    if (h < 20) times.push(h12 + ':30' + ampm);
  }
  return times;
}
const ALL_TIMES = generateTimes();

function generateDays() {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 90; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
}
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatDateKey(date) {
  return MONTH_NAMES[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
}

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [requests, setRequests] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [selected, setSelected] = useState(null);
  const [chatReq, setChatReq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('requests');
  const [createDone, setCreateDone] = useState(false);

  const allDays = generateDays();
  const [calDate, setCalDate] = useState(allDays[0]);
  const [weekStart, setWeekStart] = useState(0);
  const [pendingTimes, setPendingTimes] = useState({});
  const [saving, setSaving] = useState(false);

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
      setAvailability(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubReqs(); unsubAvail(); };
  }, [user]);

  const dateKey = formatDateKey(calDate);
  const savedTimesForDate = availability.filter(s => s.date === dateKey).map(s => s.time);
  const pendingForDate = pendingTimes[dateKey] || [];

  const toggleTime = (time) => {
    setPendingTimes(prev => {
      const cur = prev[dateKey] || [];
      if (cur.includes(time)) {
        return { ...prev, [dateKey]: cur.filter(t => t !== time) };
      } else {
        return { ...prev, [dateKey]: [...cur, time] };
      }
    });
  };

  const saveSlots = async () => {
    setSaving(true);
    const toAdd = pendingForDate.filter(t => !savedTimesForDate.includes(t));
    const toRemove = savedTimesForDate.filter(t => !pendingForDate.includes(t));
    for (const t of toAdd) {
      await addDoc(collection(db, 'availability'), { date: dateKey, time: t, createdAt: serverTimestamp() });
    }
    for (const t of toRemove) {
      const slot = availability.find(s => s.date === dateKey && s.time === t);
      if (slot) await deleteDoc(doc(db, 'availability', slot.id));
    }
    setPendingTimes(prev => ({ ...prev, [dateKey]: undefined }));
    setSaving(false);
  };

  const selectCalDate = (d) => {
    const key = formatDateKey(d);
    setCalDate(d);
    setPendingTimes(prev => {
      if (prev[key] !== undefined) return prev;
      const saved = availability.filter(s => s.date === key).map(s => s.time);
      return { ...prev, [key]: saved };
    });
  };

  useEffect(() => {
    const key = formatDateKey(calDate);
    setPendingTimes(prev => {
      if (prev[key] !== undefined) return prev;
      const saved = availability.filter(s => s.date === key).map(s => s.time);
      return { ...prev, [key]: saved };
    });
  }, [availability]);

  const isTimeOn = (t) => {
    if (pendingTimes[dateKey] !== undefined) return pendingForDate.includes(t);
    return savedTimesForDate.includes(t);
  };

  const confirmReq = async (req) => {
    await updateDoc(doc(db, 'requests', req.id), { status: 'confirmed' });
    await addDoc(collection(db, 'chats', req.id, 'messages'), {
      text: 'Hi ' + req.name.split(' ')[0] + '! Your cleaning appointment has been confirmed for ' + req.date + '. Please reach out if you have any questions!',
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
  const visibleDays = allDays.slice(weekStart, weekStart + 10);
  const currentMonth = MONTH_NAMES[calDate.getMonth()] + ' ' + calDate.getFullYear();
  const datesWithSlots = new Set(availability.map(s => s.date));

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      <nav className="nav" style={{ background: '#0d0d0d', borderBottom: '1px solid #1f1f1f' }}>
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
      <div style={{ background: '#111', borderBottom: '1px solid #222', padding: '0 26px', display: 'flex' }}>
        {[['requests', 'Requests'], ['availability', 'Availability'], ['create', 'Create Quote']].map(([t, label]) => (
          <button key={t} onClick={() => { setTab(t); setCreateDone(false); }} style={{
            padding: '14px 20px', background: 'none', border: 'none',
            borderBottom: tab === t ? '3px solid #a855f7' : '3px solid transparent',
            fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.85rem',
            color: tab === t ? '#a855f7' : '#6b7280', cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '28px 16px 80px' }}>

        {/* REQUESTS TAB */}
        {tab === 'requests' && (
          <>
            <div className="stats-grid">
              {[['TOTAL', requests.length, ''], ['NEW', newCount, 'Awaiting response'], ['AVG ESTIMATE', '$' + avg, ''], ['PIPELINE', '$' + pipeline, '']].map(([label, val, sub]) => (
                <div key={label} className="stat-card" style={{ background: '#111', border: '1px solid #222' }}>
                  <div className="stat-label" style={{ color: '#9ca3af' }}>{label}</div>
                  <div className="stat-val" style={{ color: 'white' }}>{val}</div>
                  {sub && <div className="stat-sub" style={{ color: '#9ca3af' }}>{sub}</div>}
                </div>
              ))}
            </div>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.2rem', fontWeight: '700', marginBottom: '13px', color: 'white' }}>All Requests</div>
            <div style={{ background: '#111', borderRadius: '16px', border: '1px solid #222', overflow: 'hidden', overflowX: 'auto' }}>
              {requests.length === 0 ? (
                <div className="empty-state" style={{ color: '#9ca3af' }}>No requests yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Submitted', 'Client', 'Email', 'Date', 'Estimate', 'Status', ''].map(h => (
                        <th key={h} style={{ background: '#0d0d0d', color: '#9ca3af', padding: '12px 15px', textAlign: 'left', fontSize: '.75rem', fontWeight: '700' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #1f1f1f' }}>
                        <td style={{ padding: '12px 15px', fontSize: '.83rem', color: '#d1d5db' }}>{r.submittedAt}</td>
                        <td style={{ padding: '12px 15px', fontSize: '.83rem', color: 'white' }}>
                          <strong>{r.name}</strong>
                          {r.createdByAdmin && <span style={{ fontSize: '.65rem', color: '#60a5fa', marginLeft: '6px', fontWeight: '700', background: 'rgba(96,165,250,.15)', padding: '2px 6px', borderRadius: '4px' }}>ADMIN</span>}
                        </td>
                        <td style={{ padding: '12px 15px', fontSize: '.83rem', color: '#d1d5db' }}>{r.email}</td>
                        <td style={{ padding: '12px 15px', fontSize: '.83rem', color: '#d1d5db' }}>{r.date}</td>
                        <td style={{ padding: '12px 15px', fontSize: '.83rem' }}><strong style={{ color: '#60a5fa' }}>${r.estimate}</strong></td>
                        <td style={{ padding: '12px 15px' }}>
                          <span className={'badge badge-' + r.status}>
                            {r.status === 'new' ? 'New' : r.status === 'confirmed' ? 'Confirmed' : 'Done'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 15px' }}><button className="view-btn" onClick={() => setSelected(r)}>View</button></td>
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
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.3rem', fontWeight: '700', color: 'white' }}>Choose a Time</div>
              <div style={{ color: '#9ca3af', fontSize: '.85rem', fontWeight: '600' }}>{currentMonth}</div>
            </div>
            <p style={{ color: '#6b7280', fontSize: '.8rem', marginBottom: '22px' }}>
              Select a date then toggle available times. Customers will see these as options when booking.
            </p>

            <div style={{ background: '#111', borderRadius: '20px', border: '1px solid #1f1f1f', padding: '22px', marginBottom: '20px' }}>
              {/* Day strip */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <button onClick={() => setWeekStart(Math.max(0, weekStart - 10))} disabled={weekStart === 0}
                  style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid #333', background: weekStart === 0 ? 'transparent' : '#1f1f1f', color: weekStart === 0 ? '#333' : '#d1d5db', cursor: weekStart === 0 ? 'default' : 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {'<'}
                </button>
                <div style={{ display: 'flex', gap: '6px', flex: 1, overflowX: 'auto' }}>
                  {visibleDays.map((d, i) => {
                    const key = formatDateKey(d);
                    const isSelected = formatDateKey(d) === formatDateKey(calDate);
                    const hasSlots = datesWithSlots.has(key);
                    return (
                      <button key={i} onClick={() => selectCalDate(d)} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                        minWidth: '52px', padding: '10px 6px', borderRadius: '50px', border: 'none',
                        cursor: 'pointer', background: isSelected ? 'white' : 'transparent',
                        color: isSelected ? '#0d0d0d' : '#9ca3af',
                      }}>
                        <span style={{ fontSize: '.68rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.5px' }}>{DAY_NAMES[d.getDay()]}</span>
                        <span style={{ fontSize: '1.15rem', fontWeight: '800', lineHeight: 1 }}>{d.getDate()}</span>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: hasSlots ? '#a855f7' : 'transparent', display: 'block' }}></span>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => setWeekStart(Math.min(allDays.length - 10, weekStart + 10))}
                  style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid #333', background: '#1f1f1f', color: '#d1d5db', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {'>'}
                </button>
              </div>

              <div style={{ fontSize: '.72rem', color: '#6b7280', fontWeight: '700', letterSpacing: '.5px', textAlign: 'right', marginBottom: '14px', textTransform: 'uppercase' }}>{dateKey}</div>

              {/* Time grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(95px, 1fr))', gap: '8px' }}>
                {ALL_TIMES.map(t => {
                  const on = isTimeOn(t);
                  return (
                    <button key={t} onClick={() => toggleTime(t)} style={{
                      padding: '10px 8px', borderRadius: '10px',
                      border: on ? '2px solid transparent' : '1.5px solid #2a2a2a',
                      background: on ? 'white' : '#0d0d0d',
                      color: on ? '#0d0d0d' : '#9ca3af',
                      fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.8rem',
                      cursor: 'pointer',
                    }}>{t}</button>
                  );
                })}
              </div>

              <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ fontSize: '.78rem', color: '#6b7280' }}>
                  {pendingForDate.length > 0
                    ? <span style={{ color: '#a855f7' }}>{pendingForDate.length} time{pendingForDate.length !== 1 ? 's' : ''} selected</span>
                    : <span>No times selected for this date</span>}
                </div>
                <button onClick={saveSlots} disabled={saving} style={{ padding: '11px 28px', background: 'linear-gradient(135deg, #1a6fd4, #db2777)', color: 'white', border: 'none', borderRadius: '99px', fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.88rem', cursor: saving ? 'default' : 'pointer', opacity: saving ? .6 : 1 }}>
                  {saving ? 'Saving...' : 'Save Availability'}
                </button>
              </div>
            </div>

            {/* All saved slots */}
            {availability.length > 0 && (
              <div style={{ background: '#111', borderRadius: '16px', border: '1px solid #1f1f1f', overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #1f1f1f', color: '#9ca3af', fontSize: '.75rem', fontWeight: '700', letterSpacing: '.4px', textTransform: 'uppercase' }}>
                  All Saved Availability
                </div>
                <div style={{ padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {(() => {
                    const grouped = {};
                    availability.forEach(s => { if (!grouped[s.date]) grouped[s.date] = []; grouped[s.date].push(s); });
                    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([date, slots]) => (
                      <div key={date} style={{ background: '#0d0d0d', borderRadius: '12px', border: '1px solid #222', padding: '10px 14px', minWidth: '160px' }}>
                        <div style={{ fontSize: '.72rem', fontWeight: '700', color: '#a855f7', marginBottom: '7px', textTransform: 'uppercase', letterSpacing: '.3px' }}>{date}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                          {slots.map(s => (
                            <span key={s.id} style={{ background: '#1a1a1a', color: '#d1d5db', fontSize: '.72rem', fontWeight: '700', padding: '3px 9px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                              {s.time}
                              <button onClick={() => deleteDoc(doc(db, 'availability', s.id))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '.75rem', padding: '0', lineHeight: 1 }}>x</button>
                            </span>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CREATE QUOTE TAB */}
        {tab === 'create' && (
          <>
            {createDone ? (
              <div style={{ background: '#111', borderRadius: '18px', border: '1px solid #222', padding: '48px 24px', textAlign: 'center', maxWidth: '480px', margin: '0 auto' }}>
                <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.4rem', fontWeight: '700', marginBottom: '8px', color: 'white' }}>Quote Created!</h2>
                <p style={{ color: '#9ca3af', fontSize: '.87rem', marginBottom: '24px' }}>The new request has been added to your requests list.</p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button className="act-btn act-confirm" onClick={() => { setTab('requests'); setCreateDone(false); }} style={{ flex: 'none', padding: '12px 24px' }}>View Requests</button>
                  <button className="act-btn act-chat" onClick={() => setCreateDone(false)} style={{ flex: 'none', padding: '12px 24px' }}>Create Another</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.2rem', fontWeight: '700', marginBottom: '4px', color: 'white' }}>Create a Quote</div>
                <p style={{ fontSize: '.85rem', color: '#9ca3af', marginBottom: '20px' }}>Fill out the booking form on behalf of a client.</p>
                <div style={{ background: '#111', borderRadius: '18px', border: '1px solid #222', overflow: 'hidden' }}>
                  <div style={{ background: 'linear-gradient(135deg, #1a6fd4, #db2777)', padding: '18px 24px' }}>
                    <div style={{ fontFamily: 'Playfair Display, serif', color: 'white', fontSize: '1.1rem', fontWeight: '700' }}>New Client Quote</div>
                    <div style={{ color: 'rgba(255,255,255,.75)', fontSize: '.78rem', marginTop: '3px' }}>Same form your customers use</div>
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
              <button className="modal-close" onClick={() => setSelected(null)}>X</button>
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
              ['Other Requests', selected.otherRequests || '-'], ['Walk-Through', selected.walkthrough || 'No'],
              ['Frequency', selected.frequency], ['First-Time?', selected.firstTime === 'yes' ? 'Yes (10% disc)' : 'No'],
              ['Senior?', selected.senior === 'yes' ? 'Yes (10% disc)' : 'No'],
              ['Home Access', selected.access], ['Referral', selected.referral || '-'], ['Notes', selected.notes || '-'],
            ].map(([k, v]) => (
              <div key={k} className="detail-row"><span className="dk">{k}</span><span className="dv">{v}</span></div>
            ))}
            <div className="modal-actions">
              {selected.status === 'new' && (
                <button className="act-btn act-confirm" onClick={() => confirmReq(selected)}>Confirm Appointment</button>
              )}
              {selected.status === 'confirmed' && (
                <button className="act-btn act-done" onClick={() => markDone(selected)}>Mark Done</button>
              )}
              <button className="act-btn act-chat" onClick={() => { setChatReq(selected); setSelected(null); }}>Chat with Client</button>
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

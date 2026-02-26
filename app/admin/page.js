'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from '../../lib/firebase';
import { useUnreadCount } from '../../lib/useUnreadCount';
import { notifyBookingConfirmed } from '../../lib/notifications';
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
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatDateKey(date) {
  return MONTH_NAMES[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
}

// Try to parse a stored date string into a Date object for calendar matching
function parseDateString(str) {
  if (!str || str === 'N/A' || str === 'TBD') return null;
  try {
    const d = new Date(str);
    if (!isNaN(d)) return d;
  } catch (e) {}
  return null;
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Shows a red count bubble when admin has unread messages from a customer
function UnreadDot({ requestId }) {
  const count = useUnreadCount(requestId, 'admin');
  if (!count) return null;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      background:'#ef4444', color:'white', fontSize:'.6rem', fontWeight:'800',
      minWidth:'17px', height:'17px', borderRadius:'99px', padding:'0 4px', marginLeft:'6px',
    }}>{count > 9 ? '9+' : count}</span>
  );
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

  // Notes state
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  // Reschedule state
  const [reschedMode, setReschedMode] = useState(false);
  const [reschedDate, setReschedDate] = useState('');
  const [reschedTime, setReschedTime] = useState('');
  const [reschedSaving, setReschedSaving] = useState(false);

  // Client history
  const [historyClient, setHistoryClient] = useState(null);

  // Unread messages map: { [requestId]: count }
  const [unreadMap, setUnreadMap] = useState({});

  // Calendar state
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calSelected, setCalSelected] = useState(null);

  // Availability tab
  const allDays = generateDays();
  const [calDate, setCalDate] = useState(allDays[0]);
  const [weekStart, setWeekStart] = useState(0);
  const [pendingTimes, setPendingTimes] = useState({});
  const [saving, setSaving] = useState(false);
  // Availability mini-calendar nav
  const [availMonth, setAvailMonth] = useState(now.getMonth());
  const [availYear, setAvailYear] = useState(now.getFullYear());

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
    const unsubUnread = onSnapshot(collection(db, 'chatUnread'), snap => {
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data().unreadByAdmin || 0; });
      setUnreadMap(map);
    });
    return () => { unsubReqs(); unsubAvail(); unsubUnread(); };
  }, [user]);

  // Sync note text when selected changes
  useEffect(() => {
    if (selected) {
      setNoteText(selected.adminNotes || '');
      setNoteSaved(false);
      setReschedMode(false);
      setReschedDate(selected.date !== 'N/A' ? selected.date : '');
      setReschedTime(selected.time !== 'N/A' ? selected.time : '');
    }
  }, [selected?.id]);

  const saveNote = async () => {
    if (!selected) return;
    setNoteSaving(true);
    await updateDoc(doc(db, 'requests', selected.id), { adminNotes: noteText });
    setSelected(s => ({ ...s, adminNotes: noteText }));
    setNoteSaving(false);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  };

  const saveReschedule = async () => {
    if (!selected || !reschedDate.trim()) return;
    setReschedSaving(true);
    await updateDoc(doc(db, 'requests', selected.id), { date: reschedDate.trim(), time: reschedTime.trim() || selected.time });
    setSelected(s => ({ ...s, date: reschedDate.trim(), time: reschedTime.trim() || s.time }));
    setReschedMode(false);
    setReschedSaving(false);
  };

  const confirmReq = async (req) => {
    await updateDoc(doc(db, 'requests', req.id), { status: 'confirmed' });
    notifyBookingConfirmed({
      clientName: req.name,
      clientEmail: req.email,
      date: req.date,
      time: req.time,
      address: req.address,
      estimate: req.estimate,
    });
    await addDoc(collection(db, 'chats', req.id, 'messages'), {
      text: 'Hi ' + req.name.split(' ')[0] + '! Your cleaning appointment has been confirmed for ' + req.date + '. Please reach out if you have any questions!',
      sender: 'admin', senderName: 'Owner', createdAt: serverTimestamp(),
    });
    setSelected(r => r ? { ...r, status: 'confirmed' } : r);
  };

  const markDone = async (req) => {
    await updateDoc(doc(db, 'requests', req.id), { status: 'done' });
    setSelected(r => r ? { ...r, status: 'done' } : r);
  };

  const deleteRequest = async (req) => {
    if (!window.confirm('Permanently delete this request for ' + req.name + '? This cannot be undone.')) return;
    await deleteDoc(doc(db, 'requests', req.id));
    setSelected(null);
  };

  // Availability tab logic
  const dateKey = formatDateKey(calDate);
  const savedTimesForDate = availability.filter(s => s.date === dateKey).map(s => s.time);
  const pendingForDate = pendingTimes[dateKey] || [];

  const toggleTime = (time) => {
    setPendingTimes(prev => {
      const cur = prev[dateKey] || [];
      return cur.includes(time)
        ? { ...prev, [dateKey]: cur.filter(t => t !== time) }
        : { ...prev, [dateKey]: [...cur, time] };
    });
  };

  const saveSlots = async () => {
    setSaving(true);
    const toAdd = pendingForDate.filter(t => !savedTimesForDate.includes(t));
    const toRemove = savedTimesForDate.filter(t => !pendingForDate.includes(t));
    for (const t of toAdd) await addDoc(collection(db, 'availability'), { date: dateKey, time: t, createdAt: serverTimestamp() });
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
      return { ...prev, [key]: availability.filter(s => s.date === key).map(s => s.time) };
    });
  };

  useEffect(() => {
    const key = formatDateKey(calDate);
    setPendingTimes(prev => {
      if (prev[key] !== undefined) return prev;
      return { ...prev, [key]: availability.filter(s => s.date === key).map(s => s.time) };
    });
  }, [availability]);

  const isTimeOn = (t) => {
    if (pendingTimes[dateKey] !== undefined) return pendingForDate.includes(t);
    return savedTimesForDate.includes(t);
  };

  // Calendar view helpers
  const calFirstDay = new Date(calYear, calMonth, 1).getDay();
  const calDaysInMonth = getDaysInMonth(calYear, calMonth);

  const getRequestsForDay = (day) => {
    return requests.filter(r => {
      if (!r.date || r.date === 'N/A' || r.date === 'TBD') return false;
      const d = parseDateString(r.date);
      if (d) return d.getFullYear() === calYear && d.getMonth() === calMonth && d.getDate() === day;
      // Try string matching like "February 25, 2026"
      const target = MONTH_NAMES[calMonth] + ' ' + day + ', ' + calYear;
      return r.date.toLowerCase().includes(MONTH_NAMES[calMonth].toLowerCase()) && r.date.includes(String(day)) && r.date.includes(String(calYear));
    });
  };

  const statusColor = { new: '#f59e0b', confirmed: '#3b82f6', done: '#10b981' };

  if (loading) return <div className="spinner-page"><div className="spinner"></div></div>;

  const newCount = requests.filter(r => r.status === 'new').length;
  const avg = requests.length ? Math.round(requests.reduce((s, r) => s + (r.estimate || 0), 0) / requests.length) : 0;
  const pipeline = requests.filter(r => r.status !== 'done').reduce((s, r) => s + (r.estimate || 0), 0);

  const visibleDays = allDays.slice(weekStart, weekStart + 10);
  const currentMonth = MONTH_NAMES[calDate.getMonth()] + ' ' + calDate.getFullYear();
  const datesWithSlots = new Set(availability.map(s => s.date));

  const clientHistory = historyClient
    ? requests.filter(r => r.email === historyClient.email || r.userId === historyClient.userId)
    : [];

  const TABS = [
    { key: 'requests', label: 'Requests' },
    { key: 'calendar', label: 'Calendar' },
    { key: 'availability', label: 'Availability' },
    { key: 'create', label: 'Create Quote' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      {/* Nav */}
      <nav className="nav" style={{ background: '#0d0d0d', borderBottom: '1px solid #1f1f1f' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/logo.png" alt="Yoselin's Cleaning" style={{ height: '100px', objectFit: 'contain' }} />
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
        {TABS.map(({ key, label }) => (
          <button key={key} onClick={() => { setTab(key); setCreateDone(false); }} style={{
            padding: '14px 20px', background: 'none', border: 'none',
            borderBottom: tab === key ? '3px solid #a855f7' : '3px solid transparent',
            fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.85rem',
            color: tab === key ? '#a855f7' : '#6b7280', cursor: 'pointer',
          }}>
            {label}
            {key === 'requests' && newCount > 0 && (
              <span style={{ marginLeft: '7px', background: '#db2777', color: 'white', fontSize: '.65rem', fontWeight: '700', padding: '2px 7px', borderRadius: '99px' }}>{newCount}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '28px 16px 80px' }}>

        {/*  REQUESTS TAB  */}
        {tab === 'requests' && (
          <>
            <div className="stats-grid">
              {[
                ['TOTAL REQUESTS', requests.length, ''],
                ['NEW', newCount, 'Awaiting response'],
                ['AVG ESTIMATE', '$' + avg, ''],
                ['ACTIVE PIPELINE', '$' + pipeline, 'Excl. completed'],
              ].map(([label, val, sub]) => (
                <div key={label} className="stat-card" style={{ background: '#111', border: '1px solid #222' }}>
                  <div className="stat-label" style={{ color: '#9ca3af' }}>{label}</div>
                  <div className="stat-val" style={{ color: 'white' }}>{val}</div>
                  {sub && <div className="stat-sub" style={{ color: '#9ca3af' }}>{sub}</div>}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '13px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.2rem', fontWeight: '700', color: 'white' }}>All Requests</div>
              {requests.filter(r => r.status === 'done').length > 0 && (
                <button onClick={async () => {
                  const done = requests.filter(r => r.status === 'done');
                  if (!window.confirm('Delete all ' + done.length + ' completed requests? This cannot be undone.')) return;
                  for (const r of done) await deleteDoc(doc(db, 'requests', r.id));
                }} style={{ padding: '8px 18px', background: 'rgba(239,68,68,.1)', border: '1.5px solid rgba(239,68,68,.3)', color: '#ef4444', borderRadius: '10px', fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.78rem', cursor: 'pointer' }}>
                  Delete All Completed ({requests.filter(r => r.status === 'done').length})
                </button>
              )}
            </div>
            <div style={{ background: '#111', borderRadius: '16px', border: '1px solid #222', overflow: 'hidden', overflowX: 'auto' }}>
              {requests.length === 0 ? (
                <div className="empty-state" style={{ color: '#9ca3af' }}>No requests yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Submitted', 'Client', 'Email', 'Date', 'Estimate', 'Notes', 'Status', ''].map(h => (
                        <th key={h} style={{ background: '#0d0d0d', color: '#9ca3af', padding: '12px 15px', textAlign: 'left', fontSize: '.75rem', fontWeight: '700' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #1f1f1f' }}>
                        <td style={{ padding: '12px 15px', fontSize: '.83rem', color: '#d1d5db' }}>{r.submittedAt}</td>
                        <td style={{ padding: '12px 15px', fontSize: '.83rem', color: 'white' }}>
                          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                            <strong>{r.name}</strong>
                            {r.createdByAdmin && <span style={{ fontSize: '.65rem', color: '#60a5fa', fontWeight: '700', background: 'rgba(96,165,250,.15)', padding: '2px 6px', borderRadius: '4px' }}>ADMIN</span>}
                            {(unreadMap[r.id] || 0) > 0 && (
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block', flexShrink: 0 }} title={`${unreadMap[r.id]} unread message(s)`}></span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px 15px', fontSize: '.83rem', color: '#d1d5db' }}>{r.email}</td>
                        <td style={{ padding: '12px 15px', fontSize: '.83rem', color: '#d1d5db' }}>{r.date}</td>
                        <td style={{ padding: '12px 15px', fontSize: '.83rem' }}><strong style={{ color: '#60a5fa' }}>${r.estimate}</strong></td>
                        <td style={{ padding: '12px 15px', fontSize: '.83rem', color: r.adminNotes ? '#a855f7' : '#444', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.adminNotes ? r.adminNotes : '--'}
                        </td>
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

        {/*  CALENDAR TAB  */}
        {tab === 'calendar' && (
          <div>
            {/* Month header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.4rem', fontWeight: '900', color: 'white' }}>
                {MONTH_NAMES[calMonth]} {calYear}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '6px', fontSize: '.75rem', fontWeight: '700', marginRight: '8px' }}>
                  {[['new', '#f59e0b', 'New'], ['confirmed', '#3b82f6', 'Confirmed'], ['done', '#10b981', 'Done']].map(([s, c, l]) => (
                    <span key={s} style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#9ca3af' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: c, display: 'inline-block' }}></span>{l}
                    </span>
                  ))}
                </div>
                <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}
                  style={{ padding: '8px 14px', background: '#1f1f1f', border: '1px solid #333', color: '#d1d5db', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '.85rem' }}>
                  Prev
                </button>
                <button onClick={() => { setCalMonth(now.getMonth()); setCalYear(now.getFullYear()); }}
                  style={{ padding: '8px 14px', background: '#1f1f1f', border: '1px solid #333', color: '#d1d5db', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '.85rem' }}>
                  Today
                </button>
                <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}
                  style={{ padding: '8px 14px', background: '#1f1f1f', border: '1px solid #333', color: '#d1d5db', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '.85rem' }}>
                  Next
                </button>
              </div>
            </div>

            {/* Calendar grid */}
            <div style={{ background: '#111', borderRadius: '18px', border: '1px solid #222', overflow: 'hidden' }}>
              {/* Day headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #222' }}>
                {DAY_NAMES.map(d => (
                  <div key={d} style={{ padding: '10px 8px', textAlign: 'center', fontSize: '.72rem', fontWeight: '700', color: '#6b7280', letterSpacing: '.5px', textTransform: 'uppercase' }}>{d}</div>
                ))}
              </div>
              {/* Day cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {/* Empty cells before first day */}
                {Array.from({ length: calFirstDay }).map((_, i) => (
                  <div key={'empty-' + i} style={{ minHeight: '90px', borderRight: '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a', background: '#0d0d0d' }} />
                ))}
                {/* Day cells */}
                {Array.from({ length: calDaysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dayReqs = getRequestsForDay(day);
                  const isToday = now.getFullYear() === calYear && now.getMonth() === calMonth && now.getDate() === day;
                  const col = (calFirstDay + i) % 7;
                  const isLastCol = col === 6;
                  return (
                    <div key={day} style={{
                      minHeight: '90px', padding: '8px 6px',
                      borderRight: isLastCol ? 'none' : '1px solid #1a1a1a',
                      borderBottom: '1px solid #1a1a1a',
                      background: calSelected === day ? 'rgba(168,85,247,.06)' : 'transparent',
                      cursor: dayReqs.length > 0 ? 'pointer' : 'default',
                    }} onClick={() => setCalSelected(calSelected === day ? null : day)}>
                      <div style={{
                        width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: '5px', fontSize: '.82rem', fontWeight: '700',
                        background: isToday ? '#a855f7' : 'transparent',
                        color: isToday ? 'white' : '#9ca3af',
                      }}>{day}</div>
                      {dayReqs.slice(0, 3).map(r => (
                        <div key={r.id} onClick={(e) => { e.stopPropagation(); setSelected(r); }} style={{
                          background: statusColor[r.status] + '22',
                          border: '1px solid ' + statusColor[r.status] + '55',
                          color: statusColor[r.status],
                          fontSize: '.65rem', fontWeight: '700', padding: '2px 6px', borderRadius: '5px',
                          marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          cursor: 'pointer',
                        }}>
                          {r.name.split(' ')[0]} - ${r.estimate}
                        </div>
                      ))}
                      {dayReqs.length > 3 && (
                        <div style={{ fontSize: '.62rem', color: '#6b7280', fontWeight: '700', marginTop: '2px' }}>+{dayReqs.length - 3} more</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Expanded day panel */}
            {calSelected && getRequestsForDay(calSelected).length > 0 && (
              <div style={{ background: '#111', borderRadius: '16px', border: '1px solid #222', marginTop: '20px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: '700', color: 'white' }}>{MONTH_NAMES[calMonth]} {calSelected}</div>
                  <button onClick={() => setCalSelected(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.1rem' }}>x</button>
                </div>
                {getRequestsForDay(calSelected).map(r => (
                  <div key={r.id} style={{ padding: '14px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                      <div style={{ fontWeight: '700', color: 'white', fontSize: '.9rem', marginBottom: '2px' }}>{r.name}</div>
                      <div style={{ fontSize: '.78rem', color: '#9ca3af' }}>{r.time || 'No time set'} - {r.address}</div>
                      {r.adminNotes && <div style={{ fontSize: '.75rem', color: '#a855f7', marginTop: '3px' }}>Note: {r.adminNotes}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                      <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: '900', color: '#60a5fa', fontSize: '1.1rem' }}>${r.estimate}</span>
                      <span className={'badge badge-' + r.status}>{r.status === 'new' ? 'New' : r.status === 'confirmed' ? 'Confirmed' : 'Done'}</span>
                      <button className="view-btn" onClick={() => setSelected(r)}>View</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* No bookings this month */}
            {requests.filter(r => {
              const d = parseDateString(r.date);
              if (d) return d.getFullYear() === calYear && d.getMonth() === calMonth;
              return r.date && MONTH_NAMES[calMonth] && r.date.toLowerCase().includes(MONTH_NAMES[calMonth].toLowerCase()) && r.date.includes(String(calYear));
            }).length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px', color: '#6b7280', fontSize: '.85rem', marginTop: '16px' }}>
                No bookings with dates set for {MONTH_NAMES[calMonth]}.
              </div>
            )}
          </div>
        )}

        {/*  AVAILABILITY TAB  */}
        {tab === 'availability' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.3rem', fontWeight: '700', color: 'white' }}>Manage Availability</div>
              <div style={{ fontSize: '.78rem', color: '#6b7280' }}>Click a date, then toggle time slots</div>
            </div>
            <p style={{ color: '#6b7280', fontSize: '.8rem', marginBottom: '22px' }}>
              Purple dots = dates with slots already set. Select a date then pick times. Save when done.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(300px, 2fr)', gap: '18px', alignItems: 'start' }}>
              {/* Mini Calendar */}
              <div style={{ background: '#111', borderRadius: '20px', border: '1px solid #1f1f1f', padding: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <button onClick={() => { if (availMonth === 0) { setAvailMonth(11); setAvailYear(y => y-1); } else setAvailMonth(m => m-1); }} style={{ background: '#1f1f1f', border: '1px solid #333', color: '#d1d5db', borderRadius: '8px', padding: '5px 11px', cursor: 'pointer', fontWeight: '700', fontSize: '.9rem' }}>{'<'}</button>
                  <div style={{ fontWeight: '700', color: 'white', fontSize: '.88rem' }}>{MONTH_NAMES[availMonth]} {availYear}</div>
                  <button onClick={() => { if (availMonth === 11) { setAvailMonth(0); setAvailYear(y => y+1); } else setAvailMonth(m => m+1); }} style={{ background: '#1f1f1f', border: '1px solid #333', color: '#d1d5db', borderRadius: '8px', padding: '5px 11px', cursor: 'pointer', fontWeight: '700', fontSize: '.9rem' }}>{'>'}</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '6px' }}>
                  {DAY_NAMES.map(d => (<div key={d} style={{ textAlign: 'center', fontSize: '.6rem', fontWeight: '700', color: '#555', textTransform: 'uppercase', padding: '3px 0' }}>{d}</div>))}
                </div>
                {(() => {
                  const firstDay = new Date(availYear, availMonth, 1).getDay();
                  const daysInMonth = getDaysInMonth(availYear, availMonth);
                  const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
                      {Array.from({ length: firstDay }).map((_, i) => <div key={'e'+i} />)}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const d = new Date(availYear, availMonth, day);
                        const key = formatDateKey(d);
                        const hasSlots = datesWithSlots.has(key);
                        const isSelected = formatDateKey(d) === formatDateKey(calDate);
                        const isPast = d < todayMidnight;
                        return (
                          <button key={day} onClick={() => !isPast && selectCalDate(d)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', aspectRatio: '1', borderRadius: '8px', padding: '4px 2px', border: isSelected ? '2px solid #a855f7' : '1px solid transparent', background: isSelected ? 'rgba(168,85,247,.18)' : 'transparent', color: isPast ? '#333' : isSelected ? '#d8b4fe' : '#d1d5db', cursor: isPast ? 'default' : 'pointer', fontWeight: '700', fontSize: '.78rem', position: 'relative', transition: 'all .12s' }}>
                            {day}
                            {hasSlots && !isPast && <span style={{ position: 'absolute', bottom: '2px', width: '4px', height: '4px', borderRadius: '50%', background: '#a855f7', display: 'block' }} />}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
                <div style={{ marginTop: '12px', display: 'flex', gap: '14px', fontSize: '.68rem', color: '#555', flexWrap: 'wrap', borderTop: '1px solid #1f1f1f', paddingTop: '10px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#a855f7', display: 'inline-block' }}></span>Has slots</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#a855f7' }}><span style={{ width: '10px', height: '10px', borderRadius: '3px', border: '2px solid #a855f7', display: 'inline-block' }}></span>Selected</span>
                </div>
              </div>

              {/* Time Slots Panel */}
              <div style={{ background: '#111', borderRadius: '20px', border: '1px solid #1f1f1f', padding: '18px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontWeight: '700', color: 'white', fontSize: '.95rem' }}>{dateKey}</div>
                  <div style={{ fontSize: '.75rem', color: pendingForDate.length > 0 ? '#a855f7' : '#555', marginTop: '3px' }}>{pendingForDate.length > 0 ? pendingForDate.length + ' slot(s) selected' : 'No slots selected'}</div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginBottom: '16px' }}>
                  {[{label:'Morning',times:ALL_TIMES.slice(0,12)},{label:'Afternoon',times:ALL_TIMES.slice(12,22)},{label:'Evening',times:ALL_TIMES.slice(22)},{label:'All Day',times:ALL_TIMES},{label:'Clear',times:[]}].map(({ label, times }) => (
                    <button key={label} onClick={() => setPendingTimes(prev => ({ ...prev, [dateKey]: times }))} style={{ padding: '5px 12px', borderRadius: '99px', border: '1px solid #2a2a2a', background: '#1a1a1a', color: '#d1d5db', fontSize: '.74rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '340px', overflowY: 'auto', paddingRight: '4px' }}>
                  {[{label:'Morning',sub:'6am – 11:30am',times:ALL_TIMES.slice(0,12)},{label:'Afternoon',sub:'12pm – 4:30pm',times:ALL_TIMES.slice(12,22)},{label:'Evening',sub:'5pm – 8pm',times:ALL_TIMES.slice(22)}].map(({ label, sub, times }) => (
                    <div key={label}>
                      <div style={{ fontSize: '.68rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '7px' }}>{label} <span style={{ fontWeight: '500', textTransform: 'none', letterSpacing: 0, color: '#444' }}>{sub}</span></div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {times.map(t => {
                          const on = isTimeOn(t);
                          return (<button key={t} onClick={() => toggleTime(t)} style={{ padding: '6px 11px', borderRadius: '8px', border: on ? '2px solid #a855f7' : '1px solid #2a2a2a', background: on ? 'rgba(168,85,247,.22)' : '#0d0d0d', color: on ? '#d8b4fe' : '#6b7280', fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.75rem', cursor: 'pointer', transition: 'all .12s' }}>{t}</button>);
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={saveSlots} disabled={saving} style={{ marginTop: '18px', width: '100%', padding: '12px', background: 'linear-gradient(135deg, #1a6fd4, #db2777)', color: 'white', border: 'none', borderRadius: '12px', fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.9rem', cursor: saving ? 'default' : 'pointer', opacity: saving ? .6 : 1 }}>
                  {saving ? 'Saving...' : 'Save Availability for ' + MONTH_NAMES[calDate.getMonth()] + ' ' + calDate.getDate()}
                </button>
              </div>
            </div>

            {availability.length > 0 && (
              <div style={{ background: '#111', borderRadius: '16px', border: '1px solid #1f1f1f', overflow: 'hidden', marginTop: '20px' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #1f1f1f', color: '#9ca3af', fontSize: '.75rem', fontWeight: '700', letterSpacing: '.4px', textTransform: 'uppercase' }}>All Saved Slots</div>
                <div style={{ padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {(() => {
                    const grouped = {};
                    availability.forEach(s => { if (!grouped[s.date]) grouped[s.date] = []; grouped[s.date].push(s); });
                    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([date, slots]) => (
                      <div key={date} style={{ background: '#0d0d0d', borderRadius: '12px', border: '1px solid #222', padding: '10px 14px' }}>
                        <div style={{ fontSize: '.72rem', fontWeight: '700', color: '#a855f7', marginBottom: '7px', textTransform: 'uppercase' }}>{date}</div>
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

                {/*  CREATE QUOTE TAB  */}
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

      {/*  DETAIL MODAL  */}
      {selected && (
        <div className="overlay show" onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="modal" style={{ background: '#181818', border: '1px solid #2a2a2a', maxWidth: '600px' }}>
            <div className="modal-head">
              <h3 style={{ color: 'white' }}>Request Details</h3>
              <button className="modal-close" onClick={() => setSelected(null)}>X</button>
            </div>

            <div className="price-box">
              <div className="price-label">ESTIMATED TOTAL</div>
              <div className="price-val">${selected.estimate}</div>
            </div>

            {/* Request fields */}
            {[
              ['Submitted', selected.submittedAt], ['Client', selected.name], ['Building Type', selected.buildingType || 'Not specified'], ['Phone', selected.phone],
              ['Email', selected.email], ['Address', selected.address],
              ['Date', selected.date], ['Time', selected.time],
              ['Bathrooms', selected.bathrooms], ['Rooms', selected.rooms],
              ['Add-Ons', selected.addons], ['Pets', selected.pets === 'yes' ? 'Yes' : 'No'],
              ['Other Requests', selected.otherRequests || '-'],
              ['Frequency', selected.frequency],
              ['First-Time?', selected.firstTime === 'yes' ? 'Yes (10% disc)' : 'No'],
              ['Senior?', selected.senior === 'yes' ? 'Yes (10% disc)' : 'No'],
              ['Home Access', selected.access], ['Referral', selected.referral || '-'],
            ].map(([k, v]) => (
              <div key={k} className="detail-row"><span className="dk">{k}</span><span className="dv">{v}</span></div>
            ))}

            {/*  Reschedule section  */}
            <div style={{ margin: '16px 0', background: '#1f1f1f', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: reschedMode ? '12px' : '0' }}>
                <div style={{ fontWeight: '700', fontSize: '.82rem', color: '#d1d5db' }}>Reschedule</div>
                <button onClick={() => setReschedMode(m => !m)} style={{ background: reschedMode ? '#2a2a2a' : 'linear-gradient(135deg, #1a6fd4, #db2777)', color: 'white', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '.75rem', fontWeight: '700', cursor: 'pointer' }}>
                  {reschedMode ? 'Cancel' : 'Change Date / Time'}
                </button>
              </div>
              {reschedMode && (
                <div>
                  <div style={{ fontSize: '.75rem', color: '#9ca3af', marginBottom: '10px' }}>Current: {selected.date} at {selected.time}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '.75rem', fontWeight: '700', color: '#9ca3af', marginBottom: '5px' }}>New Date</label>
                      <input value={reschedDate} onChange={e => setReschedDate(e.target.value)} placeholder="e.g. March 5, 2026"
                        style={{ width: '100%', padding: '9px 12px', background: '#141414', border: '1.5px solid #333', borderRadius: '9px', color: 'white', fontSize: '.83rem', outline: 'none' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '.75rem', fontWeight: '700', color: '#9ca3af', marginBottom: '5px' }}>New Time</label>
                      <select value={reschedTime} onChange={e => setReschedTime(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', background: '#141414', border: '1.5px solid #333', borderRadius: '9px', color: 'white', fontSize: '.83rem', outline: 'none' }}>
                        <option value="">Select time</option>
                        {ALL_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <button onClick={saveReschedule} disabled={reschedSaving || !reschedDate.trim()}
                    style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #1a6fd4, #db2777)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', fontSize: '.83rem', cursor: 'pointer', opacity: reschedSaving ? .6 : 1 }}>
                    {reschedSaving ? 'Saving...' : 'Save New Date'}
                  </button>
                </div>
              )}
            </div>

            {/*  Admin Notes  */}
            <div style={{ margin: '16px 0', background: '#1f1f1f', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ fontWeight: '700', fontSize: '.82rem', color: '#d1d5db', marginBottom: '8px' }}>Admin Notes (private)</div>
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add private notes about this client or job..." rows={3}
                style={{ width: '100%', padding: '10px 12px', background: '#141414', border: '1.5px solid #333', borderRadius: '9px', color: 'white', fontSize: '.83rem', fontFamily: "'DM Sans', sans-serif", outline: 'none', resize: 'vertical' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                <button onClick={saveNote} disabled={noteSaving}
                  style={{ padding: '8px 20px', background: '#a855f7', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '.8rem', cursor: 'pointer', opacity: noteSaving ? .6 : 1 }}>
                  {noteSaving ? 'Saving...' : 'Save Note'}
                </button>
                {noteSaved && <span style={{ fontSize: '.78rem', color: '#10b981', fontWeight: '700' }}>Saved!</span>}
              </div>
            </div>

            {/* Actions */}
            <div className="modal-actions" style={{ flexWrap: 'wrap', gap: '8px' }}>
              {selected.status === 'new' && (
                <button className="act-btn act-confirm" onClick={() => confirmReq(selected)}>Confirm Appointment</button>
              )}
              {selected.status === 'confirmed' && (
                <button className="act-btn act-done" onClick={() => markDone(selected)}>Mark Done</button>
              )}
              <button className="act-btn act-chat" onClick={() => { setChatReq(selected); setSelected(null); }}>Chat with Client</button>
              {/* Email reminder */}
              <a href={'mailto:' + selected.email + '?subject=Your Cleaning Appointment Reminder&body=Hi ' + (selected.name ? selected.name.split(' ')[0] : '') + '%2C%0A%0AThis is a friendly reminder that your cleaning appointment is scheduled for ' + encodeURIComponent(selected.date) + ' at ' + encodeURIComponent(selected.time) + '.%0A%0AAddress%3A ' + encodeURIComponent(selected.address) + '%0A%0APlease reach out if you have any questions!%0A%0A- Yoselin%27s Cleaning Service'}
                style={{ flex: 1, padding: '11px', borderRadius: '12px', fontSize: '.84rem', fontWeight: '700', cursor: 'pointer', border: 'none', background: '#1e3a5f', color: '#60a5fa', textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '120px' }}>
                Send Reminder Email
              </a>
              {/* Client history */}
              <button onClick={() => { setHistoryClient(selected); setSelected(null); }} style={{ flex: 1, padding: '11px', borderRadius: '12px', fontSize: '.84rem', fontWeight: '700', cursor: 'pointer', border: 'none', background: '#1a1a1a', color: '#d1d5db', minWidth: '120px' }}>
                Client History
              </button>
            </div>
            {/* Delete - only for completed requests */}
            {selected.status === 'done' && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #2a2a2a' }}>
                <button onClick={() => deleteRequest(selected)} style={{ width: '100%', padding: '11px', background: 'rgba(239,68,68,.1)', border: '1.5px solid rgba(239,68,68,.3)', color: '#ef4444', borderRadius: '12px', fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.84rem', cursor: 'pointer', transition: 'all .2s' }}
                  onMouseEnter={e => { e.target.style.background = 'rgba(239,68,68,.2)'; e.target.style.borderColor = '#ef4444'; }}
                  onMouseLeave={e => { e.target.style.background = 'rgba(239,68,68,.1)'; e.target.style.borderColor = 'rgba(239,68,68,.3)'; }}>
                  Delete This Request
                </button>
                <div style={{ fontSize: '.72rem', color: '#6b7280', textAlign: 'center', marginTop: '6px' }}>Only available for completed requests. Cannot be undone.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/*  CLIENT HISTORY MODAL  */}
      {historyClient && (
        <div className="overlay show" onClick={e => e.target === e.currentTarget && setHistoryClient(null)}>
          <div className="modal" style={{ background: '#181818', border: '1px solid #2a2a2a', maxWidth: '620px' }}>
            <div className="modal-head">
              <div>
                <h3 style={{ color: 'white' }}>Client History</h3>
                <div style={{ fontSize: '.78rem', color: '#9ca3af', marginTop: '2px' }}>{historyClient.name} - {historyClient.email}</div>
              </div>
              <button className="modal-close" onClick={() => setHistoryClient(null)}>X</button>
            </div>

            {/* Summary stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '18px' }}>
              {[
                ['Total Bookings', clientHistory.length],
                ['Total Spent', '$' + clientHistory.filter(r => r.status === 'done').reduce((s, r) => s + (r.estimate || 0), 0)],
                ['Last Booking', clientHistory[0]?.submittedAt?.split(',')[0] || 'N/A'],
              ].map(([label, val]) => (
                <div key={label} style={{ background: '#0d0d0d', borderRadius: '10px', padding: '12px', textAlign: 'center', border: '1px solid #222' }}>
                  <div style={{ fontSize: '.65rem', color: '#6b7280', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px' }}>{label}</div>
                  <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.3rem', fontWeight: '900', color: 'white' }}>{val}</div>
                </div>
              ))}
            </div>

            {clientHistory.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: '30px' }}>No bookings found for this client.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '360px', overflowY: 'auto' }}>
                {clientHistory.map(r => (
                  <div key={r.id} style={{ background: '#1f1f1f', borderRadius: '12px', padding: '14px 16px', border: '1px solid #2a2a2a', cursor: 'pointer' }}
                    onClick={() => { setHistoryClient(null); setSelected(r); }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '.82rem', color: '#9ca3af', marginBottom: '3px' }}>{r.submittedAt}</div>
                        <div style={{ fontWeight: '700', color: 'white', marginBottom: '3px' }}>{r.date} at {r.time}</div>
                        <div style={{ fontSize: '.78rem', color: '#6b7280' }}>{r.rooms} - {r.bathrooms}</div>
                        {r.adminNotes && <div style={{ fontSize: '.75rem', color: '#a855f7', marginTop: '4px' }}>Note: {r.adminNotes}</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.3rem', fontWeight: '900', color: '#60a5fa' }}>${r.estimate}</div>
                        <span className={'badge badge-' + r.status} style={{ marginTop: '4px', display: 'inline-block' }}>
                          {r.status === 'new' ? 'New' : r.status === 'confirmed' ? 'Confirmed' : 'Done'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {chatReq && (
        <Chat requestId={chatReq.id} currentUser={user} senderRole="admin" clientName={chatReq.name} clientEmail={chatReq.email} onClose={() => setChatReq(null)} />
      )}
    </div>
  );
}







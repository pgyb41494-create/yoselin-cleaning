'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, orderBy, query, setDoc, writeBatch, getDoc } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from '../../lib/firebase';
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

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatDateKey(date) {
  return MONTH_NAMES[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
}

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

const DEFAULT_PRICING = {
  bathrooms: { half: 15, small: 50, medium: 65, large: 80 },
  rooms: { bed_small: 25, bed_medium: 30, bed_large: 35, liv_medium: 15, liv_large: 35, office: 10, kit_small: 45, kit_medium: 55, kit_large: 70, laundry: 10, basement: 75 },
  extras: { cabinets: 16, pantry: 20, oven: 16, fridge: 16, baseboard: 5, windows: 5 },
  discounts: { firstTime: 10, senior: 10, biweekly: 15, weekly: 17.5, monthly: 12.5 },
};

/* ── PriceInput/PriceCard MUST be defined OUTSIDE AdminPage.
   If defined inside, every keystroke re-renders the parent → React sees a new component
   type → unmounts the input → keyboard dismissed on mobile.
   Using defaultValue + onBlur (uncontrolled) means typing never triggers a parent re-render. ── */
function PriceInput({ section, fieldKey, label, unit, value, onCommit }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '.7rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', background: '#0d0d0d', border: '1.5px solid #2a2a2a', borderRadius: '10px', overflow: 'hidden' }}>
        <span style={{ padding: '0 10px', color: '#6b7280', fontWeight: '700', fontSize: '.85rem', borderRight: '1px solid #2a2a2a', height: '40px', display: 'flex', alignItems: 'center' }}>{unit || '$'}</span>
        <input
          key={section + fieldKey}
          type="number" min="0" step="0.5"
          defaultValue={value}
          onBlur={e => onCommit(section, fieldKey, e.target.value)}
          style={{ flex: 1, padding: '9px 12px', background: 'transparent', border: 'none', color: 'white', fontSize: '.9rem', fontWeight: '700', fontFamily: "'DM Sans',sans-serif", outline: 'none', width: '80px' }}
        />
      </div>
    </div>
  );
}

function PriceCard({ title, desc, children }) {
  return (
    <div style={{ background: '#111', borderRadius: '16px', border: '1px solid #222', overflow: 'hidden', marginBottom: '16px' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #1f1f1f', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
        <div style={{ fontFamily: 'Playfair Display, serif', fontWeight: '700', color: 'white', fontSize: '1rem' }}>{title}</div>
        {desc && <div style={{ fontSize: '.75rem', color: '#6b7280' }}>{desc}</div>}
      </div>
      <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: '14px' }}>{children}</div>
    </div>
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

  const [reqFilter, setReqFilter] = useState('all');
  const [reqSearch, setReqSearch] = useState('');

  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const [reschedMode, setReschedMode] = useState(false);
  const [reschedDate, setReschedDate] = useState('');
  const [reschedTime, setReschedTime] = useState('');
  const [reschedSaving, setReschedSaving] = useState(false);

  const [historyClient, setHistoryClient] = useState(null);
  const [unreadMap, setUnreadMap] = useState({});

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calSelected, setCalSelected] = useState(null);

  const [selectedDates, setSelectedDates] = useState(new Set());
  const [selectedTimes, setSelectedTimes] = useState([]);
  const [repeatWeeks, setRepeatWeeks] = useState(0);
  const [saving, setSaving] = useState(false);
  const [availMonth, setAvailMonth] = useState(now.getMonth());
  const [availYear, setAvailYear] = useState(now.getFullYear());

  const [editPrices, setEditPrices] = useState(DEFAULT_PRICING);
  const [priceSaving, setPriceSaving] = useState(false);
  const [priceSaved, setPriceSaved] = useState(false);

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
    getDoc(doc(db, 'settings', 'pricing')).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        setEditPrices({
          bathrooms: { ...DEFAULT_PRICING.bathrooms, ...d.bathrooms },
          rooms:     { ...DEFAULT_PRICING.rooms,     ...d.rooms     },
          extras:    { ...DEFAULT_PRICING.extras,    ...d.extras    },
          discounts: { ...DEFAULT_PRICING.discounts, ...d.discounts },
        });
      }
    });
    return () => { unsubReqs(); unsubAvail(); unsubUnread(); };
  }, [user]);

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
    notifyBookingConfirmed({ clientName: req.name, clientEmail: req.email, date: req.date, time: req.time, address: req.address, estimate: req.estimate });
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

  /* ── Availability: writeBatch for instant bulk writes/deletes ── */
  const applyAvailability = async () => {
    if (selectedDates.size === 0 || selectedTimes.length === 0) return;
    setSaving(true);

    const allDatesToApply = new Set(selectedDates);
    if (repeatWeeks > 0) {
      [...selectedDates].forEach(dk => {
        const base = new Date(dk);
        if (isNaN(base)) return;
        for (let w = 1; w <= repeatWeeks; w++) {
          const future = new Date(base);
          future.setDate(base.getDate() + w * 7);
          allDatesToApply.add(formatDateKey(future));
        }
      });
    }

    const batch = writeBatch(db);
    let opCount = 0;

    const flush = async (b) => { await b.commit(); return writeBatch(db); };

    let b = writeBatch(db);
    for (const dk of allDatesToApply) {
      const currentSlots = availability.filter(s => s.date === dk);
      const existingTimes = currentSlots.map(s => s.time);
      const toAdd    = selectedTimes.filter(t => !existingTimes.includes(t));
      const toRemove = currentSlots.filter(s => !selectedTimes.includes(s.time));

      for (const t of toAdd) {
        const ref = doc(collection(db, 'availability'));
        b.set(ref, { date: dk, time: t, createdAt: serverTimestamp() });
        if (++opCount >= 490) { await b.commit(); b = writeBatch(db); opCount = 0; }
      }
      for (const s of toRemove) {
        b.delete(doc(db, 'availability', s.id));
        if (++opCount >= 490) { await b.commit(); b = writeBatch(db); opCount = 0; }
      }
    }
    if (opCount > 0) await b.commit();

    setSelectedDates(new Set());
    setSelectedTimes([]);
    setRepeatWeeks(0);
    setSaving(false);
  };

  /* ── Clear all availability slots instantly via batch ── */
  const clearAllAvailability = async () => {
    if (!window.confirm('Delete ALL saved availability slots?')) return;
    const chunks = [];
    for (let i = 0; i < availability.length; i += 490) chunks.push(availability.slice(i, i + 490));
    for (const chunk of chunks) {
      const b = writeBatch(db);
      chunk.forEach(s => b.delete(doc(db, 'availability', s.id)));
      await b.commit();
    }
  };

  /* ── Clear one date's slots via batch ── */
  const clearDateSlots = async (slots) => {
    const b = writeBatch(db);
    slots.forEach(s => b.delete(doc(db, 'availability', s.id)));
    await b.commit();
  };

  const savePricing = async () => {
    setPriceSaving(true);
    await setDoc(doc(db, 'settings', 'pricing'), editPrices);
    setPriceSaving(false);
    setPriceSaved(true);
    setTimeout(() => setPriceSaved(false), 2500);
  };

  /* onBlur handler for PriceInput — called when admin leaves an input field */
  const setP = (section, key, val) =>
    setEditPrices(p => ({ ...p, [section]: { ...p[section], [key]: parseFloat(val) || 0 } }));

  /* Weekday quick-select for availability calendar */
  const selectWeekday = (dayOfWeek) => {
    const firstDay = new Date(availYear, availMonth, 1).getDay();
    const daysInMonth = getDaysInMonth(availYear, availMonth);
    const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
    const next = new Set(selectedDates);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(availYear, availMonth, d);
      if (date.getDay() === dayOfWeek && date >= todayMidnight) {
        const key = formatDateKey(date);
        if (next.has(key)) next.delete(key); else next.add(key);
      }
    }
    setSelectedDates(next);
  };

  const calFirstDay  = new Date(calYear, calMonth, 1).getDay();
  const calDaysInMonth = getDaysInMonth(calYear, calMonth);

  const getRequestsForDay = (day) => requests.filter(r => {
    if (!r.date || r.date === 'N/A' || r.date === 'TBD') return false;
    const d = parseDateString(r.date);
    if (d) return d.getFullYear() === calYear && d.getMonth() === calMonth && d.getDate() === day;
    return r.date.toLowerCase().includes(MONTH_NAMES[calMonth].toLowerCase()) && r.date.includes(String(day)) && r.date.includes(String(calYear));
  });

  const statusColor = { new: '#f59e0b', confirmed: '#3b82f6', done: '#10b981' };

  if (loading) return <div className="spinner-page"><div className="spinner"></div></div>;

  const newCount    = requests.filter(r => r.status === 'new').length;
  const datesWithSlots = new Set(availability.map(s => s.date));
  const clientHistory  = historyClient
    ? requests.filter(r => r.email === historyClient.email || r.userId === historyClient.userId)
    : [];

  const TABS = [
    { key: 'requests',     label: 'Requests'     },
    { key: 'calendar',     label: 'Calendar'     },
    { key: 'availability', label: 'Availability' },
    { key: 'create',       label: 'Create Quote' },
    { key: 'pricing',      label: '💰 Pricing'   },
  ];

  const btnStyle = (color) => ({
    padding: '5px 11px', borderRadius: '8px', border: 'none',
    background: color + '22', color,
    fontFamily: "'DM Sans',sans-serif", fontWeight: '700', fontSize: '.75rem', cursor: 'pointer',
  });

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
      <div style={{ background: '#111', borderBottom: '1px solid #222', padding: '0 26px', display: 'flex', overflowX: 'auto' }}>
        {TABS.map(({ key, label }) => (
          <button key={key} onClick={() => { setTab(key); setCreateDone(false); }} style={{
            padding: '14px 20px', background: 'none', border: 'none',
            borderBottom: tab === key ? '3px solid #a855f7' : '3px solid transparent',
            fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.85rem',
            color: tab === key ? '#a855f7' : '#6b7280', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            {label}
            {key === 'requests' && newCount > 0 && (
              <span style={{ marginLeft: '7px', background: '#db2777', color: 'white', fontSize: '.65rem', fontWeight: '700', padding: '2px 7px', borderRadius: '99px' }}>{newCount}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '28px 16px 80px' }}>

        {/* ── REQUESTS TAB ── */}
        {tab === 'requests' && (() => {
          const todayJobs = requests.filter(r => {
            if (r.status !== 'confirmed') return false;
            const d = parseDateString(r.date);
            return d && d.toDateString() === now.toDateString();
          });
          const filtered = requests.filter(r => {
            if (reqFilter !== 'all' && r.status !== reqFilter) return false;
            if (reqSearch.trim()) {
              const q = reqSearch.toLowerCase();
              return (r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q) || (r.phone || '').toLowerCase().includes(q);
            }
            return true;
          });
          return (
            <>
              <div className="stats-grid">
                {[
                  ['TOTAL',     requests.length, ''],
                  ['NEW',       newCount, 'Needs response'],
                  ['CONFIRMED', requests.filter(r => r.status === 'confirmed').length, 'Upcoming'],
                  ['REVENUE',   '$' + requests.filter(r => r.status === 'done').reduce((s, r) => s + (r.estimate || 0), 0), 'From completed'],
                ].map(([label, val, sub]) => (
                  <div key={label} className="stat-card" style={{ background: '#111', border: '1px solid #222' }}>
                    <div className="stat-label" style={{ color: '#9ca3af' }}>{label}</div>
                    <div className="stat-val"   style={{ color: 'white'   }}>{val}</div>
                    {sub && <div className="stat-sub" style={{ color: '#9ca3af' }}>{sub}</div>}
                  </div>
                ))}
              </div>

              {todayJobs.length > 0 && (
                <div style={{ background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.25)', borderRadius: '14px', padding: '14px 18px', marginBottom: '18px' }}>
                  <div style={{ fontSize: '.72rem', fontWeight: '700', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '10px' }}>Today's Jobs</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {todayJobs.map(r => (
                      <div key={r.id} onClick={() => setSelected(r)} style={{ background: '#0d0d0d', borderRadius: '10px', padding: '10px 14px', cursor: 'pointer', border: '1px solid #1f2f4f', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div>
                          <div style={{ fontWeight: '700', color: 'white', fontSize: '.85rem' }}>{r.name}</div>
                          <div style={{ fontSize: '.75rem', color: '#9ca3af', marginTop: '2px' }}>{r.time || 'No time'} · {r.address?.split(',')[0] || 'No address'}</div>
                        </div>
                        <strong style={{ color: '#60a5fa', fontFamily: 'Playfair Display, serif' }}>${r.estimate}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={reqSearch} onChange={e => setReqSearch(e.target.value)} placeholder="Search by name, email, phone…"
                  style={{ flex: 1, minWidth: '180px', padding: '9px 14px', background: '#111', border: '1px solid #2a2a2a', borderRadius: '10px', color: 'white', fontFamily: "'DM Sans',sans-serif", fontSize: '.84rem', outline: 'none' }} />
                <div style={{ display: 'flex', gap: '4px', background: '#111', border: '1px solid #222', borderRadius: '10px', padding: '4px' }}>
                  {[['all', 'All'], ['new', 'New'], ['confirmed', 'Confirmed'], ['done', 'Done']].map(([val, label]) => (
                    <button key={val} onClick={() => setReqFilter(val)} style={{
                      padding: '6px 13px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                      background: reqFilter === val ? '#a855f7' : 'transparent',
                      color: reqFilter === val ? 'white' : '#6b7280',
                      fontFamily: "'DM Sans',sans-serif", fontWeight: '700', fontSize: '.78rem',
                    }}>
                      {label}{val !== 'all' && <span style={{ marginLeft: '5px', opacity: .7 }}>({requests.filter(r => r.status === val).length})</span>}
                    </button>
                  ))}
                </div>
                {requests.filter(r => r.status === 'done').length > 0 && (
                  <button onClick={async () => {
                    const done = requests.filter(r => r.status === 'done');
                    if (!window.confirm('Delete all ' + done.length + ' completed requests?')) return;
                    for (const r of done) await deleteDoc(doc(db, 'requests', r.id));
                  }} style={{ padding: '9px 14px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', color: '#ef4444', borderRadius: '10px', fontFamily: "'DM Sans',sans-serif", fontWeight: '700', fontSize: '.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    Clear Done
                  </button>
                )}
              </div>

              <div style={{ background: '#111', borderRadius: '16px', border: '1px solid #222', overflow: 'hidden', overflowX: 'auto' }}>
                {filtered.length === 0 ? (
                  <div className="empty-state" style={{ color: '#9ca3af' }}>{requests.length === 0 ? 'No requests yet.' : 'No results.'}</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Client', 'Date', 'Estimate', 'Status', 'Actions'].map(h => (
                          <th key={h} style={{ background: '#0d0d0d', color: '#9ca3af', padding: '12px 15px', textAlign: 'left', fontSize: '.75rem', fontWeight: '700' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(r => (
                        <tr key={r.id} style={{ borderBottom: '1px solid #1f1f1f' }}>
                          <td style={{ padding: '12px 15px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '2px' }}>
                              <strong style={{ color: 'white', fontSize: '.88rem' }}>{r.name}</strong>
                              {r.createdByAdmin && <span style={{ fontSize: '.6rem', color: '#60a5fa', fontWeight: '700', background: 'rgba(96,165,250,.15)', padding: '1px 5px', borderRadius: '4px' }}>ADMIN</span>}
                              {(unreadMap[r.id] || 0) > 0 && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#ef4444', display: 'inline-block', flexShrink: 0 }} title="Unread messages" />}
                            </div>
                            <div style={{ fontSize: '.75rem', color: '#6b7280' }}>{r.phone || r.email}</div>
                            {r.adminNotes && <div style={{ fontSize: '.72rem', color: '#a855f7', marginTop: '2px' }}>Note: {r.adminNotes.slice(0, 45)}{r.adminNotes.length > 45 ? '…' : ''}</div>}
                          </td>
                          <td style={{ padding: '12px 15px', fontSize: '.83rem', color: '#d1d5db', whiteSpace: 'nowrap' }}>
                            {r.date || '—'}
                            {r.time && r.time !== 'N/A' && <div style={{ fontSize: '.72rem', color: '#6b7280' }}>{r.time}</div>}
                          </td>
                          <td style={{ padding: '12px 15px' }}>
                            <strong style={{ color: '#60a5fa', fontFamily: 'Playfair Display,serif', fontSize: '1rem' }}>${r.estimate}</strong>
                          </td>
                          <td style={{ padding: '12px 15px' }}>
                            <span className={'badge badge-' + r.status}>{r.status === 'new' ? 'New' : r.status === 'confirmed' ? 'Confirmed' : 'Done'}</span>
                          </td>
                          <td style={{ padding: '12px 15px' }}>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <button className="view-btn" onClick={() => setSelected(r)}>Details</button>
                              <button onClick={() => setChatReq(r)} style={{
                                ...btnStyle((unreadMap[r.id] || 0) > 0 ? '#ef4444' : '#60a5fa'),
                                background: (unreadMap[r.id] || 0) > 0 ? '#ef4444' : 'rgba(96,165,250,.15)',
                                color: (unreadMap[r.id] || 0) > 0 ? 'white' : '#60a5fa',
                              }}>Chat{(unreadMap[r.id] || 0) > 0 ? ` (${unreadMap[r.id]})` : ''}</button>
                              {r.status === 'new'       && <button onClick={() => confirmReq(r)} style={btnStyle('#10b981')}>Confirm</button>}
                              {r.status === 'confirmed' && <button onClick={() => markDone(r)}   style={btnStyle('#a855f7')}>Done</button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          );
        })()}

        {/* ── CALENDAR TAB ── */}
        {tab === 'calendar' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.4rem', fontWeight: '900', color: 'white' }}>{MONTH_NAMES[calMonth]} {calYear}</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y-1); } else setCalMonth(m => m-1); }} style={{ padding: '8px 14px', background: '#1f1f1f', border: '1px solid #333', color: '#d1d5db', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '.85rem' }}>Prev</button>
                <button onClick={() => { setCalMonth(now.getMonth()); setCalYear(now.getFullYear()); }} style={{ padding: '8px 14px', background: '#1f1f1f', border: '1px solid #333', color: '#d1d5db', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '.85rem' }}>Today</button>
                <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y+1); } else setCalMonth(m => m+1); }} style={{ padding: '8px 14px', background: '#1f1f1f', border: '1px solid #333', color: '#d1d5db', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '.85rem' }}>Next</button>
              </div>
            </div>
            <div style={{ background: '#111', borderRadius: '18px', border: '1px solid #222', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #222' }}>
                {DAY_NAMES.map(d => <div key={d} style={{ padding: '10px 8px', textAlign: 'center', fontSize: '.72rem', fontWeight: '700', color: '#6b7280', letterSpacing: '.5px', textTransform: 'uppercase' }}>{d}</div>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {Array.from({ length: calFirstDay }).map((_, i) => <div key={'e'+i} style={{ minHeight: '90px', borderRight: '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a', background: '#0d0d0d' }} />)}
                {Array.from({ length: calDaysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dayReqs = getRequestsForDay(day);
                  const isToday  = now.getFullYear() === calYear && now.getMonth() === calMonth && now.getDate() === day;
                  const isLastCol = (calFirstDay + i) % 7 === 6;
                  return (
                    <div key={day} style={{ minHeight: '90px', padding: '8px 6px', borderRight: isLastCol ? 'none' : '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a', background: calSelected === day ? 'rgba(168,85,247,.06)' : 'transparent', cursor: dayReqs.length > 0 ? 'pointer' : 'default' }}
                      onClick={() => setCalSelected(calSelected === day ? null : day)}>
                      <div style={{ width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '5px', fontSize: '.82rem', fontWeight: '700', background: isToday ? '#a855f7' : 'transparent', color: isToday ? 'white' : '#9ca3af' }}>{day}</div>
                      {dayReqs.slice(0, 3).map(r => (
                        <div key={r.id} onClick={e => { e.stopPropagation(); setSelected(r); }} style={{ background: statusColor[r.status]+'22', border: '1px solid '+statusColor[r.status]+'55', color: statusColor[r.status], fontSize: '.65rem', fontWeight: '700', padding: '2px 6px', borderRadius: '5px', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                          {r.name.split(' ')[0]} - ${r.estimate}
                        </div>
                      ))}
                      {dayReqs.length > 3 && <div style={{ fontSize: '.62rem', color: '#6b7280', fontWeight: '700', marginTop: '2px' }}>+{dayReqs.length-3} more</div>}
                    </div>
                  );
                })}
              </div>
            </div>
            {calSelected && getRequestsForDay(calSelected).length > 0 && (
              <div style={{ background: '#111', borderRadius: '16px', border: '1px solid #222', marginTop: '20px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: '700', color: 'white' }}>{MONTH_NAMES[calMonth]} {calSelected}</div>
                  <button onClick={() => setCalSelected(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
                </div>
                {getRequestsForDay(calSelected).map(r => (
                  <div key={r.id} style={{ padding: '14px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                      <div style={{ fontWeight: '700', color: 'white', fontSize: '.9rem', marginBottom: '2px' }}>{r.name}</div>
                      <div style={{ fontSize: '.78rem', color: '#9ca3af' }}>{r.time || 'No time set'} - {r.address}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                      <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: '900', color: '#60a5fa', fontSize: '1.1rem' }}>${r.estimate}</span>
                      <span className={'badge badge-'+r.status}>{r.status === 'new' ? 'New' : r.status === 'confirmed' ? 'Confirmed' : 'Done'}</span>
                      <button className="view-btn" onClick={() => setSelected(r)}>View</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── AVAILABILITY TAB ── */}
        {tab === 'availability' && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.3rem', fontWeight: '700', color: 'white' }}>Manage Availability</div>
              <div style={{ fontSize: '.8rem', color: '#6b7280', marginTop: '3px' }}>Pick dates, choose times, hit Apply — all done instantly</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(270px, 1fr) minmax(320px, 2fr)', gap: '18px', alignItems: 'start' }}>

              {/* ── Multi-select Calendar ── */}
              <div style={{ background: '#111', borderRadius: '20px', border: '1px solid #1f1f1f', padding: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <button onClick={() => { if (availMonth===0){setAvailMonth(11);setAvailYear(y=>y-1);}else setAvailMonth(m=>m-1); }} style={{ background: '#1f1f1f', border: '1px solid #333', color: '#d1d5db', borderRadius: '8px', padding: '5px 11px', cursor: 'pointer', fontWeight: '700' }}>{'<'}</button>
                  <div style={{ fontWeight: '700', color: 'white', fontSize: '.88rem' }}>{MONTH_NAMES[availMonth]} {availYear}</div>
                  <button onClick={() => { if (availMonth===11){setAvailMonth(0);setAvailYear(y=>y+1);}else setAvailMonth(m=>m+1); }} style={{ background: '#1f1f1f', border: '1px solid #333', color: '#d1d5db', borderRadius: '8px', padding: '5px 11px', cursor: 'pointer', fontWeight: '700' }}>{'>'}</button>
                </div>

                {/* Weekday quick-select row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '4px', gap: '2px' }}>
                  {DAY_NAMES.map((d, i) => (
                    <button key={d} onClick={() => selectWeekday(i)} style={{ textAlign: 'center', fontSize: '.58rem', fontWeight: '800', color: '#a855f7', textTransform: 'uppercase', padding: '4px 0', background: 'rgba(168,85,247,.1)', borderRadius: '4px', border: '1px solid rgba(168,85,247,.2)', cursor: 'pointer' }} title={'Select all ' + d + 's'}>{d}</button>
                  ))}
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
                        const d   = new Date(availYear, availMonth, day);
                        const key = formatDateKey(d);
                        const hasSlots  = datesWithSlots.has(key);
                        const isSelected = selectedDates.has(key);
                        const isPast    = d < todayMidnight;
                        const isToday   = now.getDate()===day && now.getMonth()===availMonth && now.getFullYear()===availYear;
                        return (
                          <button key={day} onClick={() => {
                            if (isPast) return;
                            setSelectedDates(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
                          }} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            aspectRatio: '1', borderRadius: '8px', padding: '2px',
                            border: isSelected ? '2px solid #a855f7' : isToday ? '1.5px solid #555' : '1px solid transparent',
                            background: isSelected ? 'rgba(168,85,247,.25)' : 'transparent',
                            color: isPast ? '#2a2a2a' : isSelected ? '#e9d5ff' : '#d1d5db',
                            cursor: isPast ? 'default' : 'pointer',
                            fontWeight: isSelected ? '800' : '600', fontSize: '.78rem',
                            position: 'relative', transition: 'all .1s',
                          }}>
                            {day}
                            {hasSlots && !isPast && <span style={{ position: 'absolute', bottom: '2px', width: '4px', height: '4px', borderRadius: '50%', background: isSelected ? '#e9d5ff' : '#a855f7' }} />}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #1f1f1f', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '.75rem', color: selectedDates.size > 0 ? '#a855f7' : '#555', fontWeight: '700' }}>
                    {selectedDates.size > 0 ? `${selectedDates.size} date${selectedDates.size!==1?'s':''} selected` : 'Tap dates to select'}
                  </span>
                  {selectedDates.size > 0 && (
                    <button onClick={() => setSelectedDates(new Set())} style={{ fontSize: '.7rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '700' }}>Clear</button>
                  )}
                </div>
              </div>

              {/* ── Time Setter ── */}
              <div style={{ background: '#111', borderRadius: '20px', border: '1px solid #1f1f1f', padding: '18px' }}>
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontWeight: '700', color: 'white', fontSize: '.95rem' }}>
                    {selectedDates.size === 0 ? 'Select dates on the left' : `Times for ${selectedDates.size} date${selectedDates.size!==1?'s':''}`}
                  </div>
                  <div style={{ fontSize: '.73rem', color: selectedTimes.length > 0 ? '#a855f7' : '#555', marginTop: '3px' }}>
                    {selectedTimes.length > 0 ? `${selectedTimes.length} slot${selectedTimes.length!==1?'s':''} selected` : 'No times selected yet'}
                  </div>
                </div>

                {/* Quick preset buttons */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
                  {[
                    { label: '🌅 Morning',   times: ALL_TIMES.slice(0, 12) },
                    { label: '☀️ Afternoon', times: ALL_TIMES.slice(12, 22) },
                    { label: '🌆 Evening',   times: ALL_TIMES.slice(22) },
                    { label: '📅 All Day',   times: ALL_TIMES },
                    { label: '✕ Clear',      times: [] },
                  ].map(({ label, times }) => (
                    <button key={label} onClick={() => setSelectedTimes(times)} style={{ padding: '7px 13px', borderRadius: '99px', border: '1px solid #2a2a2a', background: '#1a1a1a', color: '#d1d5db', fontSize: '.75rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '260px', overflowY: 'auto', paddingRight: '4px' }}>
                  {[
                    { label: 'Morning',   sub: '6am–11:30am', times: ALL_TIMES.slice(0, 12) },
                    { label: 'Afternoon', sub: '12pm–4:30pm', times: ALL_TIMES.slice(12, 22) },
                    { label: 'Evening',   sub: '5pm–8pm',     times: ALL_TIMES.slice(22) },
                  ].map(({ label, sub, times }) => (
                    <div key={label}>
                      <div style={{ fontSize: '.68rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '7px' }}>
                        {label} <span style={{ fontWeight: '500', textTransform: 'none', letterSpacing: 0, color: '#444' }}>{sub}</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {times.map(t => {
                          const on = selectedTimes.includes(t);
                          return (
                            <button key={t} onClick={() => setSelectedTimes(prev => prev.includes(t) ? prev.filter(x=>x!==t) : [...prev, t])} style={{
                              padding: '6px 11px', borderRadius: '8px',
                              border: on ? '2px solid #a855f7' : '1px solid #2a2a2a',
                              background: on ? 'rgba(168,85,247,.22)' : '#0d0d0d',
                              color: on ? '#d8b4fe' : '#6b7280',
                              fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.75rem',
                              cursor: 'pointer', transition: 'all .1s',
                            }}>{t}</button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Repeat weeks */}
                <div style={{ marginTop: '16px', padding: '12px 14px', background: '#0d0d0d', borderRadius: '12px', border: '1px solid #1f1f1f', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '.8rem', fontWeight: '700', color: '#9ca3af' }}>Repeat for next</div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    {[0,1,2,3,4].map(n => (
                      <button key={n} onClick={() => setRepeatWeeks(n)} style={{
                        width: '34px', height: '34px', borderRadius: '8px',
                        border: repeatWeeks===n ? '2px solid #a855f7' : '1px solid #2a2a2a',
                        background: repeatWeeks===n ? 'rgba(168,85,247,.2)' : '#1a1a1a',
                        color: repeatWeeks===n ? '#d8b4fe' : '#9ca3af',
                        fontWeight: '700', fontSize: '.82rem', cursor: 'pointer',
                      }}>{n===0?'–':n}</button>
                    ))}
                  </div>
                  <div style={{ fontSize: '.75rem', color: '#555' }}>
                    {repeatWeeks===0 ? 'weeks (no repeat)' : `week${repeatWeeks!==1?'s':''} — ${selectedDates.size*(1+repeatWeeks)} dates total`}
                  </div>
                </div>

                <button onClick={applyAvailability} disabled={saving || selectedDates.size===0 || selectedTimes.length===0} style={{
                  marginTop: '14px', width: '100%', padding: '14px',
                  background: selectedDates.size>0 && selectedTimes.length>0 ? 'linear-gradient(135deg,#a855f7,#db2777)' : '#1f1f1f',
                  color: selectedDates.size>0 && selectedTimes.length>0 ? 'white' : '#444',
                  border: 'none', borderRadius: '12px',
                  fontFamily: "'DM Sans',sans-serif", fontWeight: '700', fontSize: '.92rem',
                  cursor: selectedDates.size>0 && selectedTimes.length>0 ? 'pointer' : 'not-allowed',
                  opacity: saving ? .7 : 1, transition: 'all .2s',
                }}>
                  {saving
                    ? '⚡ Saving…'
                    : selectedDates.size===0 ? 'Select dates first'
                    : selectedTimes.length===0 ? 'Select times first'
                    : `⚡ Apply ${selectedTimes.length} slot${selectedTimes.length!==1?'s':''} to ${selectedDates.size*(1+repeatWeeks)} date${selectedDates.size*(1+repeatWeeks)!==1?'s':''}`}
                </button>
              </div>
            </div>

            {/* Saved slots */}
            {availability.length > 0 && (
              <div style={{ background: '#111', borderRadius: '16px', border: '1px solid #1f1f1f', overflow: 'hidden', marginTop: '20px' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #1f1f1f', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ color: '#9ca3af', fontSize: '.75rem', fontWeight: '700', letterSpacing: '.4px', textTransform: 'uppercase' }}>Saved Slots ({availability.length} total)</div>
                  <button onClick={clearAllAvailability} style={{ padding: '6px 14px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', color: '#ef4444', borderRadius: '8px', fontSize: '.75rem', fontWeight: '700', cursor: 'pointer' }}>🗑 Clear All</button>
                </div>
                <div style={{ padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {(() => {
                    const grouped = {};
                    availability.forEach(s => { if (!grouped[s.date]) grouped[s.date]=[]; grouped[s.date].push(s); });
                    return Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([date, slots]) => (
                      <div key={date} style={{ background: '#0d0d0d', borderRadius: '12px', border: '1px solid #222', padding: '10px 14px', minWidth: '160px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px', gap: '8px' }}>
                          <div style={{ fontSize: '.72rem', fontWeight: '700', color: '#a855f7', textTransform: 'uppercase' }}>{date}</div>
                          <button onClick={() => clearDateSlots(slots)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '.8rem', padding: '0', lineHeight: 1, fontWeight: '700' }}>🗑</button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {slots.map(s => (
                            <span key={s.id} style={{ background: '#1a1a1a', color: '#d1d5db', fontSize: '.7rem', fontWeight: '700', padding: '3px 8px', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {s.time}
                              <button onClick={() => deleteDoc(doc(db, 'availability', s.id))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '.72rem', padding: '0', lineHeight: 1 }}>×</button>
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

        {/* ── PRICING TAB ── */}
        {tab === 'pricing' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.3rem', fontWeight: '700', color: 'white' }}>Live Pricing Editor</div>
                <div style={{ fontSize: '.8rem', color: '#6b7280', marginTop: '3px' }}>Tap a field, type the new price, then tap outside — changes are saved when you press Save</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {priceSaved && <span style={{ fontSize: '.82rem', color: '#10b981', fontWeight: '700' }}>✅ Saved!</span>}
                <button onClick={savePricing} disabled={priceSaving} style={{ padding: '11px 24px', background: 'linear-gradient(135deg,#a855f7,#db2777)', color: 'white', border: 'none', borderRadius: '10px', fontFamily: "'DM Sans',sans-serif", fontWeight: '700', fontSize: '.88rem', cursor: 'pointer', opacity: priceSaving ? .6 : 1 }}>
                  {priceSaving ? 'Saving...' : 'Save All Prices'}
                </button>
              </div>
            </div>

            <PriceCard title="Bathrooms" desc="Price per bathroom">
              <PriceInput section="bathrooms" fieldKey="half"   label="Half Bath"         value={editPrices.bathrooms.half}   onCommit={setP} />
              <PriceInput section="bathrooms" fieldKey="small"  label="Small Full Bath"   value={editPrices.bathrooms.small}  onCommit={setP} />
              <PriceInput section="bathrooms" fieldKey="medium" label="Medium Full Bath"  value={editPrices.bathrooms.medium} onCommit={setP} />
              <PriceInput section="bathrooms" fieldKey="large"  label="Large/Master Bath" value={editPrices.bathrooms.large}  onCommit={setP} />
            </PriceCard>

            <PriceCard title="Bedrooms & Living Rooms" desc="Price per room">
              <PriceInput section="rooms" fieldKey="bed_small"  label="Small Bedroom"     value={editPrices.rooms.bed_small}  onCommit={setP} />
              <PriceInput section="rooms" fieldKey="bed_medium" label="Medium Bedroom"    value={editPrices.rooms.bed_medium} onCommit={setP} />
              <PriceInput section="rooms" fieldKey="bed_large"  label="Large/Master Bed"  value={editPrices.rooms.bed_large}  onCommit={setP} />
              <PriceInput section="rooms" fieldKey="liv_medium" label="Medium Living Rm"  value={editPrices.rooms.liv_medium} onCommit={setP} />
              <PriceInput section="rooms" fieldKey="liv_large"  label="Large Living Rm"   value={editPrices.rooms.liv_large}  onCommit={setP} />
              <PriceInput section="rooms" fieldKey="office"     label="Office/Study"      value={editPrices.rooms.office}     onCommit={setP} />
            </PriceCard>

            <PriceCard title="Kitchen & Utility" desc="Price per room">
              <PriceInput section="rooms" fieldKey="kit_small"  label="Small Kitchen"  value={editPrices.rooms.kit_small}  onCommit={setP} />
              <PriceInput section="rooms" fieldKey="kit_medium" label="Medium Kitchen" value={editPrices.rooms.kit_medium} onCommit={setP} />
              <PriceInput section="rooms" fieldKey="kit_large"  label="Large Kitchen"  value={editPrices.rooms.kit_large}  onCommit={setP} />
              <PriceInput section="rooms" fieldKey="laundry"    label="Laundry Room"   value={editPrices.rooms.laundry}    onCommit={setP} />
              <PriceInput section="rooms" fieldKey="basement"   label="Basement"       value={editPrices.rooms.basement}   onCommit={setP} />
            </PriceCard>

            <PriceCard title="Add-On Services" desc="Price per add-on">
              <PriceInput section="extras" fieldKey="cabinets"  label="Inside Cabinets"     value={editPrices.extras.cabinets}  onCommit={setP} />
              <PriceInput section="extras" fieldKey="pantry"    label="Inside Pantry"        value={editPrices.extras.pantry}    onCommit={setP} />
              <PriceInput section="extras" fieldKey="oven"      label="Inside Oven"          value={editPrices.extras.oven}      onCommit={setP} />
              <PriceInput section="extras" fieldKey="fridge"    label="Inside Fridge"        value={editPrices.extras.fridge}    onCommit={setP} />
              <PriceInput section="extras" fieldKey="baseboard" label="Baseboard Clean"      value={editPrices.extras.baseboard} onCommit={setP} />
              <PriceInput section="extras" fieldKey="windows"   label="Window Trim (each)"   value={editPrices.extras.windows}   onCommit={setP} />
            </PriceCard>

            <PriceCard title="Discounts" desc="Percentage off subtotal">
              <PriceInput section="discounts" fieldKey="firstTime" label="First-Time Client"  unit="%" value={editPrices.discounts.firstTime} onCommit={setP} />
              <PriceInput section="discounts" fieldKey="senior"    label="Senior Discount"    unit="%" value={editPrices.discounts.senior}    onCommit={setP} />
              <PriceInput section="discounts" fieldKey="biweekly"  label="Bi-Weekly Repeat"   unit="%" value={editPrices.discounts.biweekly}  onCommit={setP} />
              <PriceInput section="discounts" fieldKey="weekly"    label="Weekly Repeat"      unit="%" value={editPrices.discounts.weekly}    onCommit={setP} />
              <PriceInput section="discounts" fieldKey="monthly"   label="2-3x/Month Repeat"  unit="%" value={editPrices.discounts.monthly}   onCommit={setP} />
            </PriceCard>

            <div style={{ background: 'rgba(168,85,247,.06)', border: '1px solid rgba(168,85,247,.2)', borderRadius: '14px', padding: '14px 18px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>💡</span>
              <div style={{ fontSize: '.82rem', color: '#9ca3af', lineHeight: 1.6 }}>
                Tap any field and type the new value. The keyboard stays open while you move between fields. Hit <strong style={{ color: 'white' }}>Save All Prices</strong> when done — changes apply instantly on the booking form.
              </div>
            </div>
          </div>
        )}

        {/* ── CREATE QUOTE TAB ── */}
        {tab === 'create' && (
          <>
            {createDone ? (
              <div style={{ background: '#111', borderRadius: '18px', border: '1px solid #222', padding: '48px 24px', textAlign: 'center', maxWidth: '480px', margin: '0 auto' }}>
                <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.4rem', fontWeight: '700', marginBottom: '8px', color: 'white' }}>Quote Created!</h2>
                <p style={{ color: '#9ca3af', fontSize: '.87rem', marginBottom: '24px' }}>The new request has been added to your requests list.</p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button className="act-btn act-confirm" onClick={() => { setTab('requests'); setCreateDone(false); }} style={{ flex: 'none', padding: '12px 24px' }}>View Requests</button>
                  <button className="act-btn act-chat"    onClick={() => setCreateDone(false)}                       style={{ flex: 'none', padding: '12px 24px' }}>Create Another</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.2rem', fontWeight: '700', marginBottom: '4px', color: 'white' }}>Create a Quote</div>
                <p style={{ fontSize: '.85rem', color: '#9ca3af', marginBottom: '20px' }}>Fill out the booking form on behalf of a client.</p>
                <div style={{ background: '#111', borderRadius: '18px', border: '1px solid #222', overflow: 'hidden' }}>
                  <div style={{ background: 'linear-gradient(135deg,#1a6fd4,#db2777)', padding: '18px 24px' }}>
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

      {/* ── DETAIL MODAL ── */}
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

            {[
              ['Submitted', selected.submittedAt], ['Client', selected.name], ['Phone', selected.phone],
              ['Email', selected.email], ['Address', selected.address],
              ['Date', selected.date], ['Time', selected.time],
              ['Bathrooms', selected.bathrooms], ['Rooms', selected.rooms],
              ['Add-Ons', selected.addons], ['Pets', selected.pets === 'yes' ? 'Yes' : 'No'],
              ['Other Requests', selected.otherRequests || '-'],
              ['Frequency', selected.frequency],
              ['First-Time?', selected.firstTime === 'yes' ? 'Yes (disc applied)' : 'No'],
              ['Senior?', selected.senior === 'yes' ? 'Yes (disc applied)' : 'No'],
              ['Home Access', selected.access], ['Referral', selected.referral || '-'],
            ].map(([k, v]) => (
              <div key={k} className="detail-row"><span className="dk">{k}</span><span className="dv">{v}</span></div>
            ))}

            {selected.rescheduleRequested && (
              <div style={{ margin: '0 0 12px', background: 'rgba(245,158,11,.1)', border: '1.5px solid rgba(245,158,11,.3)', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.3rem' }}>!</span>
                <div>
                  <div style={{ fontWeight: '700', color: '#f59e0b', fontSize: '.85rem' }}>Client Requested a Reschedule</div>
                  {selected.reschedulePreferredDates && <div style={{ fontSize: '.78rem', color: '#d1d5db', marginTop: '2px' }}>Preferred: {selected.reschedulePreferredDates}</div>}
                  {selected.rescheduleReason && <div style={{ fontSize: '.75rem', color: '#9ca3af', marginTop: '1px' }}>Reason: {selected.rescheduleReason}</div>}
                </div>
              </div>
            )}

            <div style={{ margin: '16px 0', background: '#1f1f1f', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: reschedMode ? '12px' : '0' }}>
                <div style={{ fontWeight: '700', fontSize: '.82rem', color: '#d1d5db' }}>Reschedule</div>
                <button onClick={() => setReschedMode(m => !m)} style={{ background: reschedMode ? '#2a2a2a' : 'linear-gradient(135deg,#1a6fd4,#db2777)', color: 'white', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '.75rem', fontWeight: '700', cursor: 'pointer' }}>
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
                    style={{ padding: '10px 22px', background: 'linear-gradient(135deg,#1a6fd4,#db2777)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', fontSize: '.83rem', cursor: 'pointer', opacity: reschedSaving ? .6 : 1 }}>
                    {reschedSaving ? 'Saving…' : 'Save New Date'}
                  </button>
                </div>
              )}
            </div>

            <div style={{ margin: '16px 0', background: '#1f1f1f', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ fontWeight: '700', fontSize: '.82rem', color: '#d1d5db', marginBottom: '8px' }}>Admin Notes (private)</div>
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add private notes about this client or job…" rows={3}
                style={{ width: '100%', padding: '10px 12px', background: '#141414', border: '1.5px solid #333', borderRadius: '9px', color: 'white', fontSize: '.83rem', fontFamily: "'DM Sans',sans-serif", outline: 'none', resize: 'vertical' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                <button onClick={saveNote} disabled={noteSaving}
                  style={{ padding: '8px 20px', background: '#a855f7', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '.8rem', cursor: 'pointer', opacity: noteSaving ? .6 : 1 }}>
                  {noteSaving ? 'Saving…' : 'Save Note'}
                </button>
                {noteSaved && <span style={{ fontSize: '.78rem', color: '#10b981', fontWeight: '700' }}>Saved!</span>}
              </div>
            </div>

            <div className="modal-actions" style={{ flexWrap: 'wrap', gap: '8px' }}>
              {selected.status === 'new'       && <button className="act-btn act-confirm" onClick={() => confirmReq(selected)}>Confirm Appointment</button>}
              {selected.status === 'confirmed' && <button className="act-btn act-done"    onClick={() => markDone(selected)}>Mark Done</button>}
              <button className="act-btn act-chat" onClick={() => { setChatReq(selected); setSelected(null); }}>Chat with Client</button>
              <a href={'mailto:' + selected.email + '?subject=Your Cleaning Appointment Reminder&body=Hi ' + (selected.name ? selected.name.split(' ')[0] : '') + '%2C%0A%0AThis is a friendly reminder that your cleaning appointment is scheduled for ' + encodeURIComponent(selected.date) + ' at ' + encodeURIComponent(selected.time) + '.%0A%0AAddress%3A ' + encodeURIComponent(selected.address) + '%0A%0APlease reach out if you have any questions!%0A%0A- Yoselin%27s Cleaning Service'}
                style={{ flex: 1, padding: '11px', borderRadius: '12px', fontSize: '.84rem', fontWeight: '700', cursor: 'pointer', border: 'none', background: '#1e3a5f', color: '#60a5fa', textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '120px' }}>
                Send Reminder Email
              </a>
              <button onClick={() => { setHistoryClient(selected); setSelected(null); }} style={{ flex: 1, padding: '11px', borderRadius: '12px', fontSize: '.84rem', fontWeight: '700', cursor: 'pointer', border: 'none', background: '#1a1a1a', color: '#d1d5db', minWidth: '120px' }}>
                Client History
              </button>
            </div>

            {selected.status === 'done' && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #2a2a2a' }}>
                <button onClick={() => deleteRequest(selected)} style={{ width: '100%', padding: '11px', background: 'rgba(239,68,68,.1)', border: '1.5px solid rgba(239,68,68,.3)', color: '#ef4444', borderRadius: '12px', fontFamily: "'DM Sans',sans-serif", fontWeight: '700', fontSize: '.84rem', cursor: 'pointer' }}>
                  Delete This Request
                </button>
                <div style={{ fontSize: '.72rem', color: '#6b7280', textAlign: 'center', marginTop: '6px' }}>Only available for completed requests. Cannot be undone.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CLIENT HISTORY MODAL ── */}
      {historyClient && (
        <div className="overlay show" onClick={e => e.target === e.currentTarget && setHistoryClient(null)}>
          <div className="modal" style={{ background: '#181818', border: '1px solid #2a2a2a', maxWidth: '620px' }}>
            <div className="modal-head">
              <div>
                <h3 style={{ color: 'white' }}>Client History</h3>
                <div style={{ fontSize: '.78rem', color: '#9ca3af', marginTop: '2px' }}>{historyClient.name} — {historyClient.email}</div>
              </div>
              <button className="modal-close" onClick={() => setHistoryClient(null)}>X</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '18px' }}>
              {[
                ['Total Bookings', clientHistory.length],
                ['Total Spent',   '$' + clientHistory.filter(r => r.status==='done').reduce((s,r) => s+(r.estimate||0), 0)],
                ['Last Booking',  clientHistory[0]?.submittedAt?.split(',')[0] || 'N/A'],
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
                        <div style={{ fontSize: '.78rem', color: '#6b7280' }}>{r.rooms} — {r.bathrooms}</div>
                        {r.adminNotes && <div style={{ fontSize: '.75rem', color: '#a855f7', marginTop: '4px' }}>Note: {r.adminNotes}</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.3rem', fontWeight: '900', color: '#60a5fa' }}>${r.estimate}</div>
                        <span className={'badge badge-'+r.status} style={{ marginTop: '4px', display: 'inline-block' }}>
                          {r.status==='new' ? 'New' : r.status==='confirmed' ? 'Confirmed' : 'Done'}
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

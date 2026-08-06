'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential, GoogleAuthProvider, reauthenticateWithPopup, linkWithCredential } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, getDocs, serverTimestamp, doc, updateDoc, setDoc } from 'firebase/firestore';
import { auth, db, storage, ADMIN_EMAILS } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Chat from '../../components/Chat';
import VerifyGate from '../../components/VerifyGate';
import { isAdminEmail, needsEmailVerification, hasPasswordProvider, hasGoogleProvider, isStrongPassword, MIN_PASSWORD_LENGTH, mapAuthError } from '../../lib/authHelpers';
import PortalShell from '../../components/PortalShell';
import { useUnreadCount } from '../../lib/useUnreadCount';


const MONTH_NAMES_DASH = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES_DASH = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function parseDateDash(str) {
  if (!str || str === 'N/A' || str === 'TBD' || str === 'Flexible') return null;
  try { const d = new Date(str); if (!isNaN(d)) return d; } catch(e) {}
  return null;
}

function getLoyaltyTier(count) {
  if (count >= 8) return { label: 'VIP Client',       mark: 'VIP', color: '#db2777', bg: 'rgba(236,72,153,.12)', next: null,        nextAt: null };
  if (count >= 5) return { label: 'Gold Client',      mark: '★',   color: '#d97706', bg: 'rgba(245,158,11,.12)', next: 'VIP',       nextAt: 8 };
  if (count >= 3) return { label: 'Regular Client',   mark: '●',   color: '#71717a', bg: 'rgba(113,113,122,.12)',next: 'Gold',      nextAt: 5 };
  if (count >= 1) return { label: 'Returning Client', mark: '◆',   color: '#be185d', bg: 'rgba(236,72,153,.1)',  next: 'Regular',   nextAt: 3 };
  return                  { label: 'New Client',       mark: '○',   color: 'var(--pink-deep)', bg: 'rgba(236,72,153,.08)', next: 'Returning', nextAt: 1 };
}

function getCountdown(dateStr) {
  if (!dateStr || dateStr === 'N/A' || dateStr === 'TBD' || dateStr === 'Flexible') return null;
  let appt = new Date(dateStr);
  if (isNaN(appt)) {
    const stripped = dateStr.replace(/^[A-Za-z]+,\s*/, '');
    appt = new Date(stripped + ' ' + new Date().getFullYear());
  }
  if (isNaN(appt)) return null;
  const now = new Date();
  const diff = Math.round((new Date(appt).setHours(0,0,0,0) - new Date(now).setHours(0,0,0,0)) / 86400000);
  if (diff < 0)   return null;
  if (diff === 0) return { days: 0, urgent: true  };
  if (diff === 1) return { days: 1, urgent: true  };
  return          { days: diff,    urgent: false };
}

function hStatusColor(s) {
  if (s === 'confirmed') return '#10b981';
  if (s === 'done')      return 'var(--blue)';
  if (s === 'cancelled') return '#ef4444';
  return '#f59e0b';
}
function hStatusIcon(s) {
  if (s === 'confirmed') return '\u2705';
  if (s === 'done')      return '\u2728';
  if (s === 'cancelled') return '\u274C';
  return '\u23F3';
}

function HistoryTab({ requests }) {
  const [expanded, setExpanded] = useState({});
  const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const doneCount  = requests.filter(r => r.status === 'done').length;
  const totalSpent = requests.filter(r => r.status === 'done').reduce((acc, r) => acc + Number(r.estimate || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: '700', color: 'var(--text)', marginBottom: '4px' }}>
          📋 Booking History
        </div>
        <div style={{ fontSize: '.82rem', color: '#6b7280' }}>{requests.length} bookings total</div>
      </div>

      <div className="history-stats">
        {[
          { label: 'Total',     val: String(requests.length), color: 'var(--blue)' },
          { label: 'Completed', val: String(doneCount),       color: '#10b981' },
          { label: 'Spent',     val: '$' + totalSpent,        color: '#f472b6' },
        ].map(item => (
          <div key={item.label} className="history-stat">
            <div className="history-stat__val" style={{ color: item.color }}>{item.val}</div>
            <div className="history-stat__label">{item.label}</div>
          </div>
        ))}
      </div>

      {requests.map((req) => {
        const isOpen = expanded[req.id];
        const sc = hStatusColor(req.status);
        const sl = req.status === 'confirmed' ? 'Confirmed' : req.status === 'done' ? 'Completed' : req.status === 'cancelled' ? 'Cancelled' : 'Pending';
        const si = hStatusIcon(req.status);
        const createdDate = req.createdAt?.seconds
          ? new Date(req.createdAt.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : req.date || 'N/A';

        return (
          <div key={req.id} className="receipt-card">
            <div className="receipt-header">
              <div>
                <div className="receipt-id">Booking #{req.id.slice(-6).toUpperCase()}</div>
                <div className="receipt-date-label">Submitted {createdDate}</div>
              </div>
              <span style={{ fontSize: '.75rem', fontWeight: '700', color: sc, background: sc + '18', border: '1px solid ' + sc + '44', borderRadius: '99px', padding: '3px 10px', whiteSpace: 'nowrap' }}>
                {si} {sl}
              </span>
            </div>

            {!isOpen && (
              <div style={{ padding: '13px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '.85rem', fontWeight: '700', color: 'var(--text)', marginBottom: '2px' }}>
                    {req.date || 'TBD'}{req.time && req.time !== 'N/A' ? ' \u00b7 ' + req.time : ''}
                  </div>
                  <div style={{ fontSize: '.76rem', color: '#6b7280' }}>{req.address?.split(',')[0] || 'Address TBD'}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: '900', color: 'var(--pink-deep)' }}>
                    {'$' + req.estimate}
                  </div>
                  <div style={{ fontSize: '.68rem', color: '#6b7280' }}>Estimate</div>
                </div>
              </div>
            )}

            {isOpen && (
              <div>
                <div className="receipt-body">
                  {[
                    ['Service Date',  req.date || 'TBD'],
                    ['Time',          req.time || 'TBD'],
                    ['Address',       req.address],
                    ['Frequency',     req.frequency || 'One-Time'],
                    ['Bathrooms',     req.bathrooms],
                    ['Rooms',         req.rooms],
                    ['Add-Ons',       req.addons || 'None'],
                    ['Pets',          req.pets === 'yes' ? 'Yes (+fee)' : 'No'],
                    ['Building Type', req.buildingType],
                  ].filter(([, v]) => v && v !== '' && v !== '\u2014').map(([k, v]) => (
                    <div key={k} className="receipt-row">
                      <span className="receipt-key">{k}</span>
                      <span className="receipt-val">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="receipt-total">
                  <div>
                    <div className="receipt-total-label">Estimated Total</div>
                    <div style={{ fontSize: '.72rem', color: '#6b7280', marginTop: '2px' }}>Final price confirmed before service</div>
                  </div>
                  <div className="receipt-total-amount">{'$' + req.estimate}</div>
                </div>
              </div>
            )}

            <button className="receipt-expand-btn" onClick={() => toggle(req.id)}>
              {isOpen ? '\u25B2 Hide Details' : '\u25BC View Receipt'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [user,       setUser]       = useState(null);
  const [requests,   setRequests]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState('home');
  const unsubReqRef = useRef(null);

  const [reviewStars,   setReviewStars]   = useState(5);
  const [reviewText,    setReviewText]    = useState('');
  const [reviewBusy,    setReviewBusy]    = useState(false);
  const [reviewDone,    setReviewDone]    = useState(false);
  const [alreadyReview, setAlreadyReview] = useState(false);
  const [hoverStar,     setHoverStar]     = useState(0);

  const [settingsName, setSettingsName] = useState('');
  const [currentPass,  setCurrentPass]  = useState('');
  const [newPass,      setNewPass]      = useState('');
  const [settingsMsg,  setSettingsMsg]  = useState('');
  const [settingsErr,  setSettingsErr]  = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [needsVerify, setNeedsVerify] = useState(false);
  const [confirmPass, setConfirmPass] = useState('');

  const [cancelOpen,   setCancelOpen]   = useState(false);
  const [cancelBusy,   setCancelBusy]   = useState(false);
  const [cancelDone,   setCancelDone]   = useState(false);

  const [photoFiles,     setPhotoFiles]     = useState([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError,     setPhotoError]     = useState('');

  const [reschedOpen,   setReschedOpen]   = useState(false);
  const [reschedDates,  setReschedDates]  = useState('');
  const [reschedReason, setReschedReason] = useState('');
  const [reschedBusy,   setReschedBusy]   = useState(false);
  const [reschedDone,   setReschedDone]   = useState(false);

  const [, setTick] = useState(0);
  const [schedule, setSchedule] = useState([]);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const reqId = requests[0]?.id;
    if (activeTab === 'messages' && reqId) {
      setDoc(doc(db, 'chatReads', `${reqId}_customer`), { lastReadAt: new Date() }, { merge: true }).catch(() => {});
      setDoc(doc(db, 'chatUnread', reqId), { unreadByCustomer: 0 }, { merge: true }).catch(() => {});
    }
  }, [activeTab, requests]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) { router.push('/'); return; }
      if (isAdminEmail(u.email)) { router.push('/admin'); return; }
      if (needsEmailVerification(u)) {
        setUser(u);
        setNeedsVerify(true);
        setLoading(false);
        return;
      }
      setNeedsVerify(false);
      setUser(u);
      setSettingsName(u.displayName || '');
      const qById = query(collection(db, 'requests'), where('userId', '==', u.uid));
      const qByEmail = query(collection(db, 'requests'), where('userEmail', '==', u.email));
      const mergeSnaps = (snaps) => {
        const map = new Map();
        snaps.forEach(snap => snap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() })));
        const docs = Array.from(map.values());
        docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setRequests(docs);
        setLoading(false);
      };
      let snapA = null, snapB = null;
      const unsubA = onSnapshot(qById, s => { snapA = s; if (snapB) mergeSnaps([snapA, snapB]); else { setRequests(s.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); } }, () => setLoading(false));
      const unsubB = onSnapshot(qByEmail, s => { snapB = s; if (snapA) mergeSnaps([snapA, snapB]); }, () => {});
      const unsubReq = () => { unsubA(); unsubB(); };

      Promise.all([
        getDocs(query(collection(db, 'schedule'), where('userId', '==', u.uid))),
        getDocs(query(collection(db, 'schedule'), where('clientEmail', '==', u.email))),
      ]).then(([sA, sB]) => {
        const map = new Map();
        sA.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
        sB.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
        const entries = Array.from(map.values());
        entries.sort((a, b) => (a.sequenceIndex || 0) - (b.sequenceIndex || 0));
        setSchedule(entries);
      }).catch(() => {});
      unsubReqRef.current = unsubReq;
    });
    return () => { unsubAuth(); if (unsubReqRef.current) unsubReqRef.current(); };
  }, [router]);

  useEffect(() => {
    if (!user || !requests[0]) return;
    const req = requests[0];
    getDocs(query(collection(db, 'reviews'), where('userId', '==', user.uid), where('requestId', '==', req.id)))
      .then(snap => { if (!snap.empty) setAlreadyReview(true); });
  }, [user, requests]);

  const submitReview = async () => {
    const req = requests[0];
    if (!reviewText.trim() || !req) return;
    setReviewBusy(true);
    await addDoc(collection(db, 'reviews'), {
      userId: user.uid, requestId: req.id,
      name: user.displayName || user.email.split('@')[0],
      stars: reviewStars, text: reviewText.trim(),
      date: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      createdAt: serverTimestamp(),
    });
    setReviewBusy(false); setReviewDone(true); setAlreadyReview(true);
  };

  const submitReschedule = async () => {
    if (!reschedDates.trim() || !latest) return;
    setReschedBusy(true);
    try {
      await updateDoc(doc(db, 'requests', latest.id), {
        rescheduleRequested: true,
        reschedulePreferredDates: reschedDates.trim(),
        rescheduleReason: reschedReason.trim() || '',
      });
    } catch (e) { console.warn('Could not save reschedule flag:', e); }
    setReschedBusy(false); setReschedDone(true); setReschedOpen(false);
  };

  const uploadBeforePhotos = async () => {
    if (!photoFiles.length || !latest) return;
    const existing = latest.beforePhotos || [];
    if (existing.length + photoFiles.length > 5) { setPhotoError('Max 5 photos total.'); return; }
    setPhotoUploading(true); setPhotoError('');
    try {
      const urls = [];
      for (const file of photoFiles) {
        const path = `bookings/${user.uid}/before/${latest.id}/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        urls.push(url);
      }
      await updateDoc(doc(db, 'requests', latest.id), { beforePhotos: [...existing, ...urls] });
      setPhotoFiles([]);
    } catch { setPhotoError('Upload failed. Please try again.'); }
    setPhotoUploading(false);
  };

  const cancelScheduleEntry = async (entryId) => {
    if (!window.confirm('Cancel this individual recurring appointment?\nYour other scheduled cleanings will remain.')) return;
    await updateDoc(doc(db, 'schedule', entryId), { status: 'cancelled' });
    setSchedule(prev => prev.map(e => e.id === entryId ? { ...e, status: 'cancelled' } : e));
  };

  const cancelAllRecurring = async () => {
    if (!window.confirm('Cancel ALL remaining recurring appointments?\nThis cannot be undone.')) return;
    const upcoming = schedule.filter(e => e.status === 'upcoming');
    for (const e of upcoming) {
      await updateDoc(doc(db, 'schedule', e.id), { status: 'cancelled' });
    }
    setSchedule(prev => prev.map(e => e.status === 'upcoming' ? { ...e, status: 'cancelled' } : e));
  };

  const cancelBooking = async () => {
    if (!latest) return;
    setCancelBusy(true);
    await updateDoc(doc(db, 'requests', latest.id), { status: 'cancelled' });
    await addDoc(collection(db, 'chats', latest.id, 'messages'), {
      text: 'Your booking has been cancelled as requested. Feel free to book again any time!',
      sender: 'admin', senderName: 'Yoselin', createdAt: serverTimestamp(),
    });
    setCancelBusy(false); setCancelDone(true); setCancelOpen(false);
  };

  const saveName = async () => {
    if (!settingsName.trim()) { setSettingsErr('Name cannot be empty.'); return; }
    setSettingsBusy(true); setSettingsErr(''); setSettingsMsg('');
    try { await updateProfile(user, { displayName: settingsName.trim() }); setSettingsMsg('Name updated!'); }
    catch { setSettingsErr('Failed to update name.'); }
    setSettingsBusy(false);
  };

  const savePassword = async () => {
    if (!currentPass || !newPass) { setSettingsErr('Fill in both fields.'); return; }
    if (!isStrongPassword(newPass)) { setSettingsErr('Password must be at least ' + MIN_PASSWORD_LENGTH + ' characters and include a letter and a number.'); return; }
    if (newPass !== confirmPass) { setSettingsErr('Passwords do not match.'); return; }
    setSettingsBusy(true); setSettingsErr(''); setSettingsMsg('');
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPass);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPass);
      setSettingsMsg('Password updated!'); setCurrentPass(''); setNewPass(''); setConfirmPass('');
    } catch (e) {
      setSettingsErr(e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential' ? 'Current password is incorrect.' : mapAuthError(e));
    }
    setSettingsBusy(false);
  };

  const addPasswordForGoogle = async () => {
    if (!newPass) { setSettingsErr('Enter a new password.'); return; }
    if (!isStrongPassword(newPass)) { setSettingsErr('Password must be at least ' + MIN_PASSWORD_LENGTH + ' characters and include a letter and a number.'); return; }
    if (newPass !== confirmPass) { setSettingsErr('Passwords do not match.'); return; }
    setSettingsBusy(true); setSettingsErr(''); setSettingsMsg('');
    try {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
      const cred = EmailAuthProvider.credential(user.email, newPass);
      await linkWithCredential(user, cred);
      await user.reload();
      setUser(auth.currentUser);
      setSettingsMsg('Password added! You can now also log in with email and this password.');
      setNewPass(''); setConfirmPass('');
    } catch (e) {
      setSettingsErr(mapAuthError(e));
    }
    setSettingsBusy(false);
  };

  const unreadFromAdmin = useUnreadCount(requests[0]?.id || null, 'customer');

  if (loading) return <div className="spinner-page"><div className="spinner"></div></div>;
  if (needsVerify && user) {
    return (
      <VerifyGate
        user={user}
        onVerified={(u) => { setUser(u); setNeedsVerify(false); window.location.reload(); }}
      />
    );
  }

  // Prefer any active (new/confirmed) booking so a freshly-submitted quote
  // always takes precedence over a previously-completed one, even when the
  // new booking's serverTimestamp hasn't resolved yet (createdAt.seconds = undefined).
  const pendingReq   = requests.find(r => r.status === 'new' || r.status === 'confirmed');
  const latest       = pendingReq || requests[0] || null;
  const allDone      = requests.filter(r => r.status === 'done').length;
  const isDone       = !pendingReq && latest?.status === 'done';
  const isCancelled  = latest?.status === 'cancelled';
  const isConfirmed  = latest?.status === 'confirmed';
  const isNew        = latest?.status === 'new';
  const statusLabel  = isCancelled ? 'Cancelled' : isNew ? 'Pending Review' : isConfirmed ? 'Confirmed' : 'Completed';
  const statusColor  = isCancelled ? '#ef4444' : isNew ? '#f59e0b' : isConfirmed ? '#10b981' : '#6b7280';
  const firstName    = user?.displayName?.split(' ')[0] || 'there';
  const loyalty      = getLoyaltyTier(allDone);
  const countdown    = isConfirmed ? getCountdown(latest?.date) : null;
  const hasPassword = hasPasswordProvider(user);
  const hasGoogle = hasGoogleProvider(user);
  const googleOnly = hasGoogle && !hasPassword;

  const upcomingSchedule = schedule.filter(e => e.status === 'upcoming');
  const TABS = [
    { id: 'home',     label: 'Home'     },
    ...(latest && !isDone && !isCancelled ? [
      { id: 'messages', label: 'Messages', badge: unreadFromAdmin },
      { id: 'request',  label: 'My Quote' },
    ] : []),
    ...(upcomingSchedule.length > 0 ? [{ id: 'schedule', label: 'Schedule (' + upcomingSchedule.length + ')' }] : []),
    ...(requests.length > 0 ? [{ id: 'history', label: 'History (' + requests.length + ')' }] : []),
    { id: 'settings', label: 'Settings' },
  ];
  const safeTab = TABS.find(tb => tb.id === activeTab) ? activeTab : 'home';

  const btn = (label, onClick, style = {}) => (
    <button onClick={onClick} style={{
      padding: '13px 28px', background: 'var(--blue)',
      color: 'white', border: 'none', borderRadius: '12px',
      fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.92rem',
      cursor: 'pointer', ...style,
    }}>{label}</button>
  );

  return (
    <PortalShell>
      <div className="portal-toolbar">
        <div className="portal-toolbar__left">
          <button type="button" className="portal-pill portal-pill--active" onClick={() => setActiveTab('home')}>Dashboard</button>
          <button type="button" className="portal-pill" onClick={() => router.push('/')}>Home</button>
        </div>
        <div className="portal-toolbar__right">
          {user?.photoURL
            ? <img src={user.photoURL} className="nav-avatar" alt="" />
            : <div className="portal-avatar">{firstName[0]?.toUpperCase()}</div>
          }
          <button className="signout-btn" type="button" onClick={() => { signOut(auth); router.push('/'); }}>Sign Out</button>
        </div>
      </div>

      <div className="portal-hero">
        <div className="portal-hero__inner">
          <div>
            <h1>Hey, {firstName}!</h1>
            <p>
              {isDone      ? 'Your cleaning is complete — thank you!' :
               isCancelled ? 'Your booking was cancelled.' :
               isConfirmed ? 'Your appointment is confirmed!' :
               latest      ? 'We are reviewing your request.' :
               'Welcome to your cleaning portal.'}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', background: loyalty.bg, border: '1px solid ' + loyalty.color + '44', borderRadius: '99px', padding: '6px 13px' }}>
              <span style={{ fontSize: '.75rem', fontWeight: 800, letterSpacing: '.02em' }}>{loyalty.mark}</span>
              <span style={{ fontSize: '.73rem', fontWeight: '700', color: loyalty.color }}>{loyalty.label}</span>
              {allDone > 0 && <span style={{ fontSize: '.68rem', color: loyalty.color, opacity: .7 }}>{allDone} job{allDone !== 1 ? 's' : ''}</span>}
            </div>
            {latest && (
              <div className="portal-card" style={{ padding: '10px 14px' }}>
                <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '2px' }}>Your Booking</div>
                <div style={{ fontSize: '.85rem', fontWeight: '700', color: statusColor }}>{statusLabel}</div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{'$' + latest.estimate} estimate</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="portal-tabs">
        {TABS.map(tab => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={'portal-tab' + (safeTab === tab.id ? ' portal-tab--active' : '')}>
            {tab.label}
            {tab.badge > 0 && (
              <span className="portal-tab__badge">{tab.badge > 9 ? '9+' : tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      <div className="portal-body">

        {/* ── HOME TAB ── */}
        {safeTab === 'home' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {isConfirmed && countdown && (
              <div style={{
                background: countdown.urgent ? 'rgba(16,185,129,.08)' : 'rgba(26,111,212,.06)',
                border: '1.5px solid ' + (countdown.urgent ? '#10b981' : '#1a6fd4') + '33',
                borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px',
              }}>
                <div style={{ width: '54px', height: '54px', borderRadius: '50%', flexShrink: 0, background: countdown.urgent ? 'rgba(16,185,129,.18)' : 'rgba(26,111,212,.18)', border: '2px solid ' + (countdown.urgent ? '#10b981' : '#1a6fd4'), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  {countdown.days <= 1
                    ? <span style={{ fontSize: '1.5rem' }}>&#x1F525;</span>
                    : <><span style={{ fontFamily: 'var(--font-display)', fontWeight: '900', fontSize: '1.4rem', color: 'white', lineHeight: 1 }}>{countdown.days}</span><span style={{ fontSize: '.55rem', color: '#9ca3af', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.5px' }}>days</span></>
                  }
                </div>
                <div>
                  <div style={{ fontSize: '.7rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '2px' }}>
                    {countdown.urgent ? 'Coming Up!' : 'Upcoming Cleaning'}
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text)', marginBottom: '2px' }}>
                    {countdown.days === 0 ? 'Your cleaning is TODAY!' : countdown.days === 1 ? 'Your cleaning is TOMORROW!' : 'Cleaning in ' + countdown.days + ' days'}
                  </div>
                  <div style={{ fontSize: '.8rem', color: '#9ca3af' }}>
                    {latest.date}{latest.time && latest.time !== 'N/A' ? ' at ' + latest.time : ''}
                  </div>
                </div>
              </div>
            )}

            {!latest ? (
              <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '18px', padding: '40px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}></div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: '700', color: 'var(--text)', marginBottom: '8px' }}>Get Your Free Quote</h2>
                <p style={{ color: '#9ca3af', fontSize: '.85rem', marginBottom: '24px', lineHeight: '1.6' }}>Fill out a quick form and get a custom estimate. No commitment needed.</p>
                {btn('Get a Quote', () => router.push('/book'))}
              </div>
            ) : isDone ? (
              <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '18px', padding: '36px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>✓</div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: '700', color: 'var(--text)', marginBottom: '8px' }}>Job Complete!</h2>
                <p style={{ color: '#9ca3af', fontSize: '.85rem', marginBottom: '24px', lineHeight: '1.6' }}>Your cleaning has been marked complete. Hope everything is sparkling!</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                  {btn('Book Again', () => router.push('/book'))}
                  <button onClick={() => router.push('/')} style={{ padding: '11px 28px', background: 'transparent', color: '#9ca3af', border: '1px solid var(--border)', borderRadius: '12px', fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.88rem', cursor: 'pointer' }}>Back to Home Page</button>
                </div>
              </div>
            ) : isCancelled ? (
              <div style={{ background: 'white', border: '1.5px solid rgba(239,68,68,.25)', borderRadius: '18px', padding: '36px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>✕</div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: '700', color: 'var(--text)', marginBottom: '8px' }}>Booking Cancelled</h2>
                <p style={{ color: '#9ca3af', fontSize: '.85rem', marginBottom: '24px', lineHeight: '1.6' }}>Your booking was cancelled. Ready to schedule a new cleaning? We'd love to have you back!</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                  {btn('Book a New Quote', () => router.push('/book'), { background: 'var(--blue)' })}
                  <button onClick={() => router.push('/')} style={{ padding: '11px 28px', background: 'transparent', color: '#9ca3af', border: '1px solid var(--border)', borderRadius: '12px', fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.88rem', cursor: 'pointer' }}>Back to Home Page</button>
                </div>
              </div>
            ) : (
              <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px 20px' }}>
                <div style={{ fontSize: '.7rem', color: '#6b7280', fontWeight: '700', letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: '12px' }}>Booking #{latest.id.slice(-6).toUpperCase()}</div>
                <div style={{ background: 'rgba(96,165,250,.04)', borderRadius: '14px', border: '1px solid rgba(96,165,250,.12)', overflow: 'hidden', marginBottom: '14px' }}>
                  <div style={{ padding: '9px 14px', background: 'rgba(96,165,250,.06)', borderBottom: '1px solid rgba(96,165,250,.1)', display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <span style={{ fontSize: '.72rem' }}>Date</span>
                    <span style={{ fontSize: '.62rem', fontWeight: '800', color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '1px' }}>Preferred Date &amp; Time</span>
                  </div>
                  <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {(() => {
                      const pd = parseDateDash(latest.date);
                      if (pd) {
                        return (
                          <div style={{ width: '62px', flexShrink: 0, borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(26,111,212,.2)', border: '1px solid rgba(96,165,250,.25)' }}>
                            <div style={{ background: 'var(--blue)', padding: '4px 0 3px', textAlign: 'center' }}>
                              <div style={{ fontSize: '.52rem', fontWeight: '800', color: 'rgba(255,255,255,.9)', textTransform: 'uppercase', letterSpacing: '1.2px', lineHeight: 1 }}>{MONTH_NAMES_DASH[pd.getMonth()].slice(0,3)}</div>
                            </div>
                            <div style={{ background: 'white', padding: '7px 0 5px', textAlign: 'center' }}>
                              <div style={{ fontSize: '1.55rem', fontWeight: '900', color: 'var(--text)', lineHeight: 1 }}>{pd.getDate()}</div>
                              <div style={{ fontSize: '.48rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', marginTop: '2px' }}>{DAY_NAMES_DASH[pd.getDay()].slice(0,3)}</div>
                            </div>
                          </div>
                        );
                      }
                      return <div style={{ width: '62px', height: '62px', borderRadius: '12px', background: 'white', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.4rem' }}>Date</div>;
                    })()}
                    <div style={{ flex: 1 }}>
                      {(() => {
                        const pd = parseDateDash(latest.date);
                        return pd
                          ? <div style={{ fontSize: '.95rem', fontWeight: '800', color: 'var(--text)', marginBottom: '2px' }}>{DAY_NAMES_DASH[pd.getDay()]}, {MONTH_NAMES_DASH[pd.getMonth()]} {pd.getDate()}</div>
                          : <div style={{ fontSize: '.95rem', fontWeight: '700', color: 'var(--text)', marginBottom: '2px' }}>{latest.date || 'TBD'}</div>;
                      })()}
                      {(() => {
                        const pd = parseDateDash(latest.date);
                        return pd ? <div style={{ fontSize: '.72rem', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>{pd.getFullYear()}</div> : null;
                      })()}
                      {latest.time && latest.time !== 'N/A' && latest.time !== 'TBD' && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(96,165,250,.08)', border: '1px solid rgba(96,165,250,.18)', borderRadius: '10px', padding: '5px 12px' }}>
                          <span style={{ fontSize: '.68rem' }}>Time</span>
                          <span style={{ fontSize: '.8rem', fontWeight: '700', color: 'var(--blue-light)' }}>{latest.time}</span>
                        </div>
                      )}
                      {(!latest.time || latest.time === 'N/A' || latest.time === 'TBD') && (
                        <div style={{ fontSize: '.75rem', color: '#555', fontStyle: 'italic' }}>No time selected</div>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: '900', color: 'var(--pink-deep)' }}>{'$' + latest.estimate}</div>
                    <div style={{ fontSize: '.68rem', color: '#6b7280' }}>Estimate</div>
                  </div>
                </div>
              </div>
            )}

            {latest && !isDone && (
              <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px 20px' }}>
                <div style={{ fontSize: '.72rem', color: '#6b7280', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '14px' }}>Booking Progress</div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {[{ label: 'Submitted', done: true }, { label: 'In Review', done: isConfirmed }, { label: 'Confirmed', done: isConfirmed }, { label: 'Complete', done: false }].map((s, i, arr) => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', flex: i < arr.length - 1 ? 1 : 'none' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: s.done ? '#db2777' : '#2a2a2a', border: '2px solid ' + (s.done ? '#db2777' : '#3a3a3a'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.72rem', color: s.done ? 'white' : '#555', fontWeight: '700' }}>
                          {s.done ? '\u2713' : i + 1}
                        </div>
                        <span style={{ fontSize: '.6rem', color: s.done ? 'var(--text)' : 'var(--text-muted)', fontWeight: '600', textAlign: 'center', width: '52px' }}>{s.label}</span>
                      </div>
                      {i < arr.length - 1 && <div style={{ flex: 1, height: '2px', background: s.done && arr[i + 1].done ? '#db2777' : '#2a2a2a', margin: '0 2px', marginBottom: '18px' }} />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isDone && !alreadyReview && (
              <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #2a2a2a', fontWeight: '700', color: 'var(--text)', fontSize: '.92rem' }}>Leave a Review</div>
                <div style={{ padding: '18px 20px' }}>
                  {reviewDone ? (
                    <div style={{ textAlign: 'center', padding: '16px 0' }}>
                      <div style={{ fontSize: '2.4rem', marginBottom: '10px' }}>&#x2764;&#xFE0F;</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: '700', color: 'var(--text)', fontSize: '1.05rem', marginBottom: '5px' }}>Thank you for your review!</div>
                      <div style={{ color: '#9ca3af', fontSize: '.83rem' }}>It will appear on our homepage.</div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', alignItems: 'center' }}>
                        {[1, 2, 3, 4, 5].map(s => (
                          <button key={s} onMouseEnter={() => setHoverStar(s)} onMouseLeave={() => setHoverStar(0)} onClick={() => setReviewStars(s)}
                            style={{ fontSize: '1.8rem', background: 'none', border: 'none', cursor: 'pointer', opacity: s <= (hoverStar || reviewStars) ? 1 : 0.25, transition: 'all .12s', lineHeight: 1, padding: '2px' }}>
                            ★
                          </button>
                        ))}
                        <span style={{ color: '#9ca3af', fontSize: '.82rem', marginLeft: '6px' }}>{reviewStars} stars</span>
                      </div>
                      <textarea value={reviewText} onChange={e => setReviewText(e.target.value)} placeholder="Tell others about your experience..." rows={3}
                        style={{ width: '100%', padding: '12px 14px', background: 'white', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text)', fontSize: '.87rem', fontFamily: "'DM Sans', sans-serif", outline: 'none', resize: 'vertical', marginBottom: '12px' }} />
                      <button onClick={submitReview} disabled={reviewBusy || !reviewText.trim()} className={reviewText.trim() ? 'btn btn-primary' : 'btn'} style={{ width: '100%', padding: '13px', borderRadius: '12px', fontSize: '.92rem' }}>
                        {reviewBusy ? 'Submitting...' : 'Submit Review'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {isDone && alreadyReview && !reviewDone && (
              <div style={{ background: 'rgba(16,185,129,.07)', border: '1px solid rgba(16,185,129,.2)', borderRadius: '12px', padding: '13px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.2rem' }}>&#x2705;</span>
                <div style={{ fontWeight: '700', color: '#10b981', fontSize: '.87rem' }}>Review Submitted - Thank you!</div>
              </div>
            )}

            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '.68rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }}>Loyalty Status</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '.04em' }}>{loyalty.mark}</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: '700', color: loyalty.color, fontSize: '.95rem' }}>{loyalty.label}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: '900', color: 'var(--text)', lineHeight: 1 }}>{allDone}</div>
                  <div style={{ fontSize: '.68rem', color: '#6b7280', marginTop: '2px' }}>jobs done</div>
                </div>
              </div>
              {loyalty.next ? (
                <>
                  <div style={{ height: '6px', background: 'var(--border)', borderRadius: '99px', overflow: 'hidden', marginBottom: '6px' }}>
                    <div style={{ height: '100%', width: Math.min(100, (allDone / loyalty.nextAt) * 100) + '%', background: loyalty.color, borderRadius: '99px', transition: 'width .5s' }} />
                  </div>
                  <div style={{ fontSize: '.7rem', color: '#6b7280', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{allDone} / {loyalty.nextAt} jobs</span>
                    <span>{loyalty.nextAt - allDone} more to reach <strong style={{ color: 'var(--text)' }}>{loyalty.next}</strong></span>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '.78rem', color: loyalty.color, fontWeight: '700', textAlign: 'center' }}>Highest tier — thank you for your loyalty!</div>
              )}
            </div>

            {upcomingSchedule.length > 0 && (
              <div onClick={() => setActiveTab('schedule')} style={{ background: 'white', border: '1.5px solid rgba(13,148,136,.3)', borderRadius: '16px', padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(13,148,136,.15)', border: '1px solid rgba(13,148,136,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>&#x1F501;</div>
                  <div>
                    <div style={{ fontSize: '.7rem', fontWeight: '700', color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '2px' }}>Next Recurring Cleaning</div>
                    <div style={{ fontWeight: '700', color: 'var(--text)', fontSize: '.9rem' }}>{upcomingSchedule[0].date}</div>
                    <div style={{ fontSize: '.72rem', color: '#9ca3af' }}>{upcomingSchedule[0].time !== 'TBD' ? upcomingSchedule[0].time + ' \u00b7 ' : ''}{upcomingSchedule.length} cleanings scheduled</div>
                  </div>
                </div>
                <span style={{ color: 'var(--blue)', fontSize: '1rem', flexShrink: 0 }}>&#x2192;</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {latest && !isDone && (
                <div onClick={() => setActiveTab('messages')} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(26,111,212,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>&#x1F4AC;</div>
                  <div><div style={{ fontWeight: '700', color: 'var(--text)', fontSize: '.85rem' }}>Messages</div><div style={{ fontSize: '.72rem', color: '#6b7280' }}>Chat with us</div></div>
                </div>
              )}
              {latest && !isDone && (
                <div onClick={() => setActiveTab('request')} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(219,39,119,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>&#x1F4CB;</div>
                  <div><div style={{ fontWeight: '700', color: 'var(--text)', fontSize: '.85rem' }}>My Quote</div><div style={{ fontSize: '.72rem', color: '#6b7280' }}>View details</div></div>
                </div>
              )}
              <div onClick={() => router.push('/book')} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16,185,129,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>&#x2728;</div>
                <div><div style={{ fontWeight: '700', color: 'var(--text)', fontSize: '.85rem' }}>{(isDone || isCancelled) ? 'New Quote' : latest ? 'New Quote' : 'Get a Quote'}</div><div style={{ fontSize: '.72rem', color: '#6b7280' }}>Instant estimate</div></div>
              </div>
              <div onClick={() => setActiveTab('settings')} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(156,163,175,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>&#x2699;&#xFE0F;</div>
                <div><div style={{ fontWeight: '700', color: 'var(--text)', fontSize: '.85rem' }}>Settings</div><div style={{ fontSize: '.72rem', color: '#6b7280' }}>Update your info</div></div>
              </div>
            </div>

          </div>
        )}

        {/* ── MESSAGES TAB ── */}
        {safeTab === 'messages' && latest && !isDone && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: '700', color: 'var(--text)' }}>Messages</div>
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
              <Chat requestId={latest.id} currentUser={user} senderRole="customer" onClose={null} inline={true} />
            </div>
          </div>
        )}

        {/* ── MY QUOTE TAB ── */}
        {safeTab === 'request' && latest && !isDone && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: '700', color: 'var(--text)' }}>Quote Details</div>
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
              <div style={{ background: 'white', padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '.7rem', color: '#6b7280', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }}>Your Estimate</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', fontWeight: '900', color: 'var(--pink-deep)' }}>{'$' + latest.estimate}</div>
                  <div style={{ fontSize: '.7rem', color: '#6b7280', marginTop: '3px' }}>Final price confirmed before service</div>
                </div>
                <span className={'badge badge-' + latest.status}>{statusLabel}</span>
              </div>
              <div style={{ padding: '8px 22px' }}>
                {[
                  ['Date',      latest.date || 'TBD'],
                  ['Time',      latest.time || 'TBD'],
                  ['Address',   latest.address],
                  ['Frequency', latest.frequency],
                  ['Bathrooms', latest.bathrooms],
                  ['Rooms',     latest.rooms],
                  ['Add-Ons',   latest.addons || 'None'],
                  ['Pets',      latest.pets === 'yes' ? 'Yes' : 'No'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', padding: '10px 0', borderBottom: '1px solid #2a2a2a' }}>
                    <span style={{ fontSize: '.78rem', color: '#6b7280', fontWeight: '600', minWidth: '100px' }}>{k}</span>
                    <span style={{ fontSize: '.82rem', fontWeight: '600', color: 'var(--text)', textAlign: 'right' }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button onClick={() => setActiveTab('messages')} className="btn btn-primary" style={{ width: '100%', padding: '13px' }}>
                  Send a Message
                </button>
                {!reschedDone ? (
                  !reschedOpen ? (
                    <button onClick={() => setReschedOpen(true)} className="btn" style={{ width: '100%', padding: '11px' }}>
                      Request a Reschedule
                    </button>
                  ) : (
                    <div style={{ background: 'white', borderRadius: '14px', padding: '16px', border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: '700', color: 'var(--text)', fontSize: '.88rem', marginBottom: '12px' }}>Request a Reschedule</div>
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '.78rem', fontWeight: '700', color: '#9ca3af', marginBottom: '5px' }}>Preferred Dates / Times</label>
                        <input type="text" value={reschedDates} onChange={e => setReschedDates(e.target.value)} placeholder="e.g. Any morning next week, or March 10-12"
                          style={{ width: '100%', padding: '9px 12px', background: 'white', border: '1.5px solid var(--border)', borderRadius: '9px', color: 'var(--text)', fontSize: '.83rem', fontFamily: "'DM Sans', sans-serif", outline: 'none' }} />
                      </div>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '.78rem', fontWeight: '700', color: '#9ca3af', marginBottom: '5px' }}>Reason (optional)</label>
                        <input type="text" value={reschedReason} onChange={e => setReschedReason(e.target.value)} placeholder="e.g. Work conflict, family event..."
                          style={{ width: '100%', padding: '9px 12px', background: 'white', border: '1.5px solid var(--border)', borderRadius: '9px', color: 'var(--text)', fontSize: '.83rem', fontFamily: "'DM Sans', sans-serif", outline: 'none' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={submitReschedule} disabled={reschedBusy || !reschedDates.trim()} className={reschedDates.trim() ? 'btn btn-primary wide' : 'btn wide'} style={{ flex: 1 }}>
                          {reschedBusy ? 'Sending...' : 'Send Request'}
                        </button>
                        <button onClick={() => setReschedOpen(false)} className="btn" style={{ padding: '10px 16px' }}>Cancel</button>
                      </div>
                    </div>
                  )
                ) : (
                  <div style={{ background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.25)', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.2rem' }}>&#x2705;</span>
                    <div style={{ fontWeight: '700', color: '#10b981', fontSize: '.85rem' }}>Reschedule request sent! We will be in touch soon.</div>
                  </div>
                )}
                {(latest.status === 'new' || latest.status === 'confirmed') && !cancelDone && (
                  !cancelOpen ? (
                    <button onClick={() => setCancelOpen(true)} className="btn btn-danger-outline" style={{ width: '100%', padding: '11px' }}>
                      &#x274C; Cancel Booking
                    </button>
                  ) : (
                    <div style={{ background: 'rgba(239,68,68,.07)', border: '1.5px solid rgba(239,68,68,.25)', borderRadius: '14px', padding: '16px' }}>
                      <div style={{ fontWeight: '700', color: '#ef4444', fontSize: '.88rem', marginBottom: '6px' }}>&#x26A0; Cancel this booking?</div>
                      <div style={{ fontSize: '.78rem', color: '#9ca3af', marginBottom: '14px', lineHeight: 1.5 }}>This will mark your booking as cancelled. You can always submit a new request whenever you are ready.</div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={cancelBooking} disabled={cancelBusy} className="btn btn-danger-outline" style={{ flex: 1 }}>
                          {cancelBusy ? 'Cancelling...' : 'Yes, Cancel'}
                        </button>
                        <button onClick={() => setCancelOpen(false)} className="btn" style={{ flex: 1 }}>Keep Booking</button>
                      </div>
                    </div>
                  )
                )}
                {cancelDone && (
                  <div style={{ background: 'rgba(107,114,128,.08)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', fontSize: '.83rem', color: '#9ca3af', textAlign: 'center' }}>
                    Booking cancelled. You can submit a new request any time.
                  </div>
                )}
              </div>
            </div>

            {/* Before Photos card */}
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.1rem' }}>📸</span>
                <div>
                  <div style={{ fontWeight: '700', color: 'var(--text)', fontSize: '.9rem' }}>Before Photos</div>
                  <div style={{ fontSize: '.72rem', color: '#6b7280' }}>Upload photos of your space for the cleaner</div>
                </div>
              </div>
              <div style={{ padding: '16px 20px' }}>
                {(latest.beforePhotos || []).length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
                    {(latest.beforePhotos || []).map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', aspectRatio: '1', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                        <img src={url} alt={'Before photo ' + (i + 1)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </a>
                    ))}
                  </div>
                )}
                {(latest.beforePhotos || []).length >= 5 ? (
                  <div style={{ fontSize: '.8rem', color: '#6b7280', textAlign: 'center', padding: '8px 0' }}>✓ Max 5 photos uploaded</div>
                ) : (
                  <>
                    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '20px', background: 'white', border: '2px dashed var(--border)', borderRadius: '12px', cursor: 'pointer', marginBottom: '12px' }}>
                      <span style={{ fontSize: '1.8rem' }}>📷</span>
                      <span style={{ fontSize: '.82rem', color: '#9ca3af', fontWeight: '600' }}>
                        {photoFiles.length > 0 ? photoFiles.length + ' photo' + (photoFiles.length > 1 ? 's' : '') + ' selected' : 'Tap to choose photos'}
                      </span>
                      <span style={{ fontSize: '.72rem', color: '#555' }}>
                        Up to {5 - (latest.beforePhotos || []).length} more · Max 10 MB each
                      </span>
                      <input type="file" accept="image/*" multiple onChange={e => { setPhotoFiles(Array.from(e.target.files).slice(0, 5 - (latest.beforePhotos || []).length)); setPhotoError(''); }} style={{ display: 'none' }} />
                    </label>
                    {photoError && <div style={{ fontSize: '.8rem', color: '#ef4444', marginBottom: '10px', textAlign: 'center' }}>{photoError}</div>}
                    <button onClick={uploadBeforePhotos} disabled={photoUploading || !photoFiles.length} className={photoFiles.length ? 'btn btn-primary' : 'btn'} style={{ width: '100%', padding: '12px' }}>
                      {photoUploading ? 'Uploading...' : 'Upload Photos'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── SCHEDULE TAB ── */}
        {safeTab === 'schedule' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: '700', color: 'var(--text)' }}>
              &#x1F501; Your Recurring Schedule
            </div>
            <div style={{ background: 'rgba(13,148,136,.07)', border: '1px solid rgba(13,148,136,.2)', borderRadius: '12px', padding: '13px 18px', fontSize: '.83rem', color: 'var(--blue)' }}>
              These are your automatically scheduled future cleanings based on your <strong style={{ color: 'var(--text)' }}>{schedule[0]?.frequency}</strong> plan.
            </div>
            {upcomingSchedule.length > 0 && (
              <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ padding: '13px 20px', borderBottom: '1px solid #2a2a2a', fontSize: '.72rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  Upcoming ({upcomingSchedule.length})
                </div>
                {upcomingSchedule.map((entry, i) => {
                  const isNext = i === 0;
                  const now2 = new Date();
                  const diff = Math.round((new Date(entry.date).setHours(0,0,0,0) - now2.setHours(0,0,0,0)) / 86400000);
                  return (
                    <div key={entry.id} style={{ padding: '14px 20px', borderBottom: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: '900', fontSize: '.9rem', background: isNext ? 'var(--blue)' : 'var(--soft)', color: isNext ? 'white' : 'var(--text-muted)' }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: '120px' }}>
                        <div style={{ fontWeight: '700', color: isNext ? 'white' : 'var(--text)', fontSize: '.86rem', marginBottom: '2px' }}>
                          {entry.date}
                          {isNext && <span style={{ marginLeft: '7px', fontSize: '.62rem', background: 'rgba(26,111,212,.2)', color: 'var(--blue)', border: '1px solid rgba(26,111,212,.3)', borderRadius: '99px', padding: '2px 7px', fontWeight: '700' }}>NEXT</span>}
                        </div>
                        <div style={{ fontSize: '.73rem', color: '#6b7280' }}>
                          {entry.time !== 'TBD' ? entry.time + ' \u00b7 ' : ''}{entry.address?.split(',')[0]}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                        {diff >= 0 && diff <= 30 && (
                          <div style={{ fontSize: '.72rem', fontWeight: '700', color: diff <= 3 ? '#f59e0b' : '#9ca3af' }}>
                            {diff === 0 ? 'Today!' : diff === 1 ? 'Tomorrow' : 'In ' + diff + 'd'}
                          </div>
                        )}
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '.9rem', fontWeight: '900', color: 'var(--blue)' }}>{'$' + entry.estimate}</div>
                        <button onClick={() => cancelScheduleEntry(entry.id)} title="Cancel this appointment" className="btn btn-icon btn-danger-icon" style={{ flexShrink: 0 }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {upcomingSchedule.length > 1 && (
              <button onClick={cancelAllRecurring} style={{ width: '100%', padding: '11px', background: 'transparent', border: '1.5px solid rgba(239,68,68,.25)', color: '#ef4444', borderRadius: '12px', fontFamily: "'DM Sans',sans-serif", fontWeight: '700', fontSize: '.85rem', cursor: 'pointer' }}>
                Cancel All Remaining Recurring Appointments ({upcomingSchedule.length})
              </button>
            )}
            {schedule.filter(e => e.status === 'done').length > 0 && (
              <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ padding: '13px 20px', borderBottom: '1px solid #2a2a2a', fontSize: '.72rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  Completed ({schedule.filter(e => e.status === 'done').length})
                </div>
                {schedule.filter(e => e.status === 'done').map(entry => (
                  <div key={entry.id} style={{ padding: '12px 20px', borderBottom: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', gap: '12px', opacity: 0.6 }}>
                    <span style={{ fontSize: '1rem' }}>&#x2705;</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', color: '#6b7280', fontSize: '.83rem' }}>{entry.date}</div>
                      <div style={{ fontSize: '.72rem', color: '#555' }}>{entry.time}</div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '.9rem', fontWeight: '700', color: '#555' }}>{'$' + entry.estimate}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {safeTab === 'history' && (
          <HistoryTab requests={requests} />
        )}

        {/* ── SETTINGS TAB ── */}
        {safeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: '700', color: 'var(--text)' }}>Account Settings</div>
            {settingsMsg && <div style={{ padding: '12px 16px', borderRadius: '12px', fontSize: '.84rem', fontWeight: '600', background: 'rgba(16,185,129,.12)', color: '#10b981', border: '1px solid rgba(16,185,129,.2)' }}>{settingsMsg}</div>}
            {settingsErr && <div style={{ padding: '12px 16px', borderRadius: '12px', fontSize: '.84rem', fontWeight: '600', background: 'rgba(239,68,68,.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,.2)' }}>⚠️ {settingsErr}</div>}
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
              <div style={{ fontSize: '.75rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '16px' }}>Profile</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px', paddingBottom: '18px', borderBottom: '1px solid #2a2a2a' }}>
                {user?.photoURL
                  ? <img src={user.photoURL} style={{ width: '44px', height: '44px', borderRadius: '50%' }} alt="" />
                  : <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--blue)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '1.1rem' }}>{firstName[0]?.toUpperCase()}</div>
                }
                <div>
                  <div style={{ fontWeight: '700', color: 'var(--text)', fontSize: '.9rem' }}>{user?.displayName || 'No name set'}</div>
                  <div style={{ fontSize: '.78rem', color: '#9ca3af', marginTop: '2px' }}>{user?.email}</div>
                </div>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '.8rem', fontWeight: '700', color: 'var(--text)', marginBottom: '6px' }}>Display Name</label>
                <input type="text" value={settingsName} onChange={e => setSettingsName(e.target.value)} placeholder="Your full name"
                  style={{ width: '100%', padding: '10px 13px', background: 'white', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text)', fontSize: '.87rem', fontFamily: "'DM Sans', sans-serif", outline: 'none' }} />
              </div>
              <button onClick={saveName} disabled={settingsBusy} className="btn btn-primary">
                {settingsBusy ? 'Saving...' : 'Save Name'}
              </button>
            </div>
            {hasPassword && (
              <div className="portal-card settings-card">
                <div className="settings-card__label">Change Password</div>
                <p className="portal-muted" style={{ marginBottom: 12 }}>Use a strong password you will remember. Google sign-in still works if linked.</p>
                <div className="form-field">
                  <label htmlFor="dash-current-pass">Current Password</label>
                  <input id="dash-current-pass" type="password" autoComplete="current-password" value={currentPass} onChange={e => setCurrentPass(e.target.value)} />
                </div>
                <div className="form-field">
                  <label htmlFor="dash-new-pass">New Password</label>
                  <input id="dash-new-pass" type="password" autoComplete="new-password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder={'At least ' + MIN_PASSWORD_LENGTH + ' characters'} />
                </div>
                <div className="form-field">
                  <label htmlFor="dash-confirm-pass">Confirm New Password</label>
                  <input id="dash-confirm-pass" type="password" autoComplete="new-password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} />
                </div>
                <button type="button" onClick={savePassword} disabled={settingsBusy} className="btn btn-primary">
                  {settingsBusy ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            )}
            {googleOnly && (
              <div className="portal-card settings-card">
                <div className="settings-card__label">Add a Password</div>
                <p className="portal-muted" style={{ marginBottom: 12 }}>
                  You signed in with Google, so there is no automatic password. Add one here if you also want to log in with email.
                  You will confirm with Google first.
                </p>
                <div className="form-field">
                  <label htmlFor="dash-add-pass">New Password</label>
                  <input id="dash-add-pass" type="password" autoComplete="new-password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder={'At least ' + MIN_PASSWORD_LENGTH + ' characters'} />
                </div>
                <div className="form-field">
                  <label htmlFor="dash-add-confirm">Confirm Password</label>
                  <input id="dash-add-confirm" type="password" autoComplete="new-password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} />
                </div>
                <button type="button" onClick={addPasswordForGoogle} disabled={settingsBusy} className="btn btn-primary">
                  {settingsBusy ? 'Saving...' : 'Add password'}
                </button>
              </div>
            )}
            {hasGoogle && hasPassword && (
              <div className="portal-card settings-card">
                <div className="settings-card__label">Sign-in methods</div>
                <p className="portal-muted">This account can use Google and email/password.</p>
              </div>
            )}
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
              <div style={{ fontSize: '.75rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '8px' }}>Sign Out</div>
              <p style={{ color: '#9ca3af', fontSize: '.84rem', marginBottom: '14px' }}>This will sign you out on this device.</p>
              <button onClick={() => { signOut(auth); router.push('/'); }} className="btn btn-danger-outline">
                Sign Out
              </button>
            </div>
          </div>
        )}

      </div>
    </PortalShell>
  );
}

'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from '../../lib/firebase';
import Chat from '../../components/Chat';

function getLoyaltyTier(count) {
  if (count >= 8) return { label: 'VIP Client',       color: '#7c3aed', bg: 'rgba(124,58,237,.15)', next: null,        nextAt: null };
  if (count >= 5) return { label: 'Gold Client',      color: '#f59e0b', bg: 'rgba(245,158,11,.15)', next: 'VIP',       nextAt: 8 };
  if (count >= 3) return { label: 'Regular Client',   color: '#9ca3af', bg: 'rgba(156,163,175,.15)',next: 'Gold',      nextAt: 5 };
  if (count >= 1) return { label: 'Returning Client', color: '#10b981', bg: 'rgba(16,185,129,.15)', next: 'Regular',   nextAt: 3 };
  return                  { label: 'New Client',       color: '#60a5fa', bg: 'rgba(96,165,250,.15)', next: 'Returning', nextAt: 1 };
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
  if (diff === 0) return { days: 0, label: 'Today!',    urgent: true  };
  if (diff === 1) return { days: 1, label: 'Tomorrow!', urgent: true  };
  return          { days: diff, label: diff + ' days',  urgent: false };
}

export default function DashboardPage() {
  const router = useRouter();
  const [user,       setUser]       = useState(null);
  const [requests,   setRequests]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState('home');
  const unsubReqRef = useRef(null);

  // Review
  const [reviewStars,   setReviewStars]   = useState(5);
  const [reviewText,    setReviewText]    = useState('');
  const [reviewBusy,    setReviewBusy]    = useState(false);
  const [reviewDone,    setReviewDone]    = useState(false);
  const [alreadyReview, setAlreadyReview] = useState(false);
  const [hoverStar,     setHoverStar]     = useState(0);

  // Settings
  const [settingsName, setSettingsName] = useState('');
  const [currentPass,  setCurrentPass]  = useState('');
  const [newPass,      setNewPass]      = useState('');
  const [settingsMsg,  setSettingsMsg]  = useState('');
  const [settingsErr,  setSettingsErr]  = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) { router.push('/'); return; }
      if (u.email === ADMIN_EMAIL) { router.push('/admin'); return; }
      setUser(u);
      setSettingsName(u.displayName || '');

      const q = query(collection(db, 'requests'), where('userId', '==', u.uid));
      const unsubReq = onSnapshot(q, (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setRequests(docs);
        setLoading(false);
      }, () => setLoading(false));

      unsubReqRef.current = unsubReq;
    });

    return () => {
      unsubAuth();
      if (unsubReqRef.current) unsubReqRef.current();
    };
  }, [router]);

  useEffect(() => {
    if (!user || !requests[0]) return;
    const req = requests[0];
    getDocs(query(collection(db, 'reviews'),
      where('userId', '==', user.uid),
      where('requestId', '==', req.id)
    )).then(snap => { if (!snap.empty) setAlreadyReview(true); });
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
    setReviewBusy(false);
    setReviewDone(true);
    setAlreadyReview(true);
  };

  const saveName = async () => {
    if (!settingsName.trim()) { setSettingsErr('Name cannot be empty.'); return; }
    setSettingsBusy(true); setSettingsErr(''); setSettingsMsg('');
    try {
      await updateProfile(user, { displayName: settingsName.trim() });
      setSettingsMsg('Name updated!');
    } catch { setSettingsErr('Failed to update name.'); }
    setSettingsBusy(false);
  };

  const savePassword = async () => {
    if (!currentPass || !newPass) { setSettingsErr('Fill in both fields.'); return; }
    if (newPass.length < 6) { setSettingsErr('At least 6 characters required.'); return; }
    setSettingsBusy(true); setSettingsErr(''); setSettingsMsg('');
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPass);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPass);
      setSettingsMsg('Password updated!');
      setCurrentPass(''); setNewPass('');
    } catch (e) {
      setSettingsErr(e.code === 'auth/wrong-password' ? 'Current password is incorrect.' : 'Failed to update password.');
    }
    setSettingsBusy(false);
  };

  if (loading) return <div className="spinner-page"><div className="spinner"></div></div>;

  const latest      = requests[0] || null;
  const allDone     = requests.filter(r => r.status === 'done').length;
  const isDone      = latest?.status === 'done';
  const isConfirmed = latest?.status === 'confirmed';
  const isNew       = latest?.status === 'new';
  const statusLabel = isNew ? 'Pending Review' : isConfirmed ? 'Confirmed' : 'Completed';
  const statusColor = isNew ? '#f59e0b' : isConfirmed ? '#10b981' : '#6b7280';
  const firstName   = user?.displayName?.split(' ')[0] || 'there';
  const loyalty     = getLoyaltyTier(allDone);
  const countdown   = isConfirmed ? getCountdown(latest?.date) : null;
  const isGoogleUser = user?.providerData?.[0]?.providerId === 'google.com';

  const TABS = [
    { id: 'home',     label: 'Home'     },
    ...(latest && !isDone ? [
      { id: 'messages', label: 'Messages' },
      { id: 'request',  label: 'My Quote' },
    ] : []),
    { id: 'settings', label: 'Settings' },
  ];
  const safeTab = TABS.find(t => t.id === activeTab) ? activeTab : 'home';

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>

      {/* NAV */}
      <nav style={{ background: '#0d0d0d', borderBottom: '1px solid #1f1f1f', padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="nav-brand">Yoselin's <span>Cleaning</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {user?.photoURL
            ? <img src={user.photoURL} className="nav-avatar" alt="" />
            : <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(135deg,#1a6fd4,#db2777)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '.85rem' }}>{firstName[0]?.toUpperCase()}</div>
          }
          <span style={{ fontSize: '.8rem', color: '#9ca3af' }}>{firstName}</span>
          <button className="signout-btn" onClick={() => { signOut(auth); router.push('/'); }}>Sign Out</button>
        </div>
      </nav>

      {/* HERO */}
      <div style={{ background: 'linear-gradient(135deg,#0d0d0d 0%,#1a1040 100%)', padding: '24px 24px 20px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.5rem', fontWeight: '900', color: 'white', marginBottom: '4px' }}>
              Hey, {firstName}!
            </h1>
            <p style={{ color: '#6b7280', fontSize: '.85rem' }}>
              {isDone ? 'Your cleaning is complete - thank you!' :
               isConfirmed ? 'Your appointment is confirmed!' :
               latest ? 'We are reviewing your request.' :
               'Welcome to your cleaning portal.'}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            {/* Loyalty badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', background: loyalty.bg, border: '1px solid ' + loyalty.color + '44', borderRadius: '99px', padding: '6px 13px' }}>
              <span style={{ fontSize: '.73rem', fontWeight: '700', color: loyalty.color }}>{loyalty.label}</span>
              {allDone > 0 && <span style={{ fontSize: '.68rem', color: loyalty.color, opacity: .7 }}>{allDone} job{allDone !== 1 ? 's' : ''}</span>}
            </div>
            {/* Status chip */}
            {latest && (
              <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '12px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '.68rem', color: '#6b7280', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '2px' }}>Your Booking</div>
                  <div style={{ fontSize: '.85rem', fontWeight: '700', color: statusColor }}>{statusLabel}</div>
                  <div style={{ fontSize: '.75rem', color: '#9ca3af' }}>${latest.estimate} estimate</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TABS */}
      <div style={{ background: '#141414', borderBottom: '1.5px solid #2a2a2a', display: 'flex', padding: '0 8px', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            flex: 1, minWidth: '70px', padding: '13px 8px 11px',
            background: 'none', border: 'none',
            borderBottom: safeTab === t.id ? '3px solid #60a5fa' : '3px solid transparent',
            fontSize: '.82rem', fontWeight: '700',
            color: safeTab === t.id ? '#60a5fa' : '#6b7280',
            cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '20px 16px 80px' }}>

        {/* HOME TAB */}
        {safeTab === 'home' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* Countdown banner */}
            {isConfirmed && countdown && (
              <div style={{
                background: countdown.urgent ? 'linear-gradient(135deg,rgba(16,185,129,.12),rgba(6,95,70,.18))' : 'linear-gradient(135deg,rgba(26,111,212,.1),rgba(219,39,119,.06))',
                border: '1.5px solid ' + (countdown.urgent ? '#10b981' : '#1a6fd4') + '33',
                borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px',
              }}>
                <div style={{ width: '54px', height: '54px', borderRadius: '50%', flexShrink: 0, background: countdown.urgent ? 'rgba(16,185,129,.18)' : 'rgba(26,111,212,.18)', border: '2px solid ' + (countdown.urgent ? '#10b981' : '#1a6fd4'), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  {countdown.days <= 1
                    ? <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>:)</span>
                    : <>
                        <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: '900', fontSize: '1.4rem', color: 'white', lineHeight: 1 }}>{countdown.days}</span>
                        <span style={{ fontSize: '.55rem', color: '#9ca3af', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.5px' }}>days</span>
                      </>
                  }
                </div>
                <div>
                  <div style={{ fontSize: '.7rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '2px' }}>
                    {countdown.urgent ? 'Coming Up!' : 'Upcoming Cleaning'}
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: '800', color: 'white', marginBottom: '2px' }}>
                    {countdown.days === 0 ? 'Your cleaning is TODAY!' : countdown.days === 1 ? 'Your cleaning is TOMORROW!' : 'Cleaning in ' + countdown.days + ' days'}
                  </div>
                  <div style={{ fontSize: '.8rem', color: '#9ca3af' }}>
                    {latest.date}{latest.time && latest.time !== 'N/A' ? ' at ' + latest.time : ''}
                  </div>
                </div>
              </div>
            )}

            {/* Main card */}
            {!latest ? (
              <div style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '18px', padding: '40px 24px', textAlign: 'center' }}>
                <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.3rem', fontWeight: '700', color: 'white', marginBottom: '8px' }}>Get Your Free Quote</h2>
                <p style={{ color: '#9ca3af', fontSize: '.85rem', marginBottom: '24px', lineHeight: '1.6' }}>Fill out a quick form and get a custom estimate. No commitment needed.</p>
                <button onClick={() => router.push('/book')} style={{ padding: '13px 32px', background: 'linear-gradient(135deg,#1a6fd4,#db2777)', color: 'white', border: 'none', borderRadius: '12px', fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.95rem', cursor: 'pointer' }}>
                  Get a Quote
                </button>
              </div>
            ) : isDone ? (
              <div style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '18px', padding: '36px 24px', textAlign: 'center' }}>
                <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.3rem', fontWeight: '700', color: 'white', marginBottom: '8px' }}>Job Complete!</h2>
                <p style={{ color: '#9ca3af', fontSize: '.85rem', marginBottom: '24px', lineHeight: '1.6' }}>Your cleaning has been marked complete. Hope everything is sparkling!</p>
                <button onClick={() => router.push('/book')} style={{ padding: '13px 32px', background: 'linear-gradient(135deg,#1a6fd4,#db2777)', color: 'white', border: 'none', borderRadius: '12px', fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.95rem', cursor: 'pointer' }}>
                  Book Again
                </button>
              </div>
            ) : (
              <div style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '16px', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '.7rem', color: '#6b7280', fontWeight: '700', letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: '5px' }}>Booking #{latest.id.slice(-6).toUpperCase()}</div>
                  <div style={{ color: '#d1d5db', fontSize: '.85rem', marginBottom: '3px' }}>{latest.date || 'TBD'} at {latest.time || 'TBD'}</div>
                  <div style={{ color: '#6b7280', fontSize: '.8rem' }}>{latest.address}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.8rem', fontWeight: '900', background: 'linear-gradient(135deg,#f472b6,#4a9eff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>${latest.estimate}</div>
                  <div style={{ fontSize: '.7rem', color: '#6b7280' }}>Estimate</div>
                </div>
              </div>
            )}

            {/* Status progress bar */}
            {latest && !isDone && (
              <div style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '16px', padding: '18px 20px' }}>
                <div style={{ fontSize: '.72rem', color: '#6b7280', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '14px' }}>Booking Progress</div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {[{ label: 'Submitted', done: true }, { label: 'In Review', done: isConfirmed }, { label: 'Confirmed', done: isConfirmed }, { label: 'Complete', done: false }].map((s, i, arr) => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', flex: i < arr.length - 1 ? 1 : 'none' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: s.done ? '#db2777' : '#2a2a2a', border: '2px solid ' + (s.done ? '#db2777' : '#3a3a3a'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.72rem', color: s.done ? 'white' : '#555', fontWeight: '700' }}>
                          {s.done ? 'v' : i + 1}
                        </div>
                        <span style={{ fontSize: '.6rem', color: s.done ? '#d1d5db' : '#555', fontWeight: '600', textAlign: 'center', width: '52px' }}>{s.label}</span>
                      </div>
                      {i < arr.length - 1 && (
                        <div style={{ flex: 1, height: '2px', background: s.done && arr[i + 1].done ? '#db2777' : '#2a2a2a', margin: '0 2px', marginBottom: '18px' }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Review card */}
            {isDone && !alreadyReview && (
              <div style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #2a2a2a', fontWeight: '700', color: 'white', fontSize: '.92rem' }}>Leave a Review</div>
                <div style={{ padding: '18px 20px' }}>
                  {reviewDone ? (
                    <div style={{ textAlign: 'center', padding: '16px 0' }}>
                      <div style={{ fontFamily: 'Playfair Display, serif', fontWeight: '700', color: 'white', fontSize: '1.05rem', marginBottom: '5px' }}>Thank you for your review!</div>
                      <div style={{ color: '#9ca3af', fontSize: '.83rem' }}>It will appear on our homepage.</div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                        {[1, 2, 3, 4, 5].map(s => (
                          <button key={s} onMouseEnter={() => setHoverStar(s)} onMouseLeave={() => setHoverStar(0)} onClick={() => setReviewStars(s)}
                            style={{ fontSize: '1.8rem', background: 'none', border: 'none', cursor: 'pointer', opacity: s <= (hoverStar || reviewStars) ? 1 : 0.2, transition: 'all .12s', lineHeight: 1, padding: '2px' }}>
                            *
                          </button>
                        ))}
                        <span style={{ color: '#9ca3af', fontSize: '.82rem', alignSelf: 'center', marginLeft: '6px' }}>{reviewStars} star{reviewStars !== 1 ? 's' : ''}</span>
                      </div>
                      <textarea value={reviewText} onChange={e => setReviewText(e.target.value)} placeholder="Tell others about your experience..." rows={3}
                        style={{ width: '100%', padding: '12px 14px', background: '#1f1f1f', border: '1.5px solid #2a2a2a', borderRadius: '12px', color: 'white', fontSize: '.87rem', fontFamily: "'DM Sans', sans-serif", outline: 'none', resize: 'vertical', marginBottom: '12px' }} />
                      <button onClick={submitReview} disabled={reviewBusy || !reviewText.trim()} style={{ width: '100%', padding: '13px', background: reviewText.trim() ? 'linear-gradient(135deg,#f59e0b,#db2777)' : '#1f1f1f', color: reviewText.trim() ? 'white' : '#4b5563', border: 'none', borderRadius: '12px', fontSize: '.92rem', fontWeight: '700', cursor: reviewText.trim() ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif" }}>
                        {reviewBusy ? 'Submitting...' : 'Submit Review'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {isDone && alreadyReview && !reviewDone && (
              <div style={{ background: 'rgba(16,185,129,.07)', border: '1px solid rgba(16,185,129,.2)', borderRadius: '12px', padding: '13px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ fontWeight: '700', color: '#10b981', fontSize: '.87rem' }}>Review Submitted - Thank you!</div>
              </div>
            )}

            {/* Loyalty progress */}
            <div style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '16px', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '.68rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }}>Loyalty Status</div>
                  <div style={{ fontFamily: 'Playfair Display, serif', fontWeight: '700', color: loyalty.color, fontSize: '.95rem' }}>{loyalty.label}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.8rem', fontWeight: '900', color: 'white', lineHeight: 1 }}>{allDone}</div>
                  <div style={{ fontSize: '.68rem', color: '#6b7280', marginTop: '2px' }}>job{allDone !== 1 ? 's' : ''} done</div>
                </div>
              </div>
              {loyalty.next ? (
                <>
                  <div style={{ height: '6px', background: '#2a2a2a', borderRadius: '99px', overflow: 'hidden', marginBottom: '6px' }}>
                    <div style={{ height: '100%', width: Math.min(100, (allDone / loyalty.nextAt) * 100) + '%', background: 'linear-gradient(90deg,' + loyalty.color + ',' + loyalty.color + '99)', borderRadius: '99px', transition: 'width .5s' }} />
                  </div>
                  <div style={{ fontSize: '.7rem', color: '#6b7280', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{allDone} / {loyalty.nextAt}</span>
                    <span>{loyalty.nextAt - allDone} more to {loyalty.next}</span>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '.78rem', color: loyalty.color, fontWeight: '700', textAlign: 'center' }}>Highest tier - thank you for your loyalty!</div>
              )}
            </div>

            {/* Quick action tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {latest && !isDone && (
                <div onClick={() => setActiveTab('messages')} style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '14px', padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(26,111,212,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.8rem', fontWeight: '700', color: '#60a5fa' }}>MSG</div>
                  <div><div style={{ fontWeight: '700', color: 'white', fontSize: '.85rem' }}>Messages</div><div style={{ fontSize: '.72rem', color: '#6b7280' }}>Chat with us</div></div>
                </div>
              )}
              {latest && !isDone && (
                <div onClick={() => setActiveTab('request')} style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '14px', padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(219,39,119,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.8rem', fontWeight: '700', color: '#f472b6' }}>QTE</div>
                  <div><div style={{ fontWeight: '700', color: 'white', fontSize: '.85rem' }}>My Quote</div><div style={{ fontSize: '.72rem', color: '#6b7280' }}>View details</div></div>
                </div>
              )}
              <div onClick={() => router.push('/book')} style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '14px', padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(16,185,129,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.8rem', fontWeight: '700', color: '#34d399' }}>NEW</div>
                <div><div style={{ fontWeight: '700', color: 'white', fontSize: '.85rem' }}>{latest ? 'New Quote' : 'Get a Quote'}</div><div style={{ fontSize: '.72rem', color: '#6b7280' }}>Instant estimate</div></div>
              </div>
              <div onClick={() => setActiveTab('settings')} style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '14px', padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(156,163,175,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.8rem', fontWeight: '700', color: '#9ca3af' }}>SET</div>
                <div><div style={{ fontWeight: '700', color: 'white', fontSize: '.85rem' }}>Settings</div><div style={{ fontSize: '.72rem', color: '#6b7280' }}>Update your info</div></div>
              </div>
            </div>
          </div>
        )}

        {/* MESSAGES TAB */}
        {safeTab === 'messages' && latest && !isDone && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.1rem', fontWeight: '700', color: 'white' }}>Messages</div>
            <div style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '16px', overflow: 'hidden' }}>
              <Chat requestId={latest.id} currentUser={user} senderRole="customer" onClose={null} inline={true} />
            </div>
          </div>
        )}

        {/* MY QUOTE TAB */}
        {safeTab === 'request' && latest && !isDone && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.1rem', fontWeight: '700', color: 'white' }}>Quote Details</div>
            <div style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '16px', overflow: 'hidden' }}>
              <div style={{ background: '#0d0d0d', padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '.7rem', color: '#6b7280', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }}>Your Estimate</div>
                  <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '2.2rem', fontWeight: '900', background: 'linear-gradient(135deg,#f472b6,#4a9eff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>${latest.estimate}</div>
                  <div style={{ fontSize: '.7rem', color: '#6b7280', marginTop: '3px' }}>Final price confirmed before service</div>
                </div>
                <span className={'badge badge-' + latest.status}>{statusLabel}</span>
              </div>
              <div style={{ padding: '8px 22px' }}>
                {[
                  ['Date',       latest.date || 'TBD'],
                  ['Time',       latest.time || 'TBD'],
                  ['Address',    latest.address],
                  ['Frequency',  latest.frequency],
                  ['Bathrooms',  latest.bathrooms],
                  ['Rooms',      latest.rooms],
                  ['Add-Ons',    latest.addons || 'None'],
                  ['Pets',       latest.pets === 'yes' ? 'Yes' : 'No'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', padding: '10px 0', borderBottom: '1px solid #2a2a2a' }}>
                    <span style={{ fontSize: '.78rem', color: '#6b7280', fontWeight: '600', minWidth: '100px' }}>{k}</span>
                    <span style={{ fontSize: '.82rem', fontWeight: '600', color: '#d1d5db', textAlign: 'right' }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '16px 22px' }}>
                <button onClick={() => setActiveTab('messages')} style={{ width: '100%', padding: '13px', background: 'linear-gradient(135deg,#1a6fd4,#db2777)', color: 'white', border: 'none', borderRadius: '12px', fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.92rem', cursor: 'pointer' }}>
                  Send a Message
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {safeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.1rem', fontWeight: '700', color: 'white' }}>Account Settings</div>

            {settingsMsg && <div style={{ padding: '12px 16px', borderRadius: '12px', fontSize: '.84rem', fontWeight: '600', background: '#d1fae5', color: '#065f46' }}>{settingsMsg}</div>}
            {settingsErr && <div style={{ padding: '12px 16px', borderRadius: '12px', fontSize: '.84rem', fontWeight: '600', background: '#fee2e2', color: '#dc2626' }}>{settingsErr}</div>}

            <div style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '16px', padding: '20px' }}>
              <div style={{ fontSize: '.75rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '16px' }}>Profile</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px', paddingBottom: '18px', borderBottom: '1px solid #2a2a2a' }}>
                {user?.photoURL
                  ? <img src={user.photoURL} style={{ width: '44px', height: '44px', borderRadius: '50%' }} alt="" />
                  : <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg,#1a6fd4,#db2777)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '1.1rem' }}>{firstName[0]?.toUpperCase()}</div>
                }
                <div>
                  <div style={{ fontWeight: '700', color: 'white', fontSize: '.9rem' }}>{user?.displayName || 'No name set'}</div>
                  <div style={{ fontSize: '.78rem', color: '#9ca3af', marginTop: '2px' }}>{user?.email}</div>
                </div>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '.8rem', fontWeight: '700', color: '#d1d5db', marginBottom: '6px' }}>Display Name</label>
                <input type="text" value={settingsName} onChange={e => setSettingsName(e.target.value)} placeholder="Your full name"
                  style={{ width: '100%', padding: '10px 13px', background: '#1f1f1f', border: '1.5px solid #2a2a2a', borderRadius: '10px', color: 'white', fontSize: '.87rem', fontFamily: "'DM Sans', sans-serif", outline: 'none' }} />
              </div>
              <button onClick={saveName} disabled={settingsBusy} style={{ padding: '11px 22px', background: 'linear-gradient(135deg,#1a6fd4,#db2777)', color: 'white', border: 'none', borderRadius: '10px', fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.88rem', cursor: 'pointer' }}>
                {settingsBusy ? 'Saving...' : 'Save Name'}
              </button>
            </div>

            {!isGoogleUser && (
              <div style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '16px', padding: '20px' }}>
                <div style={{ fontSize: '.75rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '16px' }}>Change Password</div>
                {[['Current Password', currentPass, setCurrentPass], ['New Password', newPass, setNewPass]].map(([label, val, setter]) => (
                  <div key={label} style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '.8rem', fontWeight: '700', color: '#d1d5db', marginBottom: '6px' }}>{label}</label>
                    <input type="password" value={val} onChange={e => setter(e.target.value)} placeholder={label === 'New Password' ? 'At least 6 characters' : ''}
                      style={{ width: '100%', padding: '10px 13px', background: '#1f1f1f', border: '1.5px solid #2a2a2a', borderRadius: '10px', color: 'white', fontSize: '.87rem', fontFamily: "'DM Sans', sans-serif", outline: 'none' }} />
                  </div>
                ))}
                <button onClick={savePassword} disabled={settingsBusy} style={{ padding: '11px 22px', background: 'linear-gradient(135deg,#1a6fd4,#db2777)', color: 'white', border: 'none', borderRadius: '10px', fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.88rem', cursor: 'pointer' }}>
                  {settingsBusy ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            )}

            {isGoogleUser && (
              <div style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '16px', padding: '20px' }}>
                <div style={{ fontSize: '.75rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '8px' }}>Password</div>
                <p style={{ color: '#9ca3af', fontSize: '.84rem' }}>You signed in with Google. Manage your password through your Google account.</p>
              </div>
            )}

            <div style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '16px', padding: '20px' }}>
              <div style={{ fontSize: '.75rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '8px' }}>Sign Out</div>
              <p style={{ color: '#9ca3af', fontSize: '.84rem', marginBottom: '14px' }}>This will sign you out on this device.</p>
              <button onClick={() => { signOut(auth); router.push('/'); }} style={{ padding: '11px 22px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '10px', fontFamily: "'DM Sans', sans-serif", fontWeight: '700', fontSize: '.88rem', cursor: 'pointer' }}>
                Sign Out
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

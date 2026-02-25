'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from '../../lib/firebase';
import Chat from '../../components/Chat';

// ── Checklist items shown when confirmed ──────────────────
const CHECKLIST = [
  { id: 'counters',  text: 'Clear countertops and surfaces' },
  { id: 'pets',      text: 'Secure or move pets to another room' },
  { id: 'floors',    text: 'Pick up personal items from floors' },
  { id: 'access',    text: 'Ensure we have access to your home' },
  { id: 'off-limit', text: 'Note any off-limit areas in your booking' },
  { id: 'products',  text: 'Mention any product allergies in your notes' },
];

// ── Loyalty tiers ────────────────────────────────────────
function getLoyaltyTier(completedCount) {
  if (completedCount >= 8) return { label: 'VIP Client',       icon: '💎', color: '#7c3aed', bg: 'rgba(124,58,237,.15)', next: null,         nextAt: null };
  if (completedCount >= 5) return { label: 'Gold Client',      icon: '🥇', color: '#f59e0b', bg: 'rgba(245,158,11,.15)', next: 'VIP',        nextAt: 8 };
  if (completedCount >= 3) return { label: 'Regular Client',   icon: '🥈', color: '#9ca3af', bg: 'rgba(156,163,175,.15)',next: 'Gold',       nextAt: 5 };
  if (completedCount >= 1) return { label: 'Returning Client', icon: '✨', color: '#10b981', bg: 'rgba(16,185,129,.15)', next: 'Regular',    nextAt: 3 };
  return                          { label: 'New Client',        icon: '🌟', color: '#60a5fa', bg: 'rgba(96,165,250,.15)', next: 'Returning',  nextAt: 1 };
}

// ── Parse date string into JS Date ───────────────────────
function parseAppointmentDate(str) {
  if (!str || str === 'N/A' || str === 'TBD' || str === 'Flexible') return null;
  // Try direct parse first
  const d = new Date(str);
  if (!isNaN(d)) return d;
  // Try "Monday, March 10" style (assume current/next year)
  const stripped = str.replace(/^[A-Za-z]+,\s*/, '');
  const d2 = new Date(stripped + ' ' + new Date().getFullYear());
  if (!isNaN(d2)) return d2;
  return null;
}

function getCountdown(dateStr) {
  const appt = parseAppointmentDate(dateStr);
  if (!appt) return null;
  const now = new Date();
  const diffMs = appt.setHours(0,0,0,0) - now.setHours(0,0,0,0);
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0)  return null; // past
  if (days === 0) return { days: 0, label: 'Today!',    urgent: true };
  if (days === 1) return { days: 1, label: 'Tomorrow!', urgent: true };
  return { days, label: `${days} days away`, urgent: false };
}

export default function DashboardPage() {
  const router = useRouter();
  const [user,      setUser]      = useState(null);
  const [request,   setRequest]   = useState(null);
  const [allDone,   setAllDone]   = useState(0); // total completed jobs for loyalty
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  const [authError, setAuthError] = useState(false);

  // Checklist
  const [checked, setChecked] = useState({});

  // Review
  const [reviewStars,   setReviewStars]   = useState(5);
  const [reviewText,    setReviewText]    = useState('');
  const [reviewBusy,    setReviewBusy]    = useState(false);
  const [reviewDone,    setReviewDone]    = useState(false);
  const [alreadyReview, setAlreadyReview] = useState(false);

  // Settings
  const [settingsName, setSettingsName] = useState('');
  const [currentPass,  setCurrentPass]  = useState('');
  const [newPass,      setNewPass]      = useState('');
  const [settingsMsg,  setSettingsMsg]  = useState('');
  const [settingsErr,  setSettingsErr]  = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);

  // Countdown ticker
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // ── Auth ──────────────────────────────────────────────
  useEffect(() => {
    let timeout;
    try {
      const unsub = onAuthStateChanged(auth, (u) => {
        clearTimeout(timeout);
        if (!u) { router.push('/'); return; }
        if (u.email === ADMIN_EMAIL) { router.push('/admin'); return; }
        setUser(u);
        setSettingsName(u.displayName || '');
      });
      timeout = setTimeout(() => { setLoading(false); setAuthError(true); }, 8000);
      return () => { unsub(); clearTimeout(timeout); };
    } catch { setLoading(false); setAuthError(true); }
  }, [router]);

  // ── Request + all-time jobs listener ─────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'requests'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      if (!snap.empty) {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setRequest(docs[0]);
        setAllDone(docs.filter(d => d.status === 'done').length);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  // ── Check if already reviewed ─────────────────────────
  useEffect(() => {
    if (!user || !request) return;
    const check = async () => {
      const snap = await getDocs(query(collection(db, 'reviews'), where('userId', '==', user.uid), where('requestId', '==', request.id)));
      if (!snap.empty) setAlreadyReview(true);
    };
    check();
  }, [user, request]);

  // ── Submit review ─────────────────────────────────────
  const submitReview = async () => {
    if (!reviewText.trim()) return;
    setReviewBusy(true);
    await addDoc(collection(db, 'reviews'), {
      userId:    user.uid,
      requestId: request.id,
      name:      user.displayName || user.email.split('@')[0],
      stars:     reviewStars,
      text:      reviewText.trim(),
      date:      new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      createdAt: serverTimestamp(),
    });
    setReviewBusy(false);
    setReviewDone(true);
    setAlreadyReview(true);
  };

  // ── Settings ──────────────────────────────────────────
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
    if (newPass.length < 6) { setSettingsErr('New password must be at least 6 characters.'); return; }
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

  if (authError) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0d0d0d',padding:'20px'}}>
      <div style={{background:'#181818',border:'1.5px solid #2a2a2a',borderRadius:'24px',padding:'48px 38px',maxWidth:'440px',textAlign:'center'}}>
        <div style={{fontSize:'2.5rem',marginBottom:'12px'}}>🛡️</div>
        <h2 style={{color:'white',fontFamily:"'Playfair Display',serif",fontSize:'1.5rem',marginBottom:'8px'}}>Connection Blocked</h2>
        <p style={{color:'#9ca3af',fontSize:'.9rem',lineHeight:1.6,marginBottom:'20px'}}>An ad blocker may be preventing this page. Please disable it and refresh.</p>
        <button onClick={() => window.location.reload()} style={{padding:'12px 28px',background:'linear-gradient(135deg,#1a6fd4,#db2777)',color:'white',border:'none',borderRadius:'12px',fontSize:'.95rem',fontWeight:700,cursor:'pointer'}}>Refresh Page</button>
      </div>
    </div>
  );

  // ── Derived values ────────────────────────────────────
  const firstName   = user?.displayName?.split(' ')[0] || 'there';
  const isDone      = request?.status === 'done';
  const isConfirmed = request?.status === 'confirmed';
  const statusLabel = request?.status === 'new' ? 'Pending Review' : request?.status === 'confirmed' ? 'Confirmed ✅' : 'Completed 🏁';
  const statusColor = request?.status === 'new' ? '#f59e0b' : request?.status === 'confirmed' ? '#10b981' : '#6b7280';
  const isGoogleUser = user?.providerData?.[0]?.providerId === 'google.com';

  const countdown = isConfirmed ? getCountdown(request?.date) : null;
  const loyalty   = getLoyaltyTier(allDone);

  // Tabs — hide Messages & My Quote when job is done
  const tabs = [
    { id: 'home',     label: 'Home',     icon: '🏠' },
    ...(!isDone ? [
      { id: 'messages', label: 'Messages', icon: '💬' },
      { id: 'request',  label: 'My Quote', icon: '📋' },
    ] : []),
    { id: 'settings', label: 'Settings',  icon: '⚙️' },
  ];
  const safeTab = tabs.find(t => t.id === activeTab) ? activeTab : 'home';

  return (
    <div className="cd-root">

      {/* NAV */}
      <nav className="cd-nav">
        <div className="cd-nav-brand">✨ Yoselins Cleaning</div>
        <div className="cd-nav-right">
          {user?.photoURL
            ? <img src={user.photoURL} className="nav-avatar" alt="" />
            : <div className="cd-avatar-initials">{firstName[0]?.toUpperCase()}</div>
          }
          <span className="cd-nav-name">{firstName}</span>
          <button className="signout-btn" onClick={() => { signOut(auth); router.push('/'); }}>Sign Out</button>
        </div>
      </nav>

      {/* HERO */}
      <div className="cd-hero">
        <div className="cd-hero-inner">
          <div className="cd-hero-left">
            <h1>Hey, {firstName} 👋</h1>
            <p>{isDone ? 'Your cleaning is complete — thank you!' : 'Welcome to your cleaning portal'}</p>
          </div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'8px'}}>
            {/* Loyalty badge in hero */}
            <div style={{display:'flex',alignItems:'center',gap:'8px',background:loyalty.bg,border:`1px solid ${loyalty.color}44`,borderRadius:'99px',padding:'6px 14px'}}>
              <span style={{fontSize:'1.1rem'}}>{loyalty.icon}</span>
              <span style={{fontSize:'.75rem',fontWeight:700,color:loyalty.color}}>{loyalty.label}</span>
              {allDone > 0 && <span style={{fontSize:'.7rem',color:loyalty.color,opacity:.7}}>· {allDone} cleaning{allDone!==1?'s':''}</span>}
            </div>
            {request && (
              <div className="cd-hero-status">
                <div className="chs-icon">{isDone?'🏁':isConfirmed?'✅':'⏳'}</div>
                <div>
                  <div className="chs-label">Your Booking</div>
                  <div className="chs-status" style={{color:statusColor}}>{statusLabel}</div>
                  <div className="chs-price">${request.estimate} estimate</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TAB BAR */}
      <div className="cd-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`cd-tab ${safeTab===t.id?'active':''}`} onClick={() => setActiveTab(t.id)}>
            <span className="cd-tab-icon">{t.icon}</span>
            <span className="cd-tab-label">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="cd-body">

        {/* ══════════════════════════════════════
            HOME TAB
        ══════════════════════════════════════ */}
        {safeTab === 'home' && (
          <div className="cd-home">

            {/* ── Countdown Banner (confirmed only) ── */}
            {isConfirmed && countdown && (
              <div style={{
                background: countdown.urgent
                  ? 'linear-gradient(135deg, rgba(16,185,129,.15), rgba(6,95,70,.2))'
                  : 'linear-gradient(135deg, rgba(26,111,212,.12), rgba(219,39,119,.08))',
                border: `1.5px solid ${countdown.urgent ? '#10b981' : '#1a6fd4'}44`,
                borderRadius:'18px', padding:'18px 22px',
                display:'flex', alignItems:'center', gap:'16px',
              }}>
                <div style={{
                  width:'60px', height:'60px', borderRadius:'50%', flexShrink:0,
                  background: countdown.urgent ? 'rgba(16,185,129,.2)' : 'rgba(26,111,212,.2)',
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                  border:`2px solid ${countdown.urgent ? '#10b981' : '#1a6fd4'}`,
                }}>
                  <span style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:countdown.days===0||countdown.days===1?'1.3rem':'1.5rem',color:'white',lineHeight:1}}>
                    {countdown.days === 0 ? '🎉' : countdown.days}
                  </span>
                  {countdown.days > 1 && <span style={{fontSize:'.6rem',color:'#9ca3af',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px'}}>days</span>}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:'.72rem',fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'3px'}}>
                    {countdown.urgent ? '🎉 Appointment Coming Up!' : '📅 Upcoming Appointment'}
                  </div>
                  <div style={{fontSize:'1.05rem',fontWeight:800,color:'white',marginBottom:'2px'}}>
                    {countdown.days === 0 ? 'Your cleaning is today!' :
                     countdown.days === 1 ? 'Your cleaning is tomorrow!' :
                     `Your cleaning is in ${countdown.days} days`}
                  </div>
                  <div style={{fontSize:'.8rem',color:'#9ca3af'}}>
                    📅 {request.date}{request.time ? ` · ${request.time}` : ''}
                  </div>
                </div>
              </div>
            )}

            {/* ── Main Status Card ── */}
            {!request ? (
              <div className="cd-welcome-card">
                <div className="cwc-bg" />
                <div className="cwc-content">
                  <div className="cwc-icon">✨</div>
                  <h2>Get Your Free Quote</h2>
                  <p>Fill out a quick form and we'll send you a custom estimate. No commitment needed.</p>
                  <button className="cd-btn-primary cwc-btn" onClick={() => router.push('/book')}>Get a Quote →</button>
                </div>
              </div>
            ) : isDone ? (
              <div className="cd-welcome-card">
                <div className="cwc-bg" />
                <div className="cwc-content">
                  <div className="cwc-icon">🏁</div>
                  <h2>Job Complete!</h2>
                  <p>Your cleaning has been marked complete. Hope everything looks sparkling! Need another clean?</p>
                  <button className="cd-btn-primary cwc-btn" onClick={() => router.push('/book')}>Book Again →</button>
                </div>
              </div>
            ) : (
              <div className="cd-booking-banner">
                <div className="cbb-left">
                  <div className="cbb-ref">Booking #{request.id.slice(-6).toUpperCase()}</div>
                  <div className="cbb-date">📅 {request.date || 'Date TBD'} · {request.time || 'Time TBD'}</div>
                  <div className="cbb-addr">📍 {request.address}</div>
                </div>
                <div className="cbb-right">
                  <div className="cbb-price">${request.estimate}</div>
                  <div className="cbb-plabel">Estimate</div>
                </div>
              </div>
            )}

            {/* ── Pre-Clean Checklist (confirmed only) ── */}
            {isConfirmed && (
              <div style={{background:'#181818',border:'1.5px solid #2a2a2a',borderRadius:'18px',overflow:'hidden'}}>
                <div style={{padding:'14px 20px',borderBottom:'1px solid #2a2a2a',display:'flex',alignItems:'center',gap:'10px',background:'linear-gradient(135deg,rgba(26,111,212,.12),rgba(219,39,119,.06))'}}>
                  <span style={{fontSize:'1.2rem'}}>📋</span>
                  <div>
                    <div style={{fontWeight:700,color:'white',fontSize:'.92rem'}}>Pre-Clean Checklist</div>
                    <div style={{fontSize:'.72rem',color:'#6b7280',marginTop:'1px'}}>Help us do our best work — check these off before we arrive</div>
                  </div>
                  <div style={{marginLeft:'auto',fontSize:'.75rem',fontWeight:700,color:'#10b981'}}>
                    {Object.values(checked).filter(Boolean).length}/{CHECKLIST.length} done
                  </div>
                </div>
                <div style={{padding:'10px 16px'}}>
                  {CHECKLIST.map(item => (
                    <label key={item.id} style={{
                      display:'flex', alignItems:'center', gap:'12px',
                      padding:'10px 6px', cursor:'pointer',
                      borderBottom:'1px solid #1f1f1f',
                    }}>
                      <div onClick={() => setChecked(c => ({...c,[item.id]:!c[item.id]}))} style={{
                        width:'22px', height:'22px', borderRadius:'7px', flexShrink:0,
                        border:`2px solid ${checked[item.id] ? '#10b981' : '#3a3a3a'}`,
                        background: checked[item.id] ? '#10b981' : 'transparent',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        transition:'all .15s', cursor:'pointer',
                      }}>
                        {checked[item.id] && <span style={{color:'white',fontSize:'.8rem',fontWeight:900}}>✓</span>}
                      </div>
                      <span style={{
                        fontSize:'.86rem', fontWeight:600,
                        color: checked[item.id] ? '#6b7280' : '#d1d5db',
                        textDecoration: checked[item.id] ? 'line-through' : 'none',
                        transition:'all .2s',
                      }}>{item.text}</span>
                    </label>
                  ))}
                </div>
                {Object.values(checked).filter(Boolean).length === CHECKLIST.length && (
                  <div style={{padding:'12px 20px',background:'rgba(16,185,129,.1)',textAlign:'center',fontSize:'.84rem',fontWeight:700,color:'#10b981'}}>
                    🎉 All set! You're ready for your cleaning.
                  </div>
                )}
              </div>
            )}

            {/* ── Review Card (done only, not yet reviewed) ── */}
            {isDone && !alreadyReview && (
              <div style={{background:'#181818',border:'1.5px solid #2a2a2a',borderRadius:'18px',overflow:'hidden'}}>
                <div style={{padding:'14px 20px',borderBottom:'1px solid #2a2a2a',background:'linear-gradient(135deg,rgba(245,158,11,.1),rgba(219,39,119,.06))'}}>
                  <div style={{fontWeight:700,color:'white',fontSize:'.95rem'}}>⭐ Leave a Review</div>
                  <div style={{fontSize:'.75rem',color:'#6b7280',marginTop:'2px'}}>Share your experience — it really helps!</div>
                </div>
                <div style={{padding:'18px 20px'}}>
                  {reviewDone ? (
                    <div style={{textAlign:'center',padding:'20px 0'}}>
                      <div style={{fontSize:'2.4rem',marginBottom:'10px'}}>🎉</div>
                      <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,color:'white',fontSize:'1.1rem',marginBottom:'6px'}}>Thank you!</div>
                      <div style={{color:'#9ca3af',fontSize:'.84rem'}}>Your review has been submitted and will appear on our homepage.</div>
                    </div>
                  ) : (
                    <>
                      {/* Star picker */}
                      <div style={{marginBottom:'16px'}}>
                        <div style={{fontSize:'.78rem',fontWeight:700,color:'#9ca3af',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'.4px'}}>Your Rating</div>
                        <div style={{display:'flex',gap:'8px'}}>
                          {[1,2,3,4,5].map(s => (
                            <button key={s} onClick={() => setReviewStars(s)} style={{
                              fontSize:'1.8rem', background:'none', border:'none', cursor:'pointer',
                              opacity: s <= reviewStars ? 1 : 0.25,
                              transform: s <= reviewStars ? 'scale(1.1)' : 'scale(1)',
                              transition:'all .15s', lineHeight:1, padding:'2px',
                            }}>⭐</button>
                          ))}
                        </div>
                      </div>
                      {/* Text */}
                      <div style={{marginBottom:'14px'}}>
                        <div style={{fontSize:'.78rem',fontWeight:700,color:'#9ca3af',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'.4px'}}>Your Review</div>
                        <textarea
                          value={reviewText}
                          onChange={e => setReviewText(e.target.value)}
                          placeholder="Tell others about your experience with Yoselin's Cleaning..."
                          rows={3}
                          style={{
                            width:'100%', padding:'12px 14px', background:'#1f1f1f',
                            border:'1.5px solid #2a2a2a', borderRadius:'12px', color:'white',
                            fontSize:'.87rem', fontFamily:"'DM Sans',sans-serif",
                            outline:'none', resize:'vertical', lineHeight:1.5,
                          }}
                        />
                      </div>
                      <button
                        onClick={submitReview}
                        disabled={reviewBusy || !reviewText.trim()}
                        style={{
                          width:'100%', padding:'13px',
                          background: reviewText.trim() ? 'linear-gradient(135deg,#f59e0b,#db2777)' : '#1f1f1f',
                          color: reviewText.trim() ? 'white' : '#4b5563',
                          border:'none', borderRadius:'12px', fontSize:'.92rem', fontWeight:700,
                          cursor: reviewText.trim() ? 'pointer' : 'not-allowed',
                          transition:'all .2s',
                        }}
                      >
                        {reviewBusy ? 'Submitting...' : '⭐ Submit Review'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Already reviewed badge */}
            {isDone && alreadyReview && !reviewDone && (
              <div style={{background:'rgba(16,185,129,.08)',border:'1px solid rgba(16,185,129,.2)',borderRadius:'14px',padding:'14px 18px',display:'flex',alignItems:'center',gap:'12px'}}>
                <span style={{fontSize:'1.4rem'}}>✅</span>
                <div>
                  <div style={{fontWeight:700,color:'#10b981',fontSize:'.88rem'}}>Review Submitted</div>
                  <div style={{fontSize:'.76rem',color:'#6b7280',marginTop:'1px'}}>Thank you for sharing your feedback!</div>
                </div>
              </div>
            )}

            {/* ── Loyalty Progress Card ── */}
            <div style={{background:'#181818',border:'1.5px solid #2a2a2a',borderRadius:'18px',padding:'18px 20px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
                <div>
                  <div style={{fontSize:'.72rem',fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'4px'}}>Loyalty Status</div>
                  <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                    <span style={{fontSize:'1.4rem'}}>{loyalty.icon}</span>
                    <span style={{fontFamily:"'Playfair Display',serif",fontWeight:700,color:loyalty.color,fontSize:'1.05rem'}}>{loyalty.label}</span>
                  </div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:'2rem',fontWeight:900,color:'white',lineHeight:1}}>{allDone}</div>
                  <div style={{fontSize:'.7rem',color:'#6b7280',marginTop:'2px'}}>cleaning{allDone!==1?'s':''} completed</div>
                </div>
              </div>
              {/* Progress bar */}
              {loyalty.next && (
                <>
                  <div style={{height:'6px',background:'#2a2a2a',borderRadius:'99px',overflow:'hidden',marginBottom:'6px'}}>
                    <div style={{
                      height:'100%',
                      width:`${Math.min(100, (allDone / loyalty.nextAt) * 100)}%`,
                      background:`linear-gradient(90deg, ${loyalty.color}, ${loyalty.color}99)`,
                      borderRadius:'99px', transition:'width .5s ease',
                    }}/>
                  </div>
                  <div style={{fontSize:'.72rem',color:'#6b7280',display:'flex',justifyContent:'space-between'}}>
                    <span>{allDone} / {loyalty.nextAt} cleanings</span>
                    <span>{loyalty.nextAt - allDone} more to reach <strong style={{color:'white'}}>{loyalty.next}</strong></span>
                  </div>
                </>
              )}
              {!loyalty.next && (
                <div style={{fontSize:'.78rem',color:loyalty.color,fontWeight:700,textAlign:'center',marginTop:'4px'}}>
                  💎 You've reached our highest tier — thank you for your loyalty!
                </div>
              )}
            </div>

            {/* ── Quick action tiles ── */}
            <div className="cd-tiles">
              {!isDone && (
                <>
                  <div className="cd-tile" onClick={() => setActiveTab('messages')} style={{opacity:request?1:.45,pointerEvents:request?'auto':'none'}}>
                    <div className="ct-icon-wrap ct-blue">💬</div>
                    <div className="ct-text"><div className="ct-title">Messages</div><div className="ct-sub">{request?'Chat with us':'Available after quote'}</div></div>
                    <div className="ct-arrow">›</div>
                  </div>
                  <div className="cd-tile" onClick={() => setActiveTab('request')} style={{opacity:request?1:.45,pointerEvents:request?'auto':'none'}}>
                    <div className="ct-icon-wrap ct-pink">📋</div>
                    <div className="ct-text"><div className="ct-title">My Quote</div><div className="ct-sub">{request?'View details':'No quote yet'}</div></div>
                    <div className="ct-arrow">›</div>
                  </div>
                </>
              )}
              <div className="cd-tile" onClick={() => router.push('/book')}>
                <div className="ct-icon-wrap ct-green">💰</div>
                <div className="ct-text"><div className="ct-title">{request?'New Quote':'Get a Quote'}</div><div className="ct-sub">Instant estimate</div></div>
                <div className="ct-arrow">›</div>
              </div>
              <div className="cd-tile" onClick={() => setActiveTab('settings')}>
                <div className="ct-icon-wrap ct-gray">⚙️</div>
                <div className="ct-text"><div className="ct-title">Settings</div><div className="ct-sub">Update your info</div></div>
                <div className="ct-arrow">›</div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            MESSAGES TAB
        ══════════════════════════════════════ */}
        {safeTab === 'messages' && !isDone && (
          <div className="cd-tab-panel">
            {!request ? (
              <div className="cd-empty-state">
                <div className="ces-icon">💬</div>
                <h3>No Messages Yet</h3>
                <p>Once you submit a quote request, you can message us directly here.</p>
                <button className="cd-btn-primary" onClick={() => router.push('/book')}>Get a Quote →</button>
              </div>
            ) : (
              <div className="cd-messages-wrap">
                <div className="cd-section-header">
                  <h3>Messages</h3>
                  <p>Questions or changes? Send us a message below.</p>
                </div>
                <Chat requestId={request.id} currentUser={user} senderRole="customer" onClose={null} inline={true} />
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════
            MY QUOTE TAB
        ══════════════════════════════════════ */}
        {safeTab === 'request' && !isDone && (
          <div className="cd-tab-panel">
            {!request ? (
              <div className="cd-empty-state">
                <div className="ces-icon">📋</div>
                <h3>No Quote Yet</h3>
                <p>Submit your first quote request and we'll get back to you within 24 hours.</p>
                <button className="cd-btn-primary" onClick={() => router.push('/book')}>Get a Quote →</button>
              </div>
            ) : (
              <div>
                <div className="cd-section-header">
                  <h3>Quote Details</h3>
                  <span className={`badge badge-${request.status}`}>{statusLabel}</span>
                </div>
                <div className="cd-detail-card">
                  <div className="cdc-price-row">
                    <div>
                      <div className="cdc-price-label">Your Estimate</div>
                      <div className="cdc-price">${request.estimate}</div>
                      <div className="cdc-price-note">Final price confirmed before service</div>
                    </div>
                    <div className="cdc-ref">#{request.id.slice(-6).toUpperCase()}</div>
                  </div>
                  <div className="cdc-grid">
                    {[
                      ['🏠 Building',  request.buildingType || 'Not specified'],
                      ['📅 Date',      request.date   || 'TBD'],
                      ['🕐 Time',      request.time   || 'TBD'],
                      ['📍 Address',   request.address],
                      ['🔁 Frequency', request.frequency],
                      ['🛁 Bathrooms', request.bathrooms],
                      ['🛏️ Rooms',    request.rooms],
                      ['✨ Add-Ons',   request.addons || 'None'],
                      ['🐾 Pets',      request.pets === 'yes' ? 'Yes' : 'No'],
                    ].map(([k,v]) => (
                      <div className="cdc-row" key={k}>
                        <span className="cdc-key">{k}</span>
                        <span className="cdc-val">{v}</span>
                      </div>
                    ))}
                  </div>
                  <button className="cd-btn-primary" style={{width:'100%',marginTop:'16px'}} onClick={() => setActiveTab('messages')}>
                    💬 Send a Message
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════
            SETTINGS TAB
        ══════════════════════════════════════ */}
        {safeTab === 'settings' && (
          <div className="cd-tab-panel">
            <div className="cd-section-header">
              <h3>Account Settings</h3>
              <p>Update your name and password</p>
            </div>
            {settingsMsg && <div className="cd-alert cd-alert-success">✅ {settingsMsg}</div>}
            {settingsErr && <div className="cd-alert cd-alert-error">⚠️ {settingsErr}</div>}

            <div className="cd-settings-card">
              <div className="csc-section-title">Profile</div>
              <div className="cd-settings-avatar">
                {user?.photoURL ? <img src={user.photoURL} alt="" /> : <div className="csa-initials">{firstName[0]?.toUpperCase()}</div>}
                <div><div className="csa-name">{user?.displayName || 'No name set'}</div><div className="csa-email">{user?.email}</div></div>
              </div>
              <div className="cd-settings-field">
                <label>Display Name</label>
                <input type="text" value={settingsName} onChange={e => setSettingsName(e.target.value)} placeholder="Your full name" />
              </div>
              <button className="cd-btn-primary" onClick={saveName} disabled={settingsBusy}>{settingsBusy?'Saving...':'Save Name'}</button>
            </div>

            {!isGoogleUser ? (
              <div className="cd-settings-card">
                <div className="csc-section-title">Change Password</div>
                <div className="cd-settings-field">
                  <label>Current Password</label>
                  <input type="password" value={currentPass} onChange={e => setCurrentPass(e.target.value)} placeholder="Enter current password" />
                </div>
                <div className="cd-settings-field">
                  <label>New Password</label>
                  <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="At least 6 characters" />
                </div>
                <button className="cd-btn-primary" onClick={savePassword} disabled={settingsBusy}>{settingsBusy?'Updating...':'Update Password'}</button>
              </div>
            ) : (
              <div className="cd-settings-card cd-settings-muted">
                <div className="csc-section-title">Password</div>
                <p>You signed in with Google. Manage your password through your Google account.</p>
              </div>
            )}

            <div className="cd-settings-card cd-danger-card">
              <div className="csc-section-title">Sign Out</div>
              <p>This will sign you out on this device.</p>
              <button className="cd-btn-danger" onClick={() => { signOut(auth); router.push('/'); }}>Sign Out</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential, sendEmailVerification } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, getDocs, deleteDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from '../../lib/firebase';
import { useUnreadCount } from '../../lib/useUnreadCount';
import Chat from '../../components/Chat';

// ── Loyalty tiers ─────────────────────────────────────
function getLoyaltyTier(count) {
  if (count >= 8) return { label: 'VIP Client',       icon: '💎', color: '#7c3aed', bg: 'rgba(124,58,237,.15)', next: null,      nextAt: null };
  if (count >= 5) return { label: 'Gold Client',      icon: '🥇', color: '#f59e0b', bg: 'rgba(245,158,11,.15)', next: 'VIP',     nextAt: 8 };
  if (count >= 3) return { label: 'Regular Client',   icon: '🥈', color: '#9ca3af', bg: 'rgba(156,163,175,.15)',next: 'Gold',    nextAt: 5 };
  if (count >= 1) return { label: 'Returning Client', icon: '✨', color: '#10b981', bg: 'rgba(16,185,129,.15)', next: 'Regular', nextAt: 3 };
  return                  { label: 'New Client',       icon: '🌟', color: '#60a5fa', bg: 'rgba(96,165,250,.15)', next: 'Returning',nextAt: 1 };
}

// ── Countdown helper ──────────────────────────────────
function getCountdown(dateStr) {
  if (!dateStr || dateStr === 'N/A' || dateStr === 'TBD' || dateStr === 'Flexible') return null;
  let appt = new Date(dateStr);
  if (isNaN(appt)) {
    const stripped = dateStr.replace(/^[A-Za-z]+,\s*/, '');
    appt = new Date(stripped + ' ' + new Date().getFullYear());
  }
  if (isNaN(appt)) return null;
  const now = new Date();
  const diff = Math.round((appt.setHours(0,0,0,0) - now.setHours(0,0,0,0)) / 86400000);
  if (diff < 0)  return null;
  if (diff === 0) return { days: 0, label: 'Today!',    urgent: true  };
  if (diff === 1) return { days: 1, label: 'Tomorrow!', urgent: true  };
  return          { days: diff, label: `${diff} days`,  urgent: false };
}

export default function DashboardPage() {
  const router = useRouter();
  const [user,      setUser]      = useState(null);
  const [request,   setRequest]   = useState(null);
  const [allDone,   setAllDone]   = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  const [authError, setAuthError] = useState(false);

  // Review
  const [reviewStars,    setReviewStars]    = useState(5);
  const [reviewText,     setReviewText]     = useState('');
  const [reviewBusy,     setReviewBusy]     = useState(false);
  const [reviewDone,     setReviewDone]     = useState(false);
  const [alreadyReview,  setAlreadyReview]  = useState(false);
  const [hoverStar,      setHoverStar]      = useState(0);

  // Settings
  const [settingsName, setSettingsName] = useState('');
  const [currentPass,  setCurrentPass]  = useState('');
  const [newPass,      setNewPass]      = useState('');
  const [settingsMsg,  setSettingsMsg]  = useState('');
  const [settingsErr,  setSettingsErr]  = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);

  const [verifyBanner, setVerifyBanner] = useState(false);
  const [verifySent, setVerifySent] = useState(false);

  // Live countdown re-render every minute
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

  // ── Requests (all for loyalty, latest for display) ───
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

  // ── Already reviewed? ─────────────────────────────────
  useEffect(() => {
    if (!user || !request) return;
    getDocs(query(collection(db, 'reviews'),
      where('userId', '==', user.uid),
      where('requestId', '==', request.id)
    )).then(snap => { if (!snap.empty) setAlreadyReview(true); });
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
    if (newPass.length < 6) { setSettingsErr('At least 6 characters.'); return; }
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

  // ── Derived ───────────────────────────────────────────
  const unreadCount = useUnreadCount(request?.id, 'customer');
  const firstName    = user?.displayName?.split(' ')[0] || 'there';
  const isDone       = request?.status === 'done';
  const isConfirmed  = request?.status === 'confirmed';
  const isNew        = request?.status === 'new';
  const statusLabel  = isNew ? 'Pending Review' : isConfirmed ? 'Confirmed ✅' : 'Completed 🏁';
  const statusColor  = isNew ? '#f59e0b' : isConfirmed ? '#10b981' : '#6b7280';
  const isGoogleUser = user?.providerData?.[0]?.providerId === 'google.com';
  const countdown    = isConfirmed ? getCountdown(request?.date) : null;
  const loyalty      = getLoyaltyTier(allDone);

  const tabs = [
    { id: 'home',     label: 'Home',     icon: '🏠' },
    ...(!isDone ? [
      { id: 'messages', label: 'Messages', icon: '💬', badge: unreadCount },
      { id: 'request',  label: 'My Quote', icon: '📋' },
    ] : []),
    { id: 'settings', label: 'Settings',  icon: '⚙️' },
  ];
  const safeTab = tabs.find(t => t.id === activeTab) ? activeTab : 'home';

  // ── Reusable card wrapper ─────────────────────────────
  const Card = ({ children, style = {} }) => (
    <div style={{background:'#181818',border:'1.5px solid #2a2a2a',borderRadius:'18px',overflow:'hidden',...style}}>
      {children}
    </div>
  );
  const CardHead = ({ icon, title, sub, right }) => (
    <div style={{padding:'14px 20px',borderBottom:'1px solid #2a2a2a',display:'flex',alignItems:'center',gap:'10px',background:'rgba(255,255,255,.02)'}}>
      <span style={{fontSize:'1.2rem'}}>{icon}</span>
      <div style={{flex:1}}>
        <div style={{fontWeight:700,color:'white',fontSize:'.92rem'}}>{title}</div>
        {sub && <div style={{fontSize:'.72rem',color:'#6b7280',marginTop:'1px'}}>{sub}</div>}
      </div>
      {right}
    </div>
  );

  return (
    <div className="cd-root">

      {/* ── NAV ── */}
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

      {/* ── HERO ── */}
      <div className="cd-hero">
        <div className="cd-hero-inner">
          <div className="cd-hero-left">
            <h1>Hey, {firstName} 👋</h1>
            <p style={{color:'#9ca3af',fontSize:'.9rem',marginTop:'4px'}}>
              {isDone ? 'Your cleaning is complete — thank you!' :
               isConfirmed ? 'Your appointment is confirmed!' :
               request ? 'We\'re reviewing your quote.' :
               'Welcome to your cleaning portal'}
            </p>
          </div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'8px'}}>
            {/* Loyalty pill */}
            <div style={{display:'flex',alignItems:'center',gap:'7px',background:loyalty.bg,border:`1px solid ${loyalty.color}44`,borderRadius:'99px',padding:'6px 13px'}}>
              <span style={{fontSize:'1rem'}}>{loyalty.icon}</span>
              <span style={{fontSize:'.73rem',fontWeight:700,color:loyalty.color}}>{loyalty.label}</span>
              {allDone > 0 && <span style={{fontSize:'.68rem',color:loyalty.color,opacity:.7}}>· {allDone} job{allDone!==1?'s':''}</span>}
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

      {/* ── TABS ── */}
      <div className="cd-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`cd-tab ${safeTab===t.id?'active':''}`} onClick={() => setActiveTab(t.id)}>
            <span className="cd-tab-icon">{t.icon}</span>
            <span className="cd-tab-label">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Email verification banner ── */}
      {verifyBanner && (
        <div style={{background:'rgba(245,158,11,.1)',borderBottom:'2px solid rgba(245,158,11,.3)',padding:'12px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'8px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <span style={{fontSize:'1.1rem'}}>📬</span>
            <div>
              <div style={{fontWeight:700,color:'#f59e0b',fontSize:'.85rem'}}>Please verify your email</div>
              <div style={{fontSize:'.76rem',color:'#9ca3af'}}>Check your inbox for a verification link to secure your account.</div>
            </div>
          </div>
          <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
            {verifySent && <span style={{fontSize:'.75rem',color:'#10b981',fontWeight:700}}>✅ Sent!</span>}
            <button onClick={resendVerification} style={{padding:'6px 14px',background:'rgba(245,158,11,.2)',border:'1px solid rgba(245,158,11,.4)',color:'#f59e0b',borderRadius:'8px',fontSize:'.78rem',fontWeight:700,cursor:'pointer'}}>Resend Link</button>
            <button onClick={() => setVerifyBanner(false)} style={{background:'none',border:'none',color:'#6b7280',cursor:'pointer',fontSize:'.85rem'}}>✕</button>
          </div>
        </div>
      )}

      <div className="cd-body">

        {/* ════════════════════════════════════════
            HOME TAB
        ════════════════════════════════════════ */}
        {safeTab === 'home' && (
          <div className="cd-home">

            {/* ── Countdown banner (confirmed only) ── */}
            {isConfirmed && countdown && (
              <div style={{
                background: countdown.urgent
                  ? 'linear-gradient(135deg,rgba(16,185,129,.12),rgba(6,95,70,.18))'
                  : 'linear-gradient(135deg,rgba(26,111,212,.1),rgba(219,39,119,.06))',
                border:`1.5px solid ${countdown.urgent?'#10b981':'#1a6fd4'}33`,
                borderRadius:'18px', padding:'18px 22px',
                display:'flex', alignItems:'center', gap:'16px',
              }}>
                <div style={{
                  width:'58px',height:'58px',borderRadius:'50%',flexShrink:0,
                  background:countdown.urgent?'rgba(16,185,129,.18)':'rgba(26,111,212,.18)',
                  border:`2px solid ${countdown.urgent?'#10b981':'#1a6fd4'}`,
                  display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                }}>
                  {countdown.days <= 1
                    ? <span style={{fontSize:'1.5rem'}}>🎉</span>
                    : <>
                        <span style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:'1.4rem',color:'white',lineHeight:1}}>{countdown.days}</span>
                        <span style={{fontSize:'.55rem',color:'#9ca3af',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px'}}>days</span>
                      </>
                  }
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:'.7rem',fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'3px'}}>
                    {countdown.urgent?'🎉 Coming Up!':'📅 Upcoming'}
                  </div>
                  <div style={{fontSize:'1rem',fontWeight:800,color:'white',marginBottom:'3px'}}>
                    {countdown.days===0?'Your cleaning is TODAY!':
                     countdown.days===1?'Your cleaning is TOMORROW!':
                     `Cleaning in ${countdown.days} days`}
                  </div>
                  <div style={{fontSize:'.8rem',color:'#9ca3af'}}>
                    {request.date}{request.time&&request.time!=='N/A'?` · ${request.time}`:''}
                  </div>
                </div>
              </div>
            )}

            {/* ── Main status card ── */}
            {!request ? (
              <div className="cd-welcome-card">
                <div className="cwc-bg"/>
                <div className="cwc-content">
                  <div className="cwc-icon">✨</div>
                  <h2>Get Your Free Quote</h2>
                  <p>Fill out a quick form and get a custom estimate. No commitment needed.</p>
                  <button className="cd-btn-primary cwc-btn" onClick={() => router.push('/book')}>Get a Quote →</button>
                </div>
              </div>
            ) : isDone ? (
              <div className="cd-welcome-card">
                <div className="cwc-bg"/>
                <div className="cwc-content">
                  <div className="cwc-icon">🏁</div>
                  <h2>Job Complete!</h2>
                  <p>Your cleaning has been marked complete. Hope everything is sparkling! Need another clean?</p>
                  <button className="cd-btn-primary cwc-btn" onClick={() => router.push('/book')}>Book Again →</button>
                </div>
              </div>
            ) : (
              <div className="cd-booking-banner">
                <div className="cbb-left">
                  <div className="cbb-ref">Booking #{request.id.slice(-6).toUpperCase()}</div>
                  <div className="cbb-date">📅 {request.date||'TBD'} · {request.time||'TBD'}</div>
                  <div className="cbb-addr">📍 {request.address}</div>
                </div>
                <div className="cbb-right">
                  <div className="cbb-price">${request.estimate}</div>
                  <div className="cbb-plabel">Estimate</div>
                </div>
              </div>
            )}

            {/* ── Status timeline (new + confirmed) ── */}
            {request && !isDone && (
              <Card>
                <CardHead icon="🗺️" title="Booking Progress" sub="Where your request stands" />
                <div style={{padding:'16px 20px',display:'flex',alignItems:'center',gap:'0'}}>
                  {[
                    { label:'Submitted', done:true  },
                    { label:'In Review', done:isConfirmed },
                    { label:'Confirmed', done:isConfirmed },
                    { label:'Complete',  done:false },
                  ].map((s, i, arr) => (
                    <div key={s.label} style={{display:'flex',alignItems:'center',flex: i < arr.length-1 ? 1 : 'none'}}>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'5px'}}>
                        <div style={{
                          width:'28px',height:'28px',borderRadius:'50%',
                          background:s.done?'var(--pink-deep)':'#2a2a2a',
                          border:`2px solid ${s.done?'var(--pink-deep)':'#3a3a3a'}`,
                          display:'flex',alignItems:'center',justifyContent:'center',
                          fontSize:'.75rem',color:s.done?'white':'#555',fontWeight:700,
                        }}>{s.done?'✓':'○'}</div>
                        <span style={{fontSize:'.62rem',color:s.done?'#d1d5db':'#555',fontWeight:600,textAlign:'center',width:'52px'}}>{s.label}</span>
                      </div>
                      {i < arr.length-1 && (
                        <div style={{flex:1,height:'2px',background:s.done&&arr[i+1].done?'var(--pink-deep)':'#2a2a2a',margin:'0 2px',marginBottom:'18px'}}/>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* ── Leave a Review (done only) ── */}
            {isDone && !alreadyReview && (
              <Card>
                <CardHead icon="⭐" title="Leave a Review" sub="Share your experience — it really helps us grow!" />
                <div style={{padding:'18px 20px'}}>
                  {reviewDone ? (
                    <div style={{textAlign:'center',padding:'16px 0'}}>
                      <div style={{fontSize:'2.4rem',marginBottom:'10px'}}>🎉</div>
                      <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,color:'white',fontSize:'1.05rem',marginBottom:'5px'}}>Thank you!</div>
                      <div style={{color:'#9ca3af',fontSize:'.83rem'}}>Your review will appear on our homepage.</div>
                    </div>
                  ) : (
                    <>
                      <div style={{marginBottom:'16px'}}>
                        <div style={{fontSize:'.72rem',fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:'8px'}}>Your Rating</div>
                        <div style={{display:'flex',gap:'6px'}}>
                          {[1,2,3,4,5].map(s => (
                            <button key={s}
                              onMouseEnter={() => setHoverStar(s)}
                              onMouseLeave={() => setHoverStar(0)}
                              onClick={() => setReviewStars(s)}
                              style={{fontSize:'1.9rem',background:'none',border:'none',cursor:'pointer',
                                opacity: s <= (hoverStar||reviewStars) ? 1 : 0.2,
                                transform: s <= (hoverStar||reviewStars) ? 'scale(1.15)' : 'scale(1)',
                                transition:'all .12s',lineHeight:1,padding:'2px',
                              }}>⭐</button>
                          ))}
                        </div>
                      </div>
                      <textarea
                        value={reviewText}
                        onChange={e => setReviewText(e.target.value)}
                        placeholder="Tell others about your experience with Yoselin's Cleaning..."
                        rows={3}
                        style={{
                          width:'100%',padding:'12px 14px',background:'#1f1f1f',
                          border:'1.5px solid #2a2a2a',borderRadius:'12px',color:'white',
                          fontSize:'.87rem',fontFamily:"'DM Sans',sans-serif",
                          outline:'none',resize:'vertical',lineHeight:1.5,marginBottom:'12px',
                        }}
                      />
                      <button onClick={submitReview} disabled={reviewBusy||!reviewText.trim()} style={{
                        width:'100%',padding:'13px',
                        background:reviewText.trim()?'linear-gradient(135deg,#f59e0b,#db2777)':'#1f1f1f',
                        color:reviewText.trim()?'white':'#4b5563',
                        border:'none',borderRadius:'12px',fontSize:'.92rem',fontWeight:700,
                        cursor:reviewText.trim()?'pointer':'not-allowed',transition:'all .2s',
                      }}>
                        {reviewBusy?'Submitting...':'⭐ Submit Review'}
                      </button>
                    </>
                  )}
                </div>
              </Card>
            )}

            {isDone && alreadyReview && !reviewDone && (
              <div style={{background:'rgba(16,185,129,.07)',border:'1px solid rgba(16,185,129,.2)',borderRadius:'14px',padding:'13px 18px',display:'flex',alignItems:'center',gap:'12px'}}>
                <span style={{fontSize:'1.3rem'}}>✅</span>
                <div>
                  <div style={{fontWeight:700,color:'#10b981',fontSize:'.87rem'}}>Review Submitted</div>
                  <div style={{fontSize:'.74rem',color:'#6b7280',marginTop:'1px'}}>Thank you for sharing your feedback!</div>
                </div>
              </div>
            )}

            {/* ── Loyalty Progress ── */}
            <Card style={{padding:'18px 20px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
                <div>
                  <div style={{fontSize:'.68rem',fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'4px'}}>Loyalty Status</div>
                  <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                    <span style={{fontSize:'1.4rem'}}>{loyalty.icon}</span>
                    <span style={{fontFamily:"'Playfair Display',serif",fontWeight:700,color:loyalty.color,fontSize:'1rem'}}>{loyalty.label}</span>
                  </div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:'2rem',fontWeight:900,color:'white',lineHeight:1}}>{allDone}</div>
                  <div style={{fontSize:'.68rem',color:'#6b7280',marginTop:'2px'}}>job{allDone!==1?'s':''} done</div>
                </div>
              </div>
              {loyalty.next ? (
                <>
                  <div style={{height:'6px',background:'#2a2a2a',borderRadius:'99px',overflow:'hidden',marginBottom:'6px'}}>
                    <div style={{height:'100%',width:`${Math.min(100,(allDone/loyalty.nextAt)*100)}%`,background:`linear-gradient(90deg,${loyalty.color},${loyalty.color}99)`,borderRadius:'99px',transition:'width .5s'}}/>
                  </div>
                  <div style={{fontSize:'.7rem',color:'#6b7280',display:'flex',justifyContent:'space-between'}}>
                    <span>{allDone} / {loyalty.nextAt}</span>
                    <span>{loyalty.nextAt-allDone} more to <strong style={{color:'white'}}>{loyalty.next}</strong></span>
                  </div>
                </>
              ) : (
                <div style={{fontSize:'.78rem',color:loyalty.color,fontWeight:700,textAlign:'center'}}>
                  💎 Highest tier — thank you for your loyalty!
                </div>
              )}
            </Card>

            {/* ── Quick tiles ── */}
            <div className="cd-tiles">
              {!isDone && (
                <>
                  <div className="cd-tile" onClick={() => setActiveTab('messages')} style={{opacity:request?1:.45,pointerEvents:request?'auto':'none'}}>
                    <div className="ct-icon-wrap ct-blue">💬</div>
                    <div className="ct-text"><div className="ct-title">Messages</div><div className="ct-sub">{request?'Chat with us':'After quote'}</div></div>
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

        {/* ════════════════════════════════════════
            MESSAGES TAB
        ════════════════════════════════════════ */}
        {safeTab === 'messages' && !isDone && (
          <div className="cd-tab-panel">
            {!request ? (
              <div className="cd-empty-state">
                <div className="ces-icon">💬</div>
                <h3>No Messages Yet</h3>
                <p>Once you submit a quote, you can message us here.</p>
                <button className="cd-btn-primary" onClick={() => router.push('/book')}>Get a Quote →</button>
              </div>
            ) : (
              <div className="cd-messages-wrap">
                <div className="cd-section-header"><h3>Messages</h3><p>Questions or changes? Send us a message.</p></div>
                <Chat requestId={request.id} currentUser={user} senderRole="customer" onClose={null} inline={true} />
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════
            MY QUOTE TAB
        ════════════════════════════════════════ */}
        {safeTab === 'request' && !isDone && (
          <div className="cd-tab-panel">
            {!request ? (
              <div className="cd-empty-state">
                <div className="ces-icon">📋</div>
                <h3>No Quote Yet</h3>
                <p>Submit your first request and we'll get back to you within 24 hours.</p>
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
                      ['🏠 Building',  request.buildingType||'Not specified'],
                      ['📅 Date',      request.date||'TBD'],
                      ['🕐 Time',      request.time||'TBD'],
                      ['📍 Address',   request.address],
                      ['🔁 Frequency', request.frequency],
                      ['🛁 Bathrooms', request.bathrooms],
                      ['🛏️ Rooms',    request.rooms],
                      ['✨ Add-Ons',   request.addons||'None'],
                      ['🐾 Pets',      request.pets==='yes'?'Yes':'No'],
                    ].map(([k,v]) => (
                      <div className="cdc-row" key={k}><span className="cdc-key">{k}</span><span className="cdc-val">{v}</span></div>
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

        {/* ════════════════════════════════════════
            SETTINGS TAB
        ════════════════════════════════════════ */}
        {safeTab === 'settings' && (
          <div className="cd-tab-panel">
            <div className="cd-section-header"><h3>Account Settings</h3><p>Update your name and password</p></div>
            {settingsMsg && <div className="cd-alert cd-alert-success">✅ {settingsMsg}</div>}
            {settingsErr && <div className="cd-alert cd-alert-error">⚠️ {settingsErr}</div>}

            <div className="cd-settings-card">
              <div className="csc-section-title">Profile</div>
              <div className="cd-settings-avatar">
                {user?.photoURL?<img src={user.photoURL} alt=""/>:<div className="csa-initials">{firstName[0]?.toUpperCase()}</div>}
                <div><div className="csa-name">{user?.displayName||'No name set'}</div><div className="csa-email">{user?.email}</div></div>
              </div>
              <div className="cd-settings-field">
                <label>Display Name</label>
                <input type="text" value={settingsName} onChange={e=>setSettingsName(e.target.value)} placeholder="Your full name"/>
              </div>
              <button className="cd-btn-primary" onClick={saveName} disabled={settingsBusy}>{settingsBusy?'Saving...':'Save Name'}</button>
            </div>

            {!isGoogleUser ? (
              <div className="cd-settings-card">
                <div className="csc-section-title">Change Password</div>
                <div className="cd-settings-field">
                  <label>Current Password</label>
                  <input type="password" value={currentPass} onChange={e=>setCurrentPass(e.target.value)} placeholder="Enter current password"/>
                </div>
                <div className="cd-settings-field">
                  <label>New Password</label>
                  <input type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="At least 6 characters"/>
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







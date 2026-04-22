'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { goToBooking } from '../lib/navigation';
import {
  GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  updateProfile, sendPasswordResetEmail, sendEmailVerification,
} from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, limit, getDoc } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL, ADMIN_EMAILS, FIREBASE_ENABLED } from '../lib/firebase';
import { FALLBACK_REVIEWS } from '../lib/fallbacks';

export default function HomePage() {
  const router = useRouter();
  
  const [loading,       setLoading]       = useState(true);
  const [liveReviews,   setLiveReviews]   = useState([]);
  const [galleryPhotos, setGalleryPhotos] = useState([]);

  useEffect(() => {
    if (!FIREBASE_ENABLED) {
      setGalleryPhotos([]);
      return;
    }
    const unsub = onSnapshot(
      doc(db, 'settings', 'galleryIndex'),
      async (snap) => {
        if (snap.exists()) {
          const { count = 0 } = snap.data();
          const allPhotos = [];
          for (let i = 0; i < count; i++) {
            try {
              const chunkSnap = await getDoc(doc(db, 'settings', `gallery_${i}`));
              if (chunkSnap.exists()) allPhotos.push(...(chunkSnap.data().photos || []));
            } catch (e) {}
          }
          setGalleryPhotos(allPhotos.slice(0, 6));
        } else {
          setGalleryPhotos([]);
        }
      },
      () => {}
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!FIREBASE_ENABLED) {
      setLiveReviews([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'reviews'), orderBy('createdAt', 'desc')),
      snap => setLiveReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })) ),
      () => {}
    );
    return () => unsub();
  }, []);

  const [authMode,      setAuthMode]      = useState(null);
  const [tabOpen,       setTabOpen]       = useState(false);
  const [name,          setName]          = useState('');
  const [email,         setEmail]         = useState('');
  const [password,      setPassword]      = useState('');
  const [showPass,      setShowPass]      = useState(false);
  const [error,         setError]         = useState('');
  const [busy,          setBusy]          = useState(false);
  const [resetSent,     setResetSent]     = useState(false);
  const [verifyError,   setVerifyError]   = useState('');
  const [verifyResent,  setVerifyResent]  = useState(false);
  const [authError,     setAuthError]     = useState(false);
  const [currentUser,   setCurrentUser]   = useState(null);

  const searchParams = useSearchParams();

  useEffect(() => {
    if (!FIREBASE_ENABLED) {
      setCurrentUser(null);
      setLoading(false);
      return;
    }
    let timeout;
    try {
      const unsub = onAuthStateChanged(auth, (user) => {
        clearTimeout(timeout);
        setCurrentUser(user || null);
        setLoading(false);
      });
      timeout = setTimeout(() => { setLoading(false); setAuthError(true); }, 8000);
      return () => { unsub(); clearTimeout(timeout); };
    } catch { setLoading(false); setAuthError(true); }
  }, [router]);

  useEffect(() => {
    try {
      if (searchParams.get('auth') === 'login') setAuthMode('login');
    } catch (e) {}
  }, [searchParams]);

  const redirect = (user) => {
    if (ADMIN_EMAILS.includes(user.email?.toLowerCase()) || ADMIN_EMAILS.includes(user.email)) router.push('/admin');
    else if (!user.emailVerified) { setAuthMode('verify'); setBusy(false); }
    else router.push('/dashboard');
  };

  const handleGoogleSignIn = async () => {
    setError(''); setBusy(true);
    try { const r = await signInWithPopup(auth, new GoogleAuthProvider()); redirect(r.user); }
    catch { setError('Google sign-in failed. Please try again.'); setBusy(false); }
  };

  const handleLogin = async () => {
    setError(''); setBusy(true);
    if (!email || !password) { setError('Please fill in all fields.'); setBusy(false); return; }
    try { const r = await signInWithEmailAndPassword(auth, email, password); redirect(r.user); }
    catch (e) {
      setError(
        e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found'
          ? 'Incorrect email or password.'
          : 'Login failed. Please try again.'
      );
      setBusy(false);
    }
  };

  const handleSignup = async () => {
    setError(''); setBusy(true);
    if (!name.trim())        { setError('Please enter your name.'); setBusy(false); return; }
    if (!email || !password) { setError('Please fill in all fields.'); setBusy(false); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); setBusy(false); return; }
    try {
      const r = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(r.user, { displayName: name.trim() });
      await sendEmailVerification(r.user);
      redirect(r.user);
    } catch (e) {
      setError(e.code === 'auth/email-already-in-use'
        ? 'An account with this email already exists. Try logging in.'
        : 'Sign up failed. Please try again.'
      );
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!email) { setError('Enter your email above first.'); return; }
    setError(''); setBusy(true);
    try { await sendPasswordResetEmail(auth, email); setResetSent(true); setBusy(false); }
    catch { setError('Could not send reset email.'); setBusy(false); }
  };

  const closeModal = () => {
    if (authMode === 'verify') return;
    setAuthMode(null); setError(''); setName(''); setEmail(''); setPassword(''); setResetSent(false);
  };

  const checkVerification = async () => {
    setBusy(true); setVerifyError('');
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) { router.push('/dashboard'); }
      else { setVerifyError('Email not verified yet. Please check your inbox and click the link.'); }
    } catch { setVerifyError('Something went wrong. Please try again.'); }
    setBusy(false);
  };

  const resendVerification = async () => {
    setBusy(true); setVerifyError(''); setVerifyResent(false);
    try { await sendEmailVerification(auth.currentUser); setVerifyResent(true); }
    catch { setVerifyError('Could not resend. Try again in a minute.'); }
    setBusy(false);
  };

  const reviews = [...liveReviews, ...FALLBACK_REVIEWS];
  const isAdmin = currentUser && (ADMIN_EMAILS.includes(currentUser.email?.toLowerCase()) || ADMIN_EMAILS.includes(currentUser.email));

  if (loading) return <div className="spinner-page"><div className="spinner"></div></div>;

  return (
    <div className="hp-root">

      {/* ── Nav ── */}
      <nav className="hp-nav" style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 24px',height:64,position:'sticky',top:0,zIndex:100,background:'rgba(7,7,11,0.92)',backdropFilter:'blur(18px)',WebkitBackdropFilter:'blur(18px)',borderBottom:'1px solid rgba(255,90,160,0.08)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,position:'relative'}}>
          <button className="hp-tab-btn" onClick={() => setTabOpen(v => !v)} style={{background:'none',border:'none',cursor:'pointer',padding:4}}>
            <span style={{display:'block',width:18,height:2,background:'#fff',margin:'4px 0'}} />
            <span style={{display:'block',width:18,height:2,background:'#fff',margin:'4px 0'}} />
            <span style={{display:'block',width:18,height:2,background:'#fff',margin:'4px 0'}} />
          </button>
          {tabOpen && (
            <div style={{position:'fixed',top:64,left:0,right:0,background:'rgba(7,7,11,0.98)',backdropFilter:'blur(18px)',WebkitBackdropFilter:'blur(18px)',borderBottom:'1px solid #1a1a1a',padding:'16px 24px',display:'flex',flexDirection:'column',gap:16,zIndex:200}}>
              <a href="#pics"    style={{color:'#d1d5db',fontWeight:600,textDecoration:'none',fontSize:'.95rem'}} onClick={() => setTabOpen(false)}>📷 Photos</a>
              <a href="#reviews" style={{color:'#d1d5db',fontWeight:600,textDecoration:'none',fontSize:'.95rem'}} onClick={() => setTabOpen(false)}>⭐ Reviews</a>
              <a href="/policy"  style={{color:'#d1d5db',fontWeight:600,textDecoration:'none',fontSize:'.95rem'}} onClick={() => setTabOpen(false)}>📄 Policy</a>
            </div>
          )}
          <a href="/" style={{display:'flex',alignItems:'center'}}>
            <img src="/logo.png" alt="Yoselin's Cleaning" style={{height:64,objectFit:'contain'}} />
          </a>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {currentUser ? (
            <>
              <span style={{fontSize:'.8rem',color:'#9ca3af',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{currentUser.displayName || currentUser.email}</span>
              {isAdmin
                ? <button onClick={() => router.push('/admin')}     style={{padding:'8px 16px',background:'var(--pink-deep)',color:'white',border:'none',borderRadius:'999px',fontWeight:700,cursor:'pointer',fontSize:'.82rem'}}>Admin</button>
                : <button onClick={() => router.push('/dashboard')} style={{padding:'8px 16px',background:'var(--blue)',color:'white',border:'none',borderRadius:'999px',fontWeight:700,cursor:'pointer',fontSize:'.82rem'}}>My Bookings</button>
              }
              {FIREBASE_ENABLED && auth && (
                <button className="signout-btn" onClick={() => signOut(auth)}>Sign Out</button>
              )}
            </>
          ) : (
            <button onClick={() => goToBooking(router)} style={{padding:'10px 18px',background:'var(--blue)',color:'white',border:'none',borderRadius:'999px',fontWeight:800,cursor:'pointer'}}>Book Now</button>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-content">
          <span className="hero-badge">⭐ Trusted Local Cleaning Service</span>
          <h1 className="hero-title">Professional,<br />Reliable,<br /><span>Sparkling Clean</span></h1>
          <p className="hero-sub">Local home cleaning services trusted by neighbors. Deep cleans, recurring visits, move-in/out and more — all booked online in minutes.</p>
          <div className="hero-btns">
            <button className="btn-primary btn-large" onClick={() => goToBooking(router)}>Book a Cleaning →</button>
            <a className="btn-ghost" href="#reviews">See Reviews</a>
          </div>
          <div className="hero-stats">
            <div className="hstat"><strong>200+</strong><span>Happy Clients</span></div>
            <div className="hstat-div" />
            <div className="hstat"><strong>5.0 ★</strong><span>Avg Rating</span></div>
            <div className="hstat-div" />
            <div className="hstat"><strong>100%</strong><span>Satisfaction</span></div>
          </div>
        </div>
        <div className="hero-img-wrap">
          <div className="hero-img-card">
            <div className="hic-top">
              <div className="hic-avatar">Y</div>
              <div>
                <div className="hic-name">Yoselin's Cleaning</div>
                <div className="hic-stars">⭐⭐⭐⭐⭐</div>
              </div>
            </div>
            <div className="hic-items">
              <div className="hic-item"><div className="hic-check">✓</div>Deep Cleaning</div>
              <div className="hic-item"><div className="hic-check">✓</div>Move In / Out</div>
              <div className="hic-item"><div className="hic-check">✓</div>Recurring Plans</div>
              <div className="hic-item"><div className="hic-check">✓</div>Insured &amp; Trusted</div>
            </div>
            <div className="hic-cta" onClick={() => goToBooking(router)} style={{cursor:'pointer'}}>Get a Free Quote →</div>
          </div>
        </div>
      </section>

      {/* ── Why Us ── */}
      <section className="why-section">
        <div className="section-container">
          <div className="why-card"><div className="why-icon">✨</div><h3>Spotless Results</h3><p>Every surface, every corner — cleaned with the same care we'd give our own home.</p></div>
          <div className="why-card"><div className="why-icon">🕐</div><h3>Always On Time</h3><p>We respect your schedule. Punctual arrivals and efficient service, every single visit.</p></div>
          <div className="why-card"><div className="why-icon">🔒</div><h3>Trusted &amp; Insured</h3><p>Fully insured, background-checked, and committed to your peace of mind.</p></div>
          <div className="why-card"><div className="why-icon">📱</div><h3>Easy Online Booking</h3><p>Book in minutes, get a quote instantly, and manage everything from your phone.</p></div>
        </div>
      </section>

      {/* ── Gallery ── */}
      {galleryPhotos.length > 0 && (
        <section id="pics" style={{padding:'72px 32px',background:'#0a0a0f'}}>
          <div className="section-container">
            <p className="section-label">Our Work</p>
            <h2 className="section-title">See the <span>Results</span></h2>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14,marginTop:28}}>
              {galleryPhotos.map((url, i) => (
                <div key={i} style={{width:'100%',height:220,borderRadius:16,overflow:'hidden',border:'1px solid #1f1f1f'}}>
                  <img src={url} alt={`Clean result ${i + 1}`} style={{width:'100%',height:'100%',objectFit:'cover'}} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Reviews ── */}
      <section id="reviews" style={{padding:'80px 32px',background:'#07070b'}}>
        <div className="section-container">
          <p className="section-label">Reviews</p>
          <h2 className="section-title">What Customers <span>Say</span></h2>
          <div className="reviews-grid" style={{marginTop:28}}>
            {reviews.slice(0, 9).map((r, i) => (
              <div key={r.id || i} className="review-card" style={{background:'#0f0f10',border:'1px solid #1f1f2e'}}>
                <div className="rc-stars">{'⭐'.repeat(Math.min(r.stars || 5, 5))}</div>
                <p className="rc-text">{r.text}</p>
                <div className="rc-footer">
                  <div className="rc-avatar">{(r.name || '?')[0]}</div>
                  <div>
                    <div className="rc-name">{r.name}</div>
                    {r.date && <div className="rc-date">{r.date}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <div className="cta-banner">
        <div className="cta-content">
          <h2>Ready for a Sparkling Clean Home?</h2>
          <p>Book online in minutes. We'll handle the rest.</p>
          <button className="btn-primary btn-large" onClick={() => goToBooking(router)}>Book a Cleaning →</button>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="home-footer">
        <div className="hf-brand">Yoselin's <em>Cleaning</em></div>
        <p className="hf-copy">© {new Date().getFullYear()} Yoselin's Cleaning Service. All rights reserved.</p>
        <p className="hf-tagline">Professional • Reliable • Sparkling Clean</p>
      </footer>

      {/* ── Auth Modal ── */}
      <div className={`overlay${authMode ? ' show' : ''}`} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
        <div className="modal" onClick={e => e.stopPropagation()}>

          {authMode === 'verify' ? (
            <>
              <div className="modal-head">
                <h3>Verify Your Email</h3>
              </div>
              <p style={{color:'#9ca3af',fontSize:'.88rem',marginBottom:20}}>
                We sent a verification link to <strong style={{color:'white'}}>{currentUser?.email}</strong>. Click it then come back.
              </p>
              {verifyError  && <p className="auth-err">{verifyError}</p>}
              {verifyResent && <p style={{color:'#34d399',fontSize:'.82rem',marginBottom:8}}>Verification email resent!</p>}
              <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                <button className="btn btn-primary wide" disabled={busy} onClick={checkVerification}>{busy ? 'Checking…' : '✓ I Verified My Email'}</button>
                <button className="btn wide"             disabled={busy} onClick={resendVerification}>Resend Email</button>
              </div>
            </>
          ) : (
            <>
              <div className="modal-head">
                <h3>{authMode === 'signup' ? 'Create Account' : 'Sign In'}</h3>
                <button className="modal-close" onClick={closeModal}>×</button>
              </div>

              <button className="google-btn" disabled={busy} onClick={handleGoogleSignIn}>
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                Continue with Google
              </button>

              <div style={{display:'flex',alignItems:'center',gap:10,margin:'14px 0',color:'#6b7280',fontSize:'.8rem'}}>
                <div style={{flex:1,height:1,background:'#2a2a2a'}} />or<div style={{flex:1,height:1,background:'#2a2a2a'}} />
              </div>

              {authMode === 'signup' && (
                <div className="fg" style={{marginBottom:12}}>
                  <label style={{color:'#d1d5db'}}>Name</label>
                  <input type="text" placeholder="Your full name" value={name} onChange={e => setName(e.target.value)} />
                </div>
              )}
              <div className="fg" style={{marginBottom:12}}>
                <label style={{color:'#d1d5db'}}>Email</label>
                <input type="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="fg" style={{marginBottom:4,position:'relative'}}>
                <label style={{color:'#d1d5db'}}>Password</label>
                <input type={showPass ? 'text' : 'password'} placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={{paddingRight:44}} />
                <button type="button" onClick={() => setShowPass(v => !v)} style={{position:'absolute',right:12,top:30,background:'none',border:'none',cursor:'pointer',color:'#9ca3af',fontSize:'.78rem'}}>{showPass ? 'Hide' : 'Show'}</button>
              </div>

              {error      && <p className="auth-err">{error}</p>}
              {resetSent  && <p style={{color:'#34d399',fontSize:'.82rem',marginBottom:6}}>Password reset email sent!</p>}
              {authError  && <p className="auth-err">Connection issue. Please try again.</p>}

              <button className="btn btn-primary" style={{width:'100%',padding:'13px',marginTop:10}} disabled={busy} onClick={authMode === 'signup' ? handleSignup : handleLogin}>
                {busy ? '…' : authMode === 'signup' ? 'Create Account' : 'Sign In'}
              </button>

              {authMode !== 'signup' && (
                <button type="button" onClick={handleReset} style={{background:'none',border:'none',cursor:'pointer',color:'var(--blue)',fontSize:'.82rem',marginTop:10,display:'block'}}>
                  Forgot password?
                </button>
              )}

              <p style={{fontSize:'.82rem',color:'#9ca3af',marginTop:14,textAlign:'center'}}>
                {authMode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
                <button type="button" onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setError(''); }} style={{background:'none',border:'none',cursor:'pointer',color:'var(--blue)',fontWeight:700,fontSize:'.82rem'}}>
                  {authMode === 'signup' ? 'Sign In' : 'Sign Up'}
                </button>
              </p>
            </>
          )}
        </div>
      </div>

    </div>
  );
}

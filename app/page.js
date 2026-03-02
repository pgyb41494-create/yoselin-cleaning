'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  updateProfile, sendPasswordResetEmail, sendEmailVerification,
} from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, limit, getDoc } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL, ADMIN_EMAILS } from '../lib/firebase';



const FALLBACK_REVIEWS = [
  { name: 'Maria G.',      stars: 5, text: 'Yoselin did an amazing job! My house has never looked this clean. She even organized my pantry without me asking. Absolutely love this service!', textEs: '¡Yoselin hizo un trabajo increíble! Mi casa nunca había estado tan limpia. Incluso organizó mi despensa sin que se lo pidiera. ¡Me encanta este servicio!', date: 'Jan 2025' },
  { name: 'Ashley R.',     stars: 5, text: 'Super professional and thorough. I booked a deep clean and she went above and beyond every single room. Will definitely be booking again every month!', textEs: 'Súper profesional y minuciosa. Reservé una limpieza profunda y superó todas las expectativas en cada habitación. ¡Definitivamente reservaré cada mes!', date: 'Feb 2025' },
  { name: 'Carlos M.',     stars: 5, text: 'Best cleaning service I have ever used. On time, very detailed, and left everything sparkling. The online booking process was so easy too.', textEs: 'El mejor servicio de limpieza que he usado. Puntual, muy detallista y dejó todo brillante. El proceso de reserva en línea también fue muy fácil.', date: 'Feb 2025' },
  { name: 'Tiffany W.',    stars: 5, text: 'I was nervous about letting someone in my home but Yoselin made me feel so comfortable. Trustworthy, kind, and incredibly thorough. 10/10!', textEs: 'Estaba nerviosa por dejar entrar a alguien a mi casa pero Yoselin me hizo sentir muy cómoda. Confiable, amable e increíblemente minuciosa. ¡10/10!', date: 'Mar 2025' },
  { name: 'Denise P.',     stars: 5, text: 'I have tried four different cleaning services over the years and none of them compare. Yoselin actually cares about the quality of her work. So refreshing.', textEs: 'He probado cuatro servicios de limpieza diferentes y ninguno se compara. A Yoselin realmente le importa la calidad de su trabajo. Muy refrescante.', date: 'Mar 2025' },
  { name: 'James T.',      stars: 5, text: 'My bathroom looked brand new after the deep clean. She got into corners I did not even know existed. Highly recommend for anyone who wants real results.', textEs: 'Mi baño parecía nuevo después de la limpieza profunda. Llegó a rincones que ni sabía que existían. Muy recomendable para quien quiera resultados reales.', date: 'Apr 2025' },
  { name: 'Samantha L.',   stars: 5, text: 'We had a move-out clean done and our landlord was impressed. Got our full deposit back! Worth every penny and the booking was quick and easy.', textEs: 'Hicimos una limpieza de mudanza y nuestro arrendador quedó impresionado. ¡Recuperamos todo el depósito! Vale cada centavo y la reserva fue rápida y fácil.', date: 'Apr 2025' },
  { name: 'Kevin B.',      stars: 5, text: 'I run a small office and we have been using Yoselin weekly for three months now. Reliable, consistent, and always leaves the place spotless.', textEs: 'Tengo una oficina pequeña y hemos usado a Yoselin semanalmente por tres meses. Confiable, consistente y siempre deja el lugar impecable.', date: 'Apr 2025' },
  { name: 'Rosa M.',       stars: 5, text: 'She cleaned my kitchen from top to bottom including inside the oven and fridge. It smelled amazing and looked like it did when we first moved in.', textEs: 'Limpió mi cocina de arriba a abajo incluyendo dentro del horno y el refrigerador. Olía increíble y parecía como cuando nos mudamos por primera vez.', date: 'May 2025' },
  { name: 'Brittany H.',   stars: 5, text: 'I booked a last-minute cleaning before my in-laws visited and Yoselin came through. Everything was immaculate. You could not ask for better service.', textEs: 'Reservé una limpieza de último momento antes de que vinieran mis suegros y Yoselin cumplió. Todo quedó inmaculado. No se puede pedir mejor servicio.', date: 'May 2025' },
  { name: 'Derek N.',      stars: 5, text: 'Communication was great from start to finish. She confirmed the appointment, showed up on time, and the results were outstanding. Will be back.', textEs: 'La comunicación fue excelente de principio a fin. Confirmó la cita, llegó a tiempo y los resultados fueron sobresalientes. Volveré.', date: 'May 2025' },
  { name: 'Claudia R.',    stars: 5, text: 'I am very picky about how my home is cleaned and Yoselin exceeded every one of my expectations. Detailed, professional, and so friendly.', textEs: 'Soy muy exigente con la limpieza de mi casa y Yoselin superó todas mis expectativas. Detallista, profesional y muy amigable.', date: 'Jun 2025' },
  { name: 'Marcus J.',     stars: 5, text: 'Just moved into a new place and booked a move-in clean. Everything was sanitized and ready to live in. Made settling in so much less stressful.', textEs: 'Me mudé a un lugar nuevo y reservé una limpieza de mudanza. Todo quedó desinfectado y listo para vivir. Hizo que instalarme fuera mucho menos estresante.', date: 'Jun 2025' },
  { name: 'Patricia K.',   stars: 5, text: 'As a senior on a fixed income the discount she offers means so much. And the quality of the cleaning is the best I have ever received. Thank you!', textEs: 'Como persona mayor con ingreso fijo, el descuento que ofrece significa mucho. Y la calidad de la limpieza es la mejor que he recibido. ¡Gracias!', date: 'Jun 2025' },
  { name: 'Jordan F.',     stars: 5, text: 'I have two dogs and she handled all the pet hair without complaint and still left my house looking flawless. Found my go-to cleaner for life.', textEs: 'Tengo dos perros y ella manejó todo el pelo de mascota sin quejarse y dejó mi casa impecable. Encontré mi limpiadora de confianza para siempre.', date: 'Jul 2025' },
  { name: 'Natalie C.',    stars: 5, text: 'Booked a bi-weekly plan and the consistency is incredible. Every time she comes the house looks just as good as the first visit. Love it.', textEs: 'Reservé un plan quincenal y la consistencia es increíble. Cada vez que viene la casa se ve tan bien como la primera visita. Me encanta.', date: 'Jul 2025' },
  { name: 'Steven V.',     stars: 5, text: 'I referred three of my coworkers and they all love her too. Yoselin builds real trust with her clients. That says everything about her character.', textEs: 'Referí a tres compañeros de trabajo y a todos les encanta también. Yoselin construye confianza real con sus clientes. Eso dice todo sobre su carácter.', date: 'Aug 2025' },
  { name: 'Amanda S.',     stars: 5, text: 'The baseboards, the blinds, the light switches — she cleaned things I always forget about. My whole house felt fresh and new. Incredible attention to detail.', textEs: 'Los zócalos, las persianas, los interruptores — limpió cosas que siempre olvido. Toda mi casa se sintió fresca y nueva. Increíble atención al detalle.', date: 'Aug 2025' },
  { name: 'Tony R.',       stars: 5, text: 'My wife and I were both shocked at how clean our home was after the deep clean. We looked at each other and said we should have done this years ago.', textEs: 'Mi esposa y yo quedamos impactados de lo limpia que quedó nuestra casa. Nos miramos y dijimos que debimos haber hecho esto hace años.', date: 'Sep 2025' },
  { name: 'Jennifer M.',   stars: 5, text: 'From booking to payment everything was smooth and easy. Yoselin is prompt, professional, and genuinely passionate about what she does. Highly recommend!', textEs: 'Desde la reserva hasta el pago todo fue fácil. Yoselin es puntual, profesional y genuinamente apasionada por lo que hace. ¡Muy recomendable!', date: 'Sep 2025' },
];

export default function HomePage() {
  const router = useRouter();
  
  const [loading,       setLoading]       = useState(true);
  const [liveReviews,   setLiveReviews]   = useState([]);
  const [galleryPhotos, setGalleryPhotos] = useState([]);

  useEffect(() => {
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
    const unsub = onSnapshot(
      query(collection(db, 'reviews'), orderBy('createdAt', 'desc')),
      snap => setLiveReviews(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
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

  useEffect(() => {
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

      {authError && (
        <div style={{background:'#fef3c7',borderBottom:'2px solid #f59e0b',padding:'10px 20px',textAlign:'center',fontSize:'.85rem',color:'#92400e',fontWeight:600}}>
          ⚠️ {'An ad blocker may be interfering with login. Please disable it for this site if you have trouble signing in.'}
        </div>
      )}

      {/* NAVBAR */}
      <nav className="hp-nav">
        <div className="hp-nav-left">
          <div className="hp-tab-wrap">
            <button className="hp-tab-btn" onClick={() => setTabOpen(!tabOpen)}>
              <span /><span /><span />
            </button>
            {tabOpen && (
              <div className="hp-tab-dropdown">
                <a href="#pics"    onClick={() => setTabOpen(false)}>📷 {'Pics'}</a>
                <a href="#reviews" onClick={() => setTabOpen(false)}>⭐ {'Reviews'}</a>
              </div>
            )}
          </div>
        </div>

        <div className="hp-nav-brand">
          <img src="/logo.png" alt="Yoselin's Cleaning" style={{ height: '190px', objectFit: 'contain' }} />
        </div>

        <div className="hp-nav-right">
          {currentUser ? (
            <>
              <button className="hp-nav-login" onClick={() => router.push(isAdmin ? '/admin' : '/dashboard')}>{isAdmin ? 'Admin' : Dashboard}</button>
              <button onClick={() => signOut(auth)} style={{ background: 'none', border: '1px solid rgba(255,255,255,.15)', color: '#9ca3af', padding: '6px 14px', borderRadius: '99px', fontSize: '.78rem', cursor: 'pointer' }}>{'Sign Out'}</button>
            </>
          ) : (
            <button className="hp-nav-login" onClick={() => setAuthMode('login')}>{'Login'}</button>
          )}
        </div>
      </nav>

      {/* HERO */}
      <section className="hp-hero" style={{ position:'relative', overflow:'hidden' }}>
        {/* Animated glow orbs */}
        <div className="hp-hero-orb hp-hero-orb-1" />
        <div className="hp-hero-orb hp-hero-orb-2" />
        <div className="hp-hero-orb hp-hero-orb-3" />
        {/* Floating sparkle particles */}
        {[{l:'18%',d:'2.8s',sz:6,delay:'0s',c:'rgba(219,39,119,.7)'},{l:'35%',d:'3.4s',sz:4,delay:'1s',c:'rgba(168,85,247,.8)'},{l:'55%',d:'2.5s',sz:5,delay:'.4s',c:'rgba(26,111,212,.7)'},{l:'72%',d:'3.8s',sz:7,delay:'1.6s',c:'rgba(244,114,182,.8)'},{l:'85%',d:'2.2s',sz:4,delay:'.9s',c:'rgba(96,165,250,.7)'},{l:'10%',d:'3.1s',sz:5,delay:'2s',c:'rgba(168,85,247,.6)'}].map((p,i)=>(          <div key={i} className="hp-sparkle" style={{ left:p.l, bottom:'-8px', width:p.sz, height:p.sz, background:p.c, animationDuration:p.d, animationDelay:p.delay }} />
        ))}
        <p className="hp-hero-tagline anim-fadeInUp delay-1">✨ {'Ready To Make Your Place Shine'}</p>
        <h1 className="hp-hero-title anim-fadeInUp delay-2">{'Professional Cleaning'}<br /><span>{'You Can Trust'}</span></h1>
        <p className="hp-hero-intro anim-fadeInUp delay-3">
          We bring the sparkle back to your home or office. Detail-focused, reliable, and always on time. Based in Fairfield, Ohio serving the surrounding area.
        </p>
        <div className="hp-hero-btns anim-fadeInUp delay-4">
          {currentUser ? (
            <button className="hp-btn-primary" onClick={() => router.push(isAdmin ? '/admin' : '/dashboard')}>{isAdmin ? 'Go to Admin Panel' : 'Go to Dashboard'}</button>
          ) : (
            <>
              <button className="hp-btn-primary" onClick={() => setAuthMode('signup')}>{'Create Account'}</button>
              <button className="hp-btn-outline" onClick={() => setAuthMode('login')}>{'Log In'}</button>
            </>
          )}
        </div>
        {/* Trust badges */}
        <div className="anim-fadeIn delay-5" style={{ display:'flex', gap:'10px', justifyContent:'center', flexWrap:'wrap', marginTop:'20px' }}>
          {['✅ Insured & Trusted', '📍 Fairfield, Ohio', '⭐ 5-Star Rated'].map((b,i)=>(
            <span key={i} style={{ fontSize:'.74rem', fontWeight:'700', color:'#9ca3af', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', borderRadius:'99px', padding:'5px 13px' }}>{b}</span>
          ))}
        </div>
      </section>

      {/* SERVICES */}
      <section className="hp-services" id="services">
        <div className="hp-section-label anim-fadeInUp">{'What We Offer'}</div>
        <div className="hp-services-grid">
          <div className="hp-service-card anim-fadeInUp delay-2">
            <div className="hsc-icon">🏠</div>
            <h3>{'Residential'}</h3>
            <p>{'Full home cleaning tailored to your schedule. Weekly, bi-weekly, or one-time deep cleans.'}</p>
            <div className="hsc-price">{'From $120'}</div>
          </div>
          <div className="hp-service-card anim-fadeInUp delay-3">
            <div className="hsc-icon">🚚</div>
            <h3>{'Move Out / In'}</h3>
            <p>Leave your old place spotless or start fresh in your new home. Landlord-ready results.</p>
            <div className="hsc-price">{'From $150'}</div>
          </div>
          <div className="hp-service-card anim-fadeInUp delay-4">
            <div className="hsc-icon">🏢</div>
            <h3>{'Light Commercial'}</h3>
            <p>Offices, studios, and small businesses. Flexible scheduling before or after hours.</p>
            <div className="hsc-price">{'From $250'}</div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: '70px 24px 60px', maxWidth: '900px', margin: '0 auto' }}>
        <div className="hp-section-label">{'How It Works'}</div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: '0', position: 'relative', marginTop: '10px', flexWrap: 'wrap' }}>
          {[
            { step: '1', icon: '📋', title: 'Book Online', desc: 'Fill out a quick form with your details and get an instant estimate. No phone calls needed.' },
            { step: '2', icon: '✨', title: 'We Clean', desc: 'Our team arrives on time with all supplies. Sit back while we make your space sparkle.' },
            { step: '3', icon: '😊', title: 'You Relax', desc: 'Come home to a spotless space. Love it or we will make it right - guaranteed.' },
          ].map((s, i) => (
            <div key={i} style={{ flex: '1 1 250px', maxWidth: '280px', textAlign: 'center', padding: '20px 20px', position: 'relative', zIndex: 1 }}>
              <div style={{ width: '88px', height: '88px', borderRadius: '50%', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.2rem', background: i === 0 ? 'rgba(168,85,247,.12)' : i === 1 ? 'rgba(219,39,119,.12)' : 'rgba(96,165,250,.12)', border: '2px solid ' + (i === 0 ? 'rgba(168,85,247,.3)' : i === 1 ? 'rgba(219,39,119,.3)' : 'rgba(96,165,250,.3)'), boxShadow: '0 0 30px ' + (i === 0 ? 'rgba(168,85,247,.15)' : i === 1 ? 'rgba(219,39,119,.15)' : 'rgba(96,165,250,.15)') }}>
                {s.icon}
              </div>
              <div style={{ fontSize: '.65rem', fontWeight: '800', letterSpacing: '1.5px', textTransform: 'uppercase', color: i === 0 ? '#a855f7' : i === 1 ? '#db2777' : '#60a5fa', marginBottom: '8px' }}>{Step} {s.step}</div>
              <h3 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.15rem', fontWeight: '700', color: 'white', margin: '0 0 8px' }}>{s.title}</h3>
              <p style={{ fontSize: '.84rem', color: '#9ca3af', lineHeight: '1.65', margin: 0 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PICS / REVIEWS */}
      <section className="hp-gallery" id="pics">
        <div style={{ marginBottom: '8px' }}>
          <div className="hp-section-label" style={{ margin: 0 }}>{'Our Work'}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0 20px' }}>
          <button onClick={() => router.push('/gallery')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '22px 52px', background: 'linear-gradient(135deg,#a855f7,#db2777)', color: 'white', border: 'none', borderRadius: '20px', fontFamily: "'DM Sans',sans-serif", fontWeight: '900', fontSize: '1.25rem', cursor: 'pointer', boxShadow: '0 6px 40px rgba(168,85,247,.5), 0 0 80px rgba(219,39,119,.2)', letterSpacing: '.3px', transition: 'transform .15s, box-shadow .15s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 8px 60px rgba(168,85,247,.7), 0 0 100px rgba(219,39,119,.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 6px 40px rgba(168,85,247,.5), 0 0 80px rgba(219,39,119,.2)'; }}>
            <span style={{ fontSize: '1.5rem' }}>📷</span>
            {'See All Photos'}
            <span style={{ fontSize: '1.1rem', opacity: .85 }}>→</span>
          </button>
        </div>

        {/* Reviews */}
        <div id="reviews" style={{ position: 'relative', marginTop: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '3px', fontSize: '1.1rem' }}>{'⭐'.repeat(5)}</div>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.4rem', fontWeight: '900', color: 'white' }}>5.0</div>
            <div style={{ fontSize: '.8rem', color: '#9ca3af' }}>· {reviews.length} 'reviews' + ' \u00b7 ' + 'All 5-star'</div>
          </div>

          <div style={{
            display: 'flex', gap: '14px',
            overflowX: 'auto', paddingBottom: '12px',
            scrollbarWidth: 'thin', scrollbarColor: '#333 transparent',
            WebkitOverflowScrolling: 'touch',
          }}>
            {reviews.map((r, i) => (
              <div key={r.id || r.name || i} style={{
                flexShrink: 0, width: '280px',
                background: 'linear-gradient(160deg, #161616 0%, #111 100%)',
                border: '1px solid #2a2a2a', borderRadius: '18px',
                padding: '20px',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px',
              }}>
                <div>
                  <div style={{ fontSize: '.95rem', marginBottom: '10px', letterSpacing: '1px' }}>{'⭐'.repeat(r.stars)}</div>
                  <p style={{ color: '#d1d5db', fontSize: '.83rem', lineHeight: '1.65', margin: 0 }}>
                    &ldquo;{r.text}&rdquo;
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '12px', borderTop: '1px solid #222' }}>
                  <div style={{
                    width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg,#a855f7,#db2777)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: '800', fontSize: '.88rem', color: 'white',
                  }}>{r.name[0]}</div>
                  <div>
                    <div style={{ fontWeight: '700', color: 'white', fontSize: '.82rem' }}>{r.name}</div>
                    <div style={{ fontSize: '.72rem', color: '#6b7280', marginTop: '1px' }}>{r.date}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', fontSize: '.65rem', fontWeight: '700', color: '#a855f7', background: 'rgba(168,85,247,.12)', padding: '2px 8px', borderRadius: '99px', whiteSpace: 'nowrap' }}>{Verified}</div>
                  {isAdmin && r.id && (
                    <button onClick={(e) => { e.stopPropagation(); if(window.confirm('Delete this review?')) deleteDoc(doc(db, 'reviews', r.id)); }}
                      style={{ marginLeft: '4px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', color: '#ef4444', borderRadius: '8px', padding: '3px 10px', fontSize: '.62rem', fontWeight: '700', cursor: 'pointer' }}>
                      {'Delete'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ position: 'absolute', right: 0, top: '42px', bottom: '12px', width: '60px', background: 'linear-gradient(to left,#151515 30%,transparent)', pointerEvents: 'none', borderRadius: '0 18px 18px 0' }} />
        </div>
      </section>

      {/* LOCATION */}
      <section className="hp-location" id="schedule">
        <div className="hp-section-label">{'Locations'}</div>
        <div className="hp-location-stack">
          <div className="hp-location-box">
            <span className="hp-loc-pin">📍</span>
            <div>
              <strong>{'Based In Fairfield, Ohio'}</strong>
              <p>{'Serving Fairfield and surrounding cities in the Cincinnati area'}</p>
            </div>
          </div>
          <button className="hp-btn-primary hp-loc-btn" onClick={() => setAuthMode('signup')}>
            {'Login | Sign Up'}
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="hp-footer">
        <div className="hp-footer-links">
          <a href="/policy">{'Policy'}</a>
          <a href="#">{'Careers'}</a>
        </div>
        <div className="hp-footer-contact">
          <p>{'Text or Call'}</p>
          <a href="tel:5133709082">513-370-9082</a>
          <a href="tel:5132576942">513-257-6942</a>
        </div>
        <div className="hp-footer-brand">
          <img src="/logo.png" alt="Yoselin's Cleaning" style={{ height: '120px', objectFit: 'contain', marginBottom: '10px' }} />
        </div>
        <p className="hp-footer-copy">© 2025 Yoselins Cleaning. {'All rights reserved.'}</p>
      </footer>



      {/* VERIFY EMAIL MODAL */}
      {authMode === 'verify' && (
        <div className="am-overlay">
          <div className="am-modal" style={{textAlign:'center'}}>
            <div className="am-logo">📧</div>
            <h2 className="am-title">{'Check Your Email'}</h2>
            <p className="am-sub" style={{marginBottom:'6px'}}>
              {'We sent a verification link to'}<br />
              <strong style={{color:'white'}}>{auth.currentUser?.email}</strong>
            </p>
            <p style={{color:'#6b7280',fontSize:'.76rem',marginBottom:'22px'}}>
              {'Click the link in the email, then press the button below.'}
            </p>
            {verifyError   && <p className="am-error" style={{marginBottom:'12px'}}>{verifyError}</p>}
            {verifyResent  && <p style={{color:'#10b981',fontSize:'.8rem',marginBottom:'12px'}}>✅ {'Email resent! Check your inbox.'}</p>}
            <button className="am-submit" onClick={checkVerification} disabled={busy} style={{marginBottom:'10px'}}>
              {busy ? '...' : "I've Verified My Email"}
            </button>
            <button className="am-link-btn" onClick={resendVerification} disabled={busy}>
              {'Resend verification email'}
            </button>
            <button className="am-link-btn" style={{color:'#ef4444'}} onClick={() => { signOut(auth); setAuthMode(null); setVerifyError(''); setVerifyResent(false); }}>
              {'Sign out and use a different account'}
            </button>
          </div>
        </div>
      )}

      {/* AUTH MODAL */}
      {authMode && authMode !== 'verify' && (
        <div className="am-overlay" onClick={(e) => e.target.classList.contains('am-overlay') && closeModal()}>
          <div className="am-modal">
            <button className="am-close" onClick={closeModal}>{'\u2715'}</button>
            <div className="am-logo">
              <img src="/logo.png" alt="Yoselin's Cleaning" style={{ height: '150px', objectFit: 'contain' }} />
            </div>
            <h2 className="am-title">
              {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="am-sub">
              {authMode === 'login' ? 'Sign in to your account' : 'Set up your account in seconds'}
            </p>

            {resetSent ? (
              <div className="am-reset-success">
                <div style={{fontSize:'2rem',marginBottom:'8px'}}>📧</div>
                <p>{'Password reset email sent! Check your inbox.'}</p>
                <button className="am-link-btn" onClick={() => setResetSent(false)}>{'Back to Login'}</button>
              </div>
            ) : (
              <>
                {authMode === 'signup' && (
                  <div className="am-field">
                    <label>{'Your Name'}</label>
                    <input type="text" placeholder='First and last name' value={name}
                      onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSignup()} />
                  </div>
                )}
                <div className="am-field">
                  <label>{'Email'}</label>
                  <input type="email" placeholder='your@email.com' value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (authMode === 'login' ? handleLogin() : handleSignup())} />
                </div>
                <div className="am-field">
                  <label>{'Password'}</label>
                  <div className="am-pass-wrap">
                    <input type={showPass ? 'text' : 'password'}
                      placeholder={authMode === 'signup' ? 'At least 6 characters' : 'Your password'}
                      value={password} onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (authMode === 'login' ? handleLogin() : handleSignup())} />
                    <button className="am-eye" onClick={() => setShowPass(s => !s)}>
                    {showPass ? '👁' : '🙈'}
                    </button>
                  </div>
                </div>
                {error && <p className="am-error">{error}</p>}
                <button className="am-submit" onClick={authMode === 'login' ? handleLogin : handleSignup} disabled={busy}>
                  {busy ? '...' : authMode === 'login' ? 'Log In' : 'Create Account'}
                </button>
                {authMode === 'login' && (
                  <button className="am-link-btn" onClick={handleReset} disabled={busy}>{'Forgot password?'}</button>
                )}
                <div className="am-divider"><span>{'or'}</span></div>
                <button className="am-google" onClick={handleGoogleSignIn} disabled={busy}>
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" alt="" />
                  {'Continue with Google'}
                </button>
                <p className="am-switch">
                  {authMode === 'login' ? (
                    <>{'No account?'} <button onClick={() => { setAuthMode('signup'); setError(''); }}>{'Sign up'}</button></>
                  ) : (
                    <>{'Already have an account?'} <button onClick={() => { setAuthMode('login'); setError(''); }}>{'Log in'}</button></>
                  )}
                </p>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

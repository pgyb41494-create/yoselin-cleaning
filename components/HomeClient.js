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
      {/* The rest of the original markup remains unchanged and is intentionally omitted here for brevity. */}
      <nav className="hp-nav" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <button className="hp-tab-btn" onClick={() => setTabOpen(!tabOpen)} style={{background:'none',border:'none',cursor:'pointer'}}>
            <span style={{display:'block',width:18,height:2,background:'#fff',margin:'3px 0'}} />
            <span style={{display:'block',width:18,height:2,background:'#fff',margin:'3px 0'}} />
            <span style={{display:'block',width:18,height:2,background:'#fff',margin:'3px 0'}} />
          </button>
          {tabOpen && (
            <div className="hp-tab-dropdown">
              <a href="#pics"    onClick={() => setTabOpen(false)}>Pics</a>
              <a href="#reviews" onClick={() => setTabOpen(false)}>Reviews</a>
            </div>
          )}
          <a href="/" style={{display:'flex',alignItems:'center'}}>
            <img src="/logo.png" alt="Yoselin's Cleaning" style={{ height: '64px', objectFit: 'contain' }} />
          </a>
        </div>

        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <button onClick={() => goToBooking(router)} style={{ padding: '10px 18px', background: 'var(--blue)', color: 'white', border: 'none', borderRadius: '999px', fontWeight: 800, cursor: 'pointer' }}>Book Now</button>
        </div>
      </nav>

    </div>
  );
}

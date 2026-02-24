'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GoogleAuthProvider, signInWithPopup, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  updateProfile, sendPasswordResetEmail,
} from 'firebase/auth';
import { auth, ADMIN_EMAIL } from '../lib/firebase';

const reviews = [
  { name: 'Maria G.', stars: 5, text: 'Yoselin did an amazing job! My house has never looked this clean. She even organized my pantry without me asking. Highly recommend!', date: 'Jan 2025' },
  { name: 'Ashley R.', stars: 5, text: 'Super professional and thorough. I booked a deep clean and she went above and beyond. Will definitely be booking again every month!', date: 'Feb 2025' },
  { name: 'Carlos M.', stars: 5, text: 'Best cleaning service I have ever used. On time, very detailed, and left everything sparkling. The booking process was so easy too.', date: 'Feb 2025' },
  { name: 'Tiffany W.', stars: 5, text: 'I was nervous about letting someone in my home but Yoselin made me feel so comfortable. Trustworthy, kind, and incredibly thorough.', date: 'Mar 2025' },
];

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState(null); // null | 'login' | 'signup'
  const [tabOpen, setTabOpen] = useState(false);

  // form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        if (user.email === ADMIN_EMAIL) router.push('/admin');
        else router.push('/dashboard');
      } else {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  const redirect = (user) => {
    if (user.email === ADMIN_EMAIL) router.push('/admin');
    else router.push('/dashboard');
  };

  const handleGoogleSignIn = async () => {
    setError(''); setBusy(true);
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      redirect(result.user);
    } catch {
      setError('Google sign-in failed. Please try again.');
      setBusy(false);
    }
  };

  const handleLogin = async () => {
    setError(''); setBusy(true);
    if (!email || !password) { setError('Please fill in all fields.'); setBusy(false); return; }
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      redirect(result.user);
    } catch (e) {
      const msg = e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found'
        ? 'Incorrect email or password.' : 'Login failed. Please try again.';
      setError(msg); setBusy(false);
    }
  };

  const handleSignup = async () => {
    setError(''); setBusy(true);
    if (!name.trim()) { setError('Please enter your name.'); setBusy(false); return; }
    if (!email || !password) { setError('Please fill in all fields.'); setBusy(false); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); setBusy(false); return; }
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(result.user, { displayName: name.trim() });
      redirect(result.user);
    } catch (e) {
      const msg = e.code === 'auth/email-already-in-use'
        ? 'An account with this email already exists. Try logging in.' : 'Sign up failed. Please try again.';
      setError(msg); setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!email) { setError('Enter your email above first.'); return; }
    setError(''); setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true); setBusy(false);
    } catch {
      setError('Could not send reset email.'); setBusy(false);
    }
  };

  const closeModal = () => { setAuthMode(null); setError(''); setName(''); setEmail(''); setPassword(''); setResetSent(false); };

  if (loading) return <div className="spinner-page"><div className="spinner"></div></div>;

  return (
    <div className="hp-root">

      {/* ── NAVBAR ── */}
      <nav className="hp-nav">
        <div className="hp-tab-wrap">
          <button className="hp-tab-btn" onClick={() => setTabOpen(!tabOpen)}>
            <span /><span /><span />
          </button>
          {tabOpen && (
            <div className="hp-tab-dropdown">
              <a href="#pics" onClick={() => setTabOpen(false)}>📸 Pics</a>
              <a href="#reviews" onClick={() => setTabOpen(false)}>⭐ Reviews</a>
              <a href="#services" onClick={() => setTabOpen(false)}>💰 Quotes</a>
              <a href="#schedule" onClick={() => setTabOpen(false)}>🗓 Schedule</a>
            </div>
          )}
        </div>
        <div className="hp-nav-brand">Yoselins Cleaning</div>
        <button className="hp-nav-login" onClick={() => setAuthMode('login')}>Login</button>
      </nav>

      {/* ── HERO ── */}
      <section className="hp-hero">
        <p className="hp-hero-tagline">Ready To Make Your Place Shine</p>
        <h1 className="hp-hero-title">Professional Cleaning<br /><span>You Can Trust</span></h1>
        <p className="hp-hero-intro">
          We bring the sparkle back to your home or office. Detail-focused, reliable, and always on time.
          Based in Fairfield, Ohio — serving the surrounding area.
        </p>
        <div className="hp-hero-btns">
          <button className="hp-btn-primary" onClick={() => setAuthMode('signup')}>Create Account</button>
          <button className="hp-btn-outline" onClick={() => setAuthMode('login')}>Log In</button>
        </div>
      </section>

      {/* ── SERVICES ── */}
      <section className="hp-services" id="services">
        <div className="hp-section-label">What We Offer</div>
        <div className="hp-services-grid">
          <div className="hp-service-card">
            <div className="hsc-icon">🏠</div>
            <h3>Residential</h3>
            <p>Full home cleaning tailored to your schedule. Weekly, bi-weekly, or one-time deep cleans.</p>
            <div className="hsc-price">From $120</div>
          </div>
          <div className="hp-service-card">
            <div className="hsc-icon">🏢</div>
            <h3>Light Commercial</h3>
            <p>Offices, studios, and small businesses. Flexible scheduling before or after hours.</p>
            <div className="hsc-price">From $150</div>
          </div>
          <div className="hp-service-card">
            <div className="hsc-icon">📦</div>
            <h3>Move Out / In</h3>
            <p>Leave your old place spotless or start fresh in your new home. Landlord-ready results.</p>
            <div className="hsc-price">From $250</div>
          </div>
        </div>
      </section>

      {/* ── PICS / REVIEWS ── */}
      <section className="hp-gallery" id="pics">
        <div className="hp-section-label">Pics / Reviews</div>
        <div className="hp-photos-row">
          {['Before & After', 'Kitchen Deep Clean', 'Bathroom Detail', 'Living Room', 'Office Space'].map((label, i) => (
            <div className="hp-photo" key={i}>
              <div className="hp-photo-inner">
                <span className="hp-photo-icon">📷</span>
                <span className="hp-photo-label">{label}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="hp-reviews-grid" id="reviews">
          {reviews.map(r => (
            <div className="hp-review-card" key={r.name}>
              <div className="hrc-stars">{'⭐'.repeat(r.stars)}</div>
              <p className="hrc-text">"{r.text}"</p>
              <div className="hrc-footer">
                <div className="hrc-avatar">{r.name[0]}</div>
                <div>
                  <div className="hrc-name">{r.name}</div>
                  <div className="hrc-date">{r.date}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── LOCATION ── */}
      <section className="hp-location" id="schedule">
        <div className="hp-section-label">Locations</div>
        <div className="hp-location-box">
          <span className="hp-loc-pin">📍</span>
          <div>
            <strong>Based In Fairfield, Ohio</strong>
            <p>Serving Fairfield and surrounding cities in the Cincinnati area</p>
          </div>
        </div>
        <button className="hp-btn-primary" style={{marginTop:'28px'}} onClick={() => setAuthMode('signup')}>
          Login | Sign Up
        </button>
      </section>

      {/* ── FOOTER ── */}
      <footer className="hp-footer">
        <div className="hp-footer-links">
          <a href="#">Policy</a>
          <a href="#">Careers</a>
        </div>
        <div className="hp-footer-contact">
          <p>Text or Call</p>
          <a href="tel:5133709082">513-370-9082</a>
          <a href="tel:5132576942">513-257-6942</a>
        </div>
        <div className="hp-footer-brand">✨ Yoselins Cleaning</div>
        <p className="hp-footer-copy">© 2025 Yoselins Cleaning. All rights reserved.</p>
      </footer>

      {/* ── AUTH MODAL ── */}
      {authMode && (
        <div className="am-overlay" onClick={(e) => e.target.classList.contains('am-overlay') && closeModal()}>
          <div className="am-modal">

            {/* Close */}
            <button className="am-close" onClick={closeModal}>✕</button>

            {/* Logo */}
            <div className="am-logo">✨</div>
            <h2 className="am-title">
              {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="am-sub">
              {authMode === 'login' ? 'Sign in to your account' : 'Set up your account in seconds'}
            </p>

            {resetSent ? (
              <div className="am-reset-success">
                <div style={{fontSize:'2rem',marginBottom:'8px'}}>📧</div>
                <p>Password reset email sent! Check your inbox.</p>
                <button className="am-link-btn" onClick={() => setResetSent(false)}>Back to Login</button>
              </div>
            ) : (
              <>
                {/* Name field — signup only */}
                {authMode === 'signup' && (
                  <div className="am-field">
                    <label>Your Name</label>
                    <input
                      type="text"
                      placeholder="First and last name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSignup()}
                    />
                  </div>
                )}

                <div className="am-field">
                  <label>Email</label>
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (authMode === 'login' ? handleLogin() : handleSignup())}
                  />
                </div>

                <div className="am-field">
                  <label>Password</label>
                  <div className="am-pass-wrap">
                    <input
                      type={showPass ? 'text' : 'password'}
                      placeholder={authMode === 'signup' ? 'At least 6 characters' : 'Your password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (authMode === 'login' ? handleLogin() : handleSignup())}
                    />
                    <button className="am-eye" onClick={() => setShowPass(s => !s)}>
                      {showPass ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                {error && <p className="am-error">{error}</p>}

                <button
                  className="am-submit"
                  onClick={authMode === 'login' ? handleLogin : handleSignup}
                  disabled={busy}
                >
                  {busy ? '...' : authMode === 'login' ? 'Log In' : 'Create Account'}
                </button>

                {/* Forgot password */}
                {authMode === 'login' && (
                  <button className="am-link-btn" onClick={handleReset} disabled={busy}>
                    Forgot password?
                  </button>
                )}

                <div className="am-divider"><span>or</span></div>

                <button className="am-google" onClick={handleGoogleSignIn} disabled={busy}>
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" alt="" />
                  Continue with Google
                </button>

                <p className="am-switch">
                  {authMode === 'login' ? (
                    <>No account? <button onClick={() => { setAuthMode('signup'); setError(''); }}>Sign up</button></>
                  ) : (
                    <>Already have an account? <button onClick={() => { setAuthMode('login'); setError(''); }}>Log in</button></>
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

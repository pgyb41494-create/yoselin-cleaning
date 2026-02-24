'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from '../lib/firebase';

const reviews = [
  { name: 'Maria G.', stars: 5, text: 'Yoselin did an amazing job! My house has never looked this clean. She even organized my pantry without me asking. Highly recommend!', date: 'Jan 2025' },
  { name: 'Ashley R.', stars: 5, text: 'Super professional and thorough. I booked a deep clean and she went above and beyond. Will definitely be booking again every month!', date: 'Feb 2025' },
  { name: 'Carlos M.', stars: 5, text: 'Best cleaning service I have ever used. On time, very detailed, and left everything sparkling. The booking process was so easy too.', date: 'Feb 2025' },
  { name: 'Tiffany W.', stars: 5, text: 'I was nervous about letting someone in my home but Yoselin made me feel so comfortable. Trustworthy, kind, and incredibly thorough.', date: 'Mar 2025' },
];

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');
  const [tabOpen, setTabOpen] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (user.email === ADMIN_EMAIL) {
          router.push('/admin');
        } else {
          router.push('/dashboard');
        }
      } else {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  const signIn = async () => {
    setError('');
    setSigningIn(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      setError('Sign-in failed. Please try again.');
      setSigningIn(false);
    }
  };

  if (loading) return (
    <div className="spinner-page"><div className="spinner"></div></div>
  );

  return (
    <div className="hp-root">

      {/* ── NAVBAR ── */}
      <nav className="hp-nav">
        {/* Left tab button */}
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

        {/* Center brand */}
        <div className="hp-nav-brand">Yoselins Cleaning</div>

        {/* Right login */}
        <button className="hp-nav-login" onClick={signIn} disabled={signingIn}>
          {signingIn ? '...' : 'Login'}
        </button>
      </nav>

      {/* ── HERO / INTRO ── */}
      <section className="hp-hero">
        <p className="hp-hero-tagline">Ready To Make Your Place Shine</p>
        <h1 className="hp-hero-title">Professional Cleaning<br /><span>You Can Trust</span></h1>
        <p className="hp-hero-intro">
          We bring the sparkle back to your home or office. Detail-focused, reliable, and always on time.
          Based in Fairfield, Ohio — serving the surrounding area.
        </p>
        <div className="hp-hero-btns">
          <button className="hp-btn-primary" onClick={signIn} disabled={signingIn}>
            {signingIn ? 'Signing in...' : 'Login / Sign Up'}
          </button>
          <a href="#services" className="hp-btn-outline">Get a Quote</a>
        </div>
        {error && <p className="hp-err">{error}</p>}
      </section>

      {/* ── WHAT WE OFFER ── */}
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

        {/* Photo placeholders */}
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

        {/* Reviews */}
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
        <button className="hp-btn-primary" style={{marginTop:'28px'}} onClick={signIn} disabled={signingIn}>
          {signingIn ? 'Signing in...' : 'Login | Sign Up'}
        </button>
        {error && <p className="hp-err">{error}</p>}
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

    </div>
  );
}

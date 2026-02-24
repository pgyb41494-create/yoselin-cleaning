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
  { name: 'James P.', stars: 5, text: 'Moved into a new place and hired Yoselin for a move-in clean. It was spotless — smelled amazing and everything was gleaming. 10/10!', date: 'Mar 2025' },
  { name: 'Sandra L.', stars: 5, text: 'My go-to cleaner now. She remembers exactly how I like things and always does a little extra. Worth every penny!', date: 'Apr 2025' },
];

const services = [
  { icon: '🏠', name: 'Standard Clean', desc: 'Regular maintenance cleaning to keep your home fresh and tidy every week or bi-weekly.', price: 'From $120' },
  { icon: '✨', name: 'Deep Clean', desc: 'Top-to-bottom thorough cleaning including inside appliances, baseboards, and hard-to-reach areas.', price: 'From $220' },
  { icon: '📦', name: 'Move In / Out', desc: 'Leave your old place spotless or start fresh in your new home. Perfect for landlords too.', price: 'From $250' },
  { icon: '🏢', name: 'Office Cleaning', desc: 'Keep your workspace clean and professional. Flexible scheduling for before or after business hours.', price: 'From $150' },
  { icon: '🛁', name: 'Bathroom Detail', desc: 'Detailed scrubbing, grout cleaning, and sanitization for a hotel-quality bathroom every time.', price: 'Add-on $40' },
  { icon: '🪟', name: 'Window Washing', desc: 'Streak-free interior window cleaning to let the light shine in. Interior windows only.', price: 'Add-on $30' },
];

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (user.email === ADMIN_EMAIL) {
          router.push('/admin');
        } else {
          const q = query(collection(db, 'requests'), where('userId', '==', user.uid));
          const snap = await getDocs(q);
          router.push(snap.empty ? '/book' : '/portal');
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
    <div className="home-root">

      {/* ── NAVBAR ── */}
      <nav className="home-nav">
        <a href="#" className="hn-brand">
          <span className="hn-logo">✨</span>
          <span>Yoselin's <em>Cleaning</em></span>
        </a>
        <div className="hn-links">
          <a href="#services">Services</a>
          <a href="#reviews">Reviews</a>
          <a href="#contact">Contact</a>
        </div>
        <button className="hn-login" onClick={signIn} disabled={signingIn}>
          {signingIn ? 'Signing in…' : 'Sign In / Book Now'}
        </button>
        <button className="hn-burger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <span /><span /><span />
        </button>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="mobile-menu">
          <a href="#services" onClick={() => setMenuOpen(false)}>Services</a>
          <a href="#reviews" onClick={() => setMenuOpen(false)}>Reviews</a>
          <a href="#contact" onClick={() => setMenuOpen(false)}>Contact</a>
          <button className="hn-login w-full" onClick={signIn}>Sign In / Book Now</button>
        </div>
      )}

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-content">
          <div className="hero-badge">⭐ 5-Star Rated Cleaning Service</div>
          <h1 className="hero-title">
            Your Home Deserves<br />
            <span>Spotless</span> Every Time
          </h1>
          <p className="hero-sub">
            Yoselin's Cleaning brings professional, reliable, and detail-obsessed cleaning to your doorstep.
            Trusted by hundreds of happy clients across the area.
          </p>
          <div className="hero-btns">
            <button className="btn-primary" onClick={signIn} disabled={signingIn}>
              {signingIn ? '…' : '🗓 Book a Cleaning'}
            </button>
            <a href="#services" className="btn-ghost">See Services ↓</a>
          </div>
          {error && <p className="auth-err" style={{marginTop:'12px'}}>{error}</p>}
          <div className="hero-stats">
            <div className="hstat"><strong>200+</strong><span>Happy Clients</span></div>
            <div className="hstat-div" />
            <div className="hstat"><strong>5★</strong><span>Average Rating</span></div>
            <div className="hstat-div" />
            <div className="hstat"><strong>3 yrs</strong><span>Experience</span></div>
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
              {['Deep Clean Package','Move-In Special','Office Cleaning'].map(s => (
                <div className="hic-item" key={s}>
                  <span className="hic-check">✓</span> {s}
                </div>
              ))}
            </div>
            <div className="hic-cta" onClick={signIn}>Book Now →</div>
          </div>
        </div>
      </section>

      {/* ── WHY US ── */}
      <section className="why-section">
        <div className="section-container">
          {[
            { icon: '🔒', title: 'Trusted & Insured', desc: 'Fully vetted, background-checked, and insured so you can feel safe letting us in.' },
            { icon: '⏰', title: 'Always On Time', desc: 'We respect your schedule. Punctual every single visit, guaranteed.' },
            { icon: '🌿', title: 'Eco-Friendly Products', desc: 'Safe for kids, pets, and the planet. We use non-toxic, green-certified supplies.' },
            { icon: '💬', title: 'Easy Communication', desc: 'Chat directly through your client portal. No calls needed, updates in real time.' },
          ].map(w => (
            <div className="why-card" key={w.title}>
              <div className="why-icon">{w.icon}</div>
              <h3>{w.title}</h3>
              <p>{w.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── SERVICES ── */}
      <section className="services-section" id="services">
        <div className="section-container">
          <div className="section-label">What We Offer</div>
          <h2 className="section-title">Cleaning Services<br /><span>Tailored For You</span></h2>
          <p className="section-sub">Every space is different. Pick the service that fits your needs or mix and match extras.</p>
          <div className="services-grid">
            {services.map(s => (
              <div className="service-card" key={s.name}>
                <div className="sc-icon">{s.icon}</div>
                <div className="sc-body">
                  <h3>{s.name}</h3>
                  <p>{s.desc}</p>
                  <div className="sc-price">{s.price}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{textAlign:'center',marginTop:'36px'}}>
            <button className="btn-primary" onClick={signIn} disabled={signingIn}>
              Get an Instant Quote →
            </button>
          </div>
        </div>
      </section>

      {/* ── REVIEWS ── */}
      <section className="reviews-section" id="reviews">
        <div className="section-container">
          <div className="section-label">Client Love</div>
          <h2 className="section-title">What People Are<br /><span>Saying About Us</span></h2>
          <div className="reviews-grid">
            {reviews.map(r => (
              <div className="review-card" key={r.name}>
                <div className="rc-stars">{'⭐'.repeat(r.stars)}</div>
                <p className="rc-text">"{r.text}"</p>
                <div className="rc-footer">
                  <div className="rc-avatar">{r.name[0]}</div>
                  <div>
                    <div className="rc-name">{r.name}</div>
                    <div className="rc-date">{r.date}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="cta-banner">
        <div className="cta-content">
          <h2>Ready for a Sparkling Clean Home?</h2>
          <p>Book in under 2 minutes. No calls, no hassle — just a cleaner home.</p>
          <button className="btn-primary btn-large" onClick={signIn} disabled={signingIn}>
            🗓 Book My Cleaning Now
          </button>
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section className="contact-section" id="contact">
        <div className="section-container contact-grid">
          <div>
            <div className="section-label">Get in Touch</div>
            <h2 className="section-title" style={{marginBottom:'16px'}}>Have Questions?<br /><span>We're Here</span></h2>
            <p style={{color:'#6b7280',fontSize:'.9rem',lineHeight:'1.7',marginBottom:'24px'}}>
              Whether you want a custom quote, have a special request, or just want to know more — sign in to message us directly through your client portal.
            </p>
            <div className="contact-items">
              <div className="contact-item">📍 <span>Serving the local area & surrounding cities</span></div>
              <div className="contact-item">🕐 <span>Mon–Sat: 8am – 6pm</span></div>
              <div className="contact-item">💬 <span>Message us via your client portal</span></div>
            </div>
          </div>
          <div className="contact-box">
            <div className="cb-icon">✨</div>
            <h3>Ready to Book?</h3>
            <p>Sign in with Google to book your first cleaning, get a quote, and track everything in one place.</p>
            <button className="btn-primary" style={{width:'100%',marginTop:'20px'}} onClick={signIn} disabled={signingIn}>
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" alt="" style={{marginRight:'8px',verticalAlign:'middle'}} />
              {signingIn ? 'Signing in…' : 'Continue with Google'}
            </button>
            {error && <p className="auth-err" style={{marginTop:'10px'}}>{error}</p>}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="home-footer">
        <div className="hf-brand">✨ Yoselin's <em>Cleaning</em></div>
        <p className="hf-copy">© 2025 Yoselin's Cleaning Service. All rights reserved.</p>
        <p className="hf-tagline">Professional · Reliable · Sparkling Clean</p>
      </footer>

    </div>
  );
}

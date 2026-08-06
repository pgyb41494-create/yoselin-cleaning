'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { isAdminEmail } from '../lib/authHelpers';
import { THUMBTACK_REVIEWS, THUMBTACK_RATING } from '../lib/reviews';
import { SERVICE_TYPES } from '../lib/services';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import AuthModal from '../components/AuthModal';

const FALLBACK_REVIEWS = THUMBTACK_REVIEWS;

const HOMEPAGE_SERVICES = SERVICE_TYPES.slice(0, 6).map((s) => ({
  title: s.name,
  desc: s.desc,
  price: `From $${s.from}`,
  icon: s.icon,
}));

const STEPS = [
  { n: '1', title: 'Get a free quote', desc: 'Tell us about your space online — takes about 5 minutes.' },
  { n: '2', title: 'Pick your date', desc: 'Choose from available times that work for you.' },
  { n: '3', title: 'Enjoy a spotless space', desc: 'Yoselin arrives on time and leaves everything shining.' },
];

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState(null);
  const [liveReviews, setLiveReviews] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('login') === '1') setAuthMode('login');
      else if (params.get('signup') === '1') setAuthMode('signup');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'reviews'), orderBy('createdAt', 'desc')),
      (snap) => setLiveReviews(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {}
    );
    return () => unsub();
  }, []);

  const isAdmin = user && isAdminEmail(user.email);
  const reviews = [...liveReviews, ...FALLBACK_REVIEWS.filter(
    (fb) => !liveReviews.some((lr) => lr.name === fb.name)
  )];

  const goQuote = () => {
    if (user && !isAdmin) router.push('/book');
    else if (user && isAdmin) router.push('/admin');
    else setAuthMode('signup');
  };

  if (loading) {
    return (
      <div className="spinner-page">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <>
      <SiteHeader onLoginClick={setAuthMode} transparent />
      <main>
        {/* Hero */}
        <section className="hero">
          <div className="container hero__inner">
            <p className="hero__eyebrow">Fairfield, OH · Insured · 5-star rated</p>
            <h1>Professional cleaning,<br />done right.</h1>
            <p className="hero__lead">
              Reliable home and office cleaning for Fairfield and the Cincinnati area.
              Free estimates, easy online booking, and results you can see.
            </p>
            <div className="hero__actions">
              <button type="button" className="btn btn-primary btn-lg" onClick={goQuote}>
                Get a Free Quote
              </button>
              <a href="tel:5132576942" className="btn btn-outline btn-lg">
                Call 513-257-6942
              </a>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="section section--muted">
          <div className="container">
            <h2 className="section__title">How it works</h2>
            <div className="steps">
              {STEPS.map((s) => (
                <div key={s.n} className="step">
                  <div className="step__num">{s.n}</div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Services */}
        <section className="section" id="services">
          <div className="container">
            <h2 className="section__title">Services</h2>
            <p className="section__sub">Residential and light commercial — flexible scheduling to fit your life.</p>
            <div className="cards cards--wide">
              {HOMEPAGE_SERVICES.map((s) => (
                <article key={s.title} className="card card--service">
                  <span className="card__icon">{s.icon}</span>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                  <span className="card__price">{s.price}</span>
                </article>
              ))}
            </div>
            <p className="section__sub" style={{ marginTop: 16 }}>
              Also offering painting, pressure washing, remodeling, junk removal, organizing &amp; more.
            </p>
            <div className="section__cta">
              <button type="button" className="btn btn-primary" onClick={goQuote}>
                Start your quote
              </button>
            </div>
          </div>
        </section>

        {/* Reviews */}
        <section className="section section--muted" id="reviews">
          <div className="container">
            <div className="reviews-head">
              <div>
                <h2 className="section__title section__title--left">What clients say</h2>
                <p className="reviews-score">
                  ★★★★★ <strong>{THUMBTACK_RATING.score}</strong> on {THUMBTACK_RATING.label} · {THUMBTACK_RATING.count}+ reviews
                </p>
              </div>
            </div>
            <div className="reviews-scroll">
              {reviews.map((r, i) => (
                <blockquote key={r.id || i} className="review">
                  <p>&ldquo;{r.text}&rdquo;</p>
                  <footer>
                    <strong>{r.name}</strong>
                    {r.service && <span className="review__service">{r.service}</span>}
                    {r.date && <span>{r.date}</span>}
                    {r.source && <span className="review__source">{r.source}</span>}
                    {isAdmin && r.id && (
                      <button
                        type="button"
                        className="review__delete"
                        onClick={() => { if (window.confirm('Delete this review?')) deleteDoc(doc(db, 'reviews', r.id)); }}
                      >
                        Delete
                      </button>
                    )}
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>

        {/* Gallery teaser */}
        <section className="section">
          <div className="container container--narrow cta-banner">
            <h2>See our work</h2>
            <p>Before-and-after photos from real cleanings across Fairfield and nearby cities.</p>
            <button type="button" className="btn btn-outline" onClick={() => router.push('/gallery')}>
              View gallery
            </button>
          </div>
        </section>

        {/* Final CTA */}
        <section className="section section--accent">
          <div className="container container--narrow cta-banner cta-banner--light">
            <h2>Ready for a cleaner home?</h2>
            <p>Get your free estimate in minutes. No commitment required.</p>
            <button type="button" className="btn btn-white btn-lg" onClick={goQuote}>
              Get a Free Quote
            </button>
          </div>
        </section>
      </main>

      <SiteFooter />

      <AuthModal
        mode={authMode}
        onClose={() => setAuthMode(null)}
        onModeChange={setAuthMode}
        redirectTo="/book"
      />
    </>
  );
}

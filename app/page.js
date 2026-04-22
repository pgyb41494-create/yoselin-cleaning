import React, { Suspense } from 'react';
import HomeClient from '../components/HomeClient';
import { FALLBACK_REVIEWS } from '../lib/fallbacks';

function ServerFallback() {
  return (
    <div className="site-root">
      <nav className="hp-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center' }}>
            <img src="/logo.png" alt="Yoselin's Cleaning" style={{ height: 64, objectFit: 'contain' }} />
          </a>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/?auth=login" style={{ padding: '10px 18px', background: 'var(--blue)', color: 'white', borderRadius: 999, fontWeight: 800, textDecoration: 'none' }}>Book Now</a>
        </div>
      </nav>

      <div style={{ minHeight: '48vh', background: 'linear-gradient(180deg, rgba(22,11,20,1) 0%, rgba(37,16,27,1) 60%)', padding: '36px 18px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', color: '#e6e6e6' }}>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 900 }}>Professional, Reliable, Sparkling Clean</h1>
          <p style={{ color: '#bdbdbd', marginTop: 8 }}>Local home cleaning services — trusted by neighbors.</p>
        </div>
      </div>

      <section style={{ padding: '36px 18px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ color: '#f3f3f3', marginBottom: 12 }}>What customers say</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {FALLBACK_REVIEWS.slice(0,6).map((r, i) => (
            <div key={i} style={{ background: '#0f0f10', border: '1px solid #222', padding: 16, borderRadius: 12 }}>
              <div style={{ fontWeight: 800, color: 'white' }}>{r.name}</div>
              <div style={{ color: '#9ca3af', fontSize: '.85rem', margin: '8px 0' }}>{r.text}</div>
              <div style={{ color: '#6b7280', fontSize: '.78rem' }}>{r.date}</div>
            </div>
          ))}
        </div>
      </section>

      <a href="/?auth=login" className="persistent-book-cta">Book Now</a>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<ServerFallback />}>
      <HomeClient />
    </Suspense>
  );
}

import React, { Suspense } from 'react';
import HomeClient from '../components/HomeClient';

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

      <div style={{ minHeight: '66vh', background: 'linear-gradient(180deg, rgba(22,11,20,1) 0%, rgba(37,16,27,1) 60%)' }} />

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

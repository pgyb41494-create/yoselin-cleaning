'use client';

import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';

export function LegalSection({ title, children }) {
  return (
    <section className="legal-section">
      <h2>{title}</h2>
      <div className="legal-section__body">{children}</div>
    </section>
  );
}

export function LegalTerm({ term, children }) {
  return (
    <div className="legal-term">
      <h3>{term}</h3>
      <div>{children}</div>
    </div>
  );
}

export default function LegalPage({ title, subtitle, children }) {
  return (
    <>
      <SiteHeader />
      <main className="legal-page">
        <div className="container container--narrow">
          <header className="legal-page__head">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </header>
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

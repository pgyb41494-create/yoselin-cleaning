import { Suspense } from 'react';
import ResetPasswordClient from './ResetPasswordClient';

export const dynamic = 'force-dynamic';

export default function ResetPasswordPage({ searchParams }) {
  return (
    <Suspense
      fallback={(
        <main className="rp-page">
          <section className="rp-card">
            <div className="rp-brand">
              <img src="/logo.png" alt="Yoselin's Cleaning" />
            </div>
            <h1 className="rp-title">Reset Your Password</h1>
            <p className="rp-sub">Loading reset page...</p>
          </section>
        </main>
      )}
    >
      <ResetPasswordClient searchParams={searchParams} />
    </Suspense>
  );
}

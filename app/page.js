import React, { Suspense } from 'react';
import HomeClient from '../components/HomeClient';

export default function Page() {
  return (
    <Suspense fallback={<div className="spinner-page"><div className="spinner"/></div>}>
      <HomeClient />
    </Suspense>
  );
}

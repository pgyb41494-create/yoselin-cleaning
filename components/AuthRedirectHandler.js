'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { completeGoogleRedirect, isAdminEmail, needsEmailVerification } from '../lib/authHelpers';

/**
 * Completes Firebase Google redirect sign-in after returning to the app on mobile.
 * Mount once near the root so it runs even when the auth modal is closed.
 */
export default function AuthRedirectHandler() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const result = await completeGoogleRedirect();
      if (!result || result.error) return;
      if (isAdminEmail(result.email)) {
        router.replace('/admin');
        return;
      }
      if (needsEmailVerification(result)) {
        router.replace('/dashboard');
        return;
      }
      router.replace('/dashboard');
    })();
  }, [router]);

  return null;
}

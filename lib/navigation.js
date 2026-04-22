import { auth, FIREBASE_ENABLED } from './firebase';

export function goToBooking(router) {
  try {
    if (!FIREBASE_ENABLED || !auth) { router.push('/?auth=login'); return; }
    const u = auth.currentUser;
    if (u) {
      router.push('/book');
    } else {
      router.push('/?auth=login');
    }
  } catch (e) {
    router.push('/?auth=login');
  }
}

export default goToBooking;

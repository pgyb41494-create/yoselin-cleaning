import { auth } from './firebase';

export function goToBooking(router) {
  try {
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

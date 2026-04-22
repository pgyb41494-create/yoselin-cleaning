/**
 * EmailJS integration  optional but zero-breaking if not configured.
 *
 * To enable, install the package:
 *   npm install @emailjs/browser
 *
 * Then add to your .env.local:
 *   NEXT_PUBLIC_EMAILJS_SERVICE_ID=service_xxxxxx
 *   NEXT_PUBLIC_EMAILJS_PUBLIC_KEY=your_public_key
 *   NEXT_PUBLIC_EMAILJS_CONFIRM_TPL=template_xxxxxx   (booking confirmed  customer)
 *   NEXT_PUBLIC_EMAILJS_BOOKING_TPL=template_xxxxxx   (new booking  admin)
 *
 * Template variables:
 *   Confirm template : {{to_name}} {{to_email}} {{date}} {{time}} {{address}} {{estimate}}
 *   Booking template : {{client_name}} {{client_email}} {{to_email}} {{date}} {{address}} {{estimate}}
 *
 * If the package or env vars are missing, all calls silently return without error.
 */

async function getEJS() {
  try {
    const m = await import('@emailjs/browser');
    return m.default ?? m;
  } catch {
    return null;
  }
}

const SVC   = () => process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID  || '';
const PKEY  = () => process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY  || '';
const C_TPL = () => process.env.NEXT_PUBLIC_EMAILJS_CONFIRM_TPL || '';
const B_TPL = () => process.env.NEXT_PUBLIC_EMAILJS_BOOKING_TPL || '';
const ready = () => !!(SVC() && PKEY());

/** Send booking-confirmed email to the customer. */
export async function sendBookingConfirmation({ toName, toEmail, date, time, address, estimate }) {
  if (!ready() || !C_TPL()) return;
  try {
    const ejs = await getEJS();
    if (!ejs) return;
    await ejs.send(SVC(), C_TPL(), { to_name: toName, to_email: toEmail, date, time, address, estimate }, PKEY());
  } catch (e) {
    console.warn('[email] sendBookingConfirmation failed:', e?.text ?? e);
  }
}

/** Notify admin when a new booking is submitted. */
export async function notifyAdminNewBooking({ clientName, clientEmail, date, address, estimate }) {
  if (!ready() || !B_TPL()) return;
  try {
    const ejs = await getEJS();
    if (!ejs) return;
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || '';
    await ejs.send(SVC(), B_TPL(), { client_name: clientName, client_email: clientEmail, to_email: adminEmail, date, address, estimate }, PKEY());
  } catch (e) {
    console.warn('[email] notifyAdminNewBooking failed:', e?.text ?? e);
  }
}

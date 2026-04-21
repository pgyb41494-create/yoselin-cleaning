/**
 * EmailJS integration  optional but zero-breaking if not configured.
 *
 * To enable, install the package:
 *   npm install @emailjs/browser
 *
 * Then add to your .env.local:
 *   NEXT_PUBLIC_EMAILJS_SERVICE_ID=service_xxxxxx
 *   NEXT_PUBLIC_EMAILJS_PUBLIC_KEY=your_public_key
 *   NEXT_PUBLIC_EMAILJS_CONFIRM_TPL=template_xxxxxx   (booking confirmed — customer)
 *   NEXT_PUBLIC_EMAILJS_BOOKING_TPL=template_xxxxxx   (new booking — admin)
 *   NEXT_PUBLIC_EMAILJS_CONTACT_TPL=template_xxxxxx   (contact form — admin)
 *
 * Optional SMS (email-to-SMS):
 *   NEXT_PUBLIC_ADMIN_SMS=5131234567@txt.att.net,5559876543@vtext.com
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

const SVC        = () => process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID  || '';
const PKEY       = () => process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY  || '';
const C_TPL      = () => process.env.NEXT_PUBLIC_EMAILJS_CONFIRM_TPL || '';
const B_TPL      = () => process.env.NEXT_PUBLIC_EMAILJS_BOOKING_TPL || '';
const CONTACT_TPL= () => process.env.NEXT_PUBLIC_EMAILJS_CONTACT_TPL || '';
const ADMIN_SMS = () => process.env.NEXT_PUBLIC_ADMIN_SMS || '';

async function sendToRecipients(ejs, templateId, params, recipients) {
  if (!recipients || recipients.length === 0) return;
  const tasks = recipients
    .map((r) => (r || '').trim())
    .filter(Boolean)
    .map((to) => {
      const p = { ...params, to_email: to };
      return ejs.send(SVC(), templateId, p, PKEY()).catch((err) => {
        console.warn('[email] sendToRecipients failed for', to, err?.text ?? err);
      });
    });
  if (tasks.length) await Promise.all(tasks);
}
const ready      = () => !!(SVC() && PKEY());

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
    const params = { client_name: clientName, client_email: clientEmail, date, address, estimate };
    if (adminEmail) {
      await ejs.send(SVC(), B_TPL(), { ...params, to_email: adminEmail }, PKEY());
    }
    const sms = ADMIN_SMS();
    if (sms) {
      const list = sms.split(',').map(s => s.trim()).filter(Boolean);
      await sendToRecipients(ejs, B_TPL(), params, list);
    }
  } catch (e) {
    console.warn('[email] notifyAdminNewBooking failed:', e?.text ?? e);
  }
}

/** Send a contact form message to admin using EmailJS. */
export async function sendContactMessage({ name, email, time, message, title = '' }) {
  if (!ready() || !CONTACT_TPL()) return;
  try {
    const ejs = await getEJS();
    if (!ejs) return;
    const params = { name, email, time, message, title };
    await ejs.send(SVC(), CONTACT_TPL(), params, PKEY());
    const sms = ADMIN_SMS();
    if (sms) {
      const list = sms.split(',').map(s => s.trim()).filter(Boolean);
      await sendToRecipients(ejs, CONTACT_TPL(), params, list);
    }
  } catch (e) {
    console.warn('[email] sendContactMessage failed:', e?.text ?? e);
  }
}

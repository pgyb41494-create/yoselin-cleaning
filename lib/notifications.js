/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Email Notifications via EmailJS (free – 200 emails/month)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * SETUP (one-time, ~10 minutes):
 *  1. Go to https://www.emailjs.com and create a free account
 *  2. Add an Email Service (connect your Gmail)
 *  3. Create TWO Email Templates:
 *
 *     Template 1 – "notify_admin"
 *       To:      {{admin_email}}
 *       Subject: {{subject}}
 *       Body:    {{message}}
 *
 *     Template 2 – "notify_customer"
 *       To:      {{to_email}}
 *       Subject: {{subject}}
 *       Body:    Hi {{to_name}},\n\n{{message}}\n\n– Yoselin's Cleaning
 *
 *  4. Copy your Service ID, Template IDs, and Public Key into .env.local:
 *
 *     NEXT_PUBLIC_EMAILJS_PUBLIC_KEY=your_public_key
 *     NEXT_PUBLIC_EMAILJS_SERVICE_ID=service_xxxxxxx
 *     NEXT_PUBLIC_EMAILJS_ADMIN_TEMPLATE=template_xxxxxxx    ← notify_admin
 *     NEXT_PUBLIC_EMAILJS_CUSTOMER_TEMPLATE=template_xxxxxxx ← notify_customer
 *     NEXT_PUBLIC_ADMIN_EMAIL=pgyb41494@gmail.com
 *
 * SMS (optional): Most US carriers support email-to-SMS.
 *   AT&T:     number@txt.att.net
 *   T-Mobile: number@tmomail.net
 *   Verizon:  number@vtext.com
 *   Add: NEXT_PUBLIC_ADMIN_SMS=5131234567@txt.att.net
 * ─────────────────────────────────────────────────────────────────────────────
 */

let _ejs = null;
let _initialized = false;

async function getEmailJS() {
  if (!_initialized) {
    const key = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
    if (!key) return null;
    try {
      const mod = await import('@emailjs/browser');
      _ejs = mod.default || mod;
      _ejs.init(key);
      _initialized = true;
    } catch {
      console.warn('[notifications] @emailjs/browser not installed. Run: npm install @emailjs/browser');
      return null;
    }
  }
  return _ejs;
}

const SERVICE = () => process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
const ADMIN_TPL = () => process.env.NEXT_PUBLIC_EMAILJS_ADMIN_TEMPLATE;
const CUST_TPL = () => process.env.NEXT_PUBLIC_EMAILJS_CUSTOMER_TEMPLATE;
const ADMIN_EMAIL = () => process.env.NEXT_PUBLIC_ADMIN_EMAIL;
const ADMIN_SMS = () => process.env.NEXT_PUBLIC_ADMIN_SMS;

/** Send email to the admin (and optional SMS) */
export async function notifyAdmin({ subject, message }) {
  const ejs = await getEmailJS();
  if (!ejs || !SERVICE() || !ADMIN_TPL() || !ADMIN_EMAIL()) return;
  const targets = [ADMIN_EMAIL(), ADMIN_SMS()].filter(Boolean);
  for (const email of targets) {
    try {
      await ejs.send(SERVICE(), ADMIN_TPL(), {
        admin_email: email,
        subject,
        message,
      });
    } catch (e) {
      console.warn('[notifications] Admin email failed:', e?.text || e);
    }
  }
}

/** Send email to a customer */
export async function notifyCustomer({ toEmail, toName, subject, message }) {
  if (!toEmail) return;
  const ejs = await getEmailJS();
  if (!ejs || !SERVICE() || !CUST_TPL()) return;
  try {
    await ejs.send(SERVICE(), CUST_TPL(), {
      to_email: toEmail,
      to_name: toName || 'there',
      subject,
      message,
    });
  } catch (e) {
    console.warn('[notifications] Customer email failed:', e?.text || e);
  }
}

/** New booking submitted */
export async function notifyNewBooking({ clientName, clientEmail, address, estimate, date }) {
  await notifyAdmin({
    subject: `📋 New Booking Request – ${clientName}`,
    message:
      `New booking request received!\n\n` +
      `Client: ${clientName}\n` +
      `Email:  ${clientEmail}\n` +
      `Date:   ${date || 'TBD'}\n` +
      `Address: ${address || 'N/A'}\n` +
      `Estimate: $${estimate}\n\n` +
      `Log in to your admin panel to review and confirm.`,
  });
}

/** Booking confirmed – tell the customer */
export async function notifyBookingConfirmed({ clientName, clientEmail, date, time, address, estimate }) {
  await notifyCustomer({
    toEmail: clientEmail,
    toName: clientName?.split(' ')[0] || 'there',
    subject: `✅ Your Cleaning is Confirmed!`,
    message:
      `Great news – your appointment is confirmed!\n\n` +
      `📅 Date:    ${date || 'TBD'}\n` +
      `🕐 Time:    ${time || 'TBD'}\n` +
      `📍 Address: ${address || 'N/A'}\n` +
      `💰 Estimate: $${estimate}\n\n` +
      `Reply to this email or message us in your portal if you have any questions.\n\n` +
      `– Yoselin's Cleaning Service\n📞 513-370-9082`,
  });
}

/** New chat message from customer → notify admin */
export async function notifyAdminNewMessage({ clientName, messageText }) {
  await notifyAdmin({
    subject: `💬 New Message from ${clientName}`,
    message:
      `${clientName} sent you a message:\n\n` +
      `"${messageText}"\n\n` +
      `Log in to your admin panel to reply.`,
  });
}

/** New chat message from admin → notify customer */
export async function notifyCustomerNewMessage({ clientEmail, clientName, messageText }) {
  await notifyCustomer({
    toEmail: clientEmail,
    toName: clientName,
    subject: `💬 New message from Yoselin's Cleaning`,
    message:
      `You have a new message:\n\n` +
      `"${messageText}"\n\n` +
      `Log in to your portal to reply: https://yoselin-cleaning.vercel.app/dashboard`,
  });
}

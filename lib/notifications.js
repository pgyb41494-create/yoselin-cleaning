/**
 * 
 * Email Notifications via EmailJS REST API (no npm package required)
 * Free tier: 200 emails/month
 * 
 *
 * SETUP (one-time, ~10 minutes):
 *  1. Go to https://www.emailjs.com and create a free account
 *  2. Add an Email Service (connect your Gmail)  copy the Service ID
 *  3. Create TWO Email Templates:
 *
 *     Template 1  "notify_admin"
 *       To:      {{admin_email}}
 *       Subject: {{subject}}
 *       Body:    {{message}}
 *
 *     Template 2  "notify_customer"
 *       To:      {{to_email}}
 *       Subject: {{subject}}
 *       Body:    Hi {{to_name}},\n\n{{message}}\n\n Yoselin's Cleaning
 *
 *  4. Add these to your Vercel environment variables
 *     (Settings  Environment Variables):
 *
 *     NEXT_PUBLIC_EMAILJS_PUBLIC_KEY      = your_public_key
 *     NEXT_PUBLIC_EMAILJS_SERVICE_ID      = service_xxxxxxx
 *     NEXT_PUBLIC_EMAILJS_ADMIN_TEMPLATE  = template_xxxxxxx
 *     NEXT_PUBLIC_EMAILJS_CUST_TEMPLATE   = template_xxxxxxx
 *     NEXT_PUBLIC_ADMIN_EMAIL             = your@email.com
 *
 * SMS (optional  add to Vercel env vars):
 *   NEXT_PUBLIC_ADMIN_SMS = 5131234567@txt.att.net   (AT&T)
 *                           5131234567@tmomail.net   (T-Mobile)
 *                           5131234567@vtext.com     (Verizon)
 * 
 */

const API = 'https://api.emailjs.com/api/v1.0/email/send';

async function sendEmail(templateId, params) {
  const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  if (!publicKey || !serviceId || !templateId) return;
  try {
    await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: params,
      }),
    });
  } catch (e) {
    console.warn('[notifications] Email send failed:', e);
  }
}

const ADMIN_TPL = () => process.env.NEXT_PUBLIC_EMAILJS_ADMIN_TEMPLATE;
const CUST_TPL  = () => process.env.NEXT_PUBLIC_EMAILJS_CUST_TEMPLATE;
const ADMIN_EMAIL = () => process.env.NEXT_PUBLIC_ADMIN_EMAIL;
const ADMIN_SMS   = () => process.env.NEXT_PUBLIC_ADMIN_SMS;

/** Send to admin (and optional SMS gateway) */
async function notifyAdmin({ subject, message }) {
  const targets = [ADMIN_EMAIL(), ADMIN_SMS()].filter(Boolean);
  for (const email of targets) {
    await sendEmail(ADMIN_TPL(), { admin_email: email, subject, message });
  }
}

/** Send to a customer */
async function notifyCustomer({ toEmail, toName, subject, message }) {
  if (!toEmail) return;
  await sendEmail(CUST_TPL(), {
    to_email: toEmail,
    to_name: toName || 'there',
    subject,
    message,
  });
}

/** New booking submitted  notify admin */
export async function notifyNewBooking({ clientName, clientEmail, address, estimate, date }) {
  await notifyAdmin({
    subject: `New Booking Request - ${clientName}`,
    message:
      `New booking request received!\n\n` +
      `Client:   ${clientName}\n` +
      `Email:    ${clientEmail}\n` +
      `Date:     ${date || 'TBD'}\n` +
      `Address:  ${address || 'N/A'}\n` +
      `Estimate: $${estimate}\n\n` +
      `Log in to your admin panel to review and confirm.`,
  });
}

/** Booking confirmed  notify customer */
export async function notifyBookingConfirmed({ clientName, clientEmail, date, time, address, estimate }) {
  await notifyCustomer({
    toEmail: clientEmail,
    toName: clientName?.split(' ')[0] || 'there',
    subject: `Your Cleaning is Confirmed!`,
    message:
      `Great news - your appointment is confirmed!\n\n` +
      `Date:     ${date || 'TBD'}\n` +
      `Time:     ${time || 'TBD'}\n` +
      `Address:  ${address || 'N/A'}\n` +
      `Estimate: $${estimate}\n\n` +
      `Reply to this email or message us in your portal with any questions.\n\n` +
      `- Yoselin's Cleaning Service\n513-370-9082`,
  });
}

/** New message from customer  notify admin */
export async function notifyAdminNewMessage({ clientName, messageText }) {
  await notifyAdmin({
    subject: `New Message from ${clientName}`,
    message:
      `${clientName} sent you a message:\n\n` +
      `"${messageText}"\n\n` +
      `Log in to your admin panel to reply.`,
  });
}

/** New message from admin  notify customer */
export async function notifyCustomerNewMessage({ clientEmail, clientName, messageText }) {
  await notifyCustomer({
    toEmail: clientEmail,
    toName: clientName,
    subject: `New message from Yoselin's Cleaning`,
    message:
      `You have a new message:\n\n` +
      `"${messageText}"\n\n` +
      `Log in to your portal to reply: https://yoselin-cleaning.vercel.app/dashboard`,
  });
}

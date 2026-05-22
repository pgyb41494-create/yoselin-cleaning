import { NextResponse } from 'next/server';
import { notifyPasswordReset } from '../../../../../lib/notifications';
import { getAdminAuth } from '../../../../../lib/firebaseAdmin';

const RESET_RESPONSE = {
  ok: true,
  message: 'If that email exists, a reset link has been sent.',
};

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildResetLink(origin, firebaseLink, email) {
  const firebaseUrl = new URL(firebaseLink);
  const oobCode = firebaseUrl.searchParams.get('oobCode');

  if (!oobCode) {
    throw new Error('Missing password reset code.');
  }

  const resetUrl = new URL('/reset-password', origin);
  resetUrl.searchParams.set('oobCode', oobCode);
  resetUrl.searchParams.set('mode', 'resetPassword');
  resetUrl.searchParams.set('email', email);

  return resetUrl.toString();
}

export async function POST(request) {
  let body = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  const origin = new URL(request.url).origin;

  try {
    const adminAuth = getAdminAuth();
    const firebaseLink = await adminAuth.generatePasswordResetLink(email, {
      url: `${origin}/reset-password`,
      handleCodeInApp: true,
    });

    const resetLink = buildResetLink(origin, firebaseLink, email);
    await notifyPasswordReset({
      toEmail: email,
      toName: email.split('@')[0] || 'there',
      resetLink,
      supportEmail: process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'support',
    });

    return NextResponse.json(RESET_RESPONSE);
  } catch (error) {
    if (error?.code === 'auth/user-not-found') {
      return NextResponse.json(RESET_RESPONSE);
    }

    console.error('[password-reset] request failed:', error);
    return NextResponse.json({ error: 'Unable to send the reset email right now.' }, { status: 500 });
  }
}

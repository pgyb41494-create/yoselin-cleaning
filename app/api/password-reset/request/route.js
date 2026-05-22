import { NextResponse } from 'next/server';
import { notifyPasswordReset } from '../../../../lib/notifications';
import { getAdminAuth } from '../../../../lib/firebaseAdmin';

const RESET_RESPONSE = {
  ok: true,
  message: 'If that email exists, a reset link has been sent.',
};

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getSiteOrigin(request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return process.env.NEXT_PUBLIC_SITE_URL || 'https://yoselinscleaning.com';
  }
}

function getFirebaseProjectId() {
  return process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '';
}

function getActionCodeSettings(siteOrigin) {
  const projectId = getFirebaseProjectId();
  const actionCodeSettings = {
    url: `${siteOrigin}/reset-password`,
    handleCodeInApp: true,
  };

  if (projectId) {
    actionCodeSettings.linkDomain = `${projectId}.firebaseapp.com`;
    actionCodeSettings.dynamicLinkDomain = `${projectId}.page.link`;
  }

  return actionCodeSettings;
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

  const siteOrigin = getSiteOrigin(request);

  try {
    const adminAuth = getAdminAuth();
    const projectConfig = await adminAuth.projectConfigManager().getProjectConfig();
    const actionCodeSettings = getActionCodeSettings(siteOrigin);

    console.log('[password-reset] config', JSON.stringify({
      siteOrigin,
      projectConfig: projectConfig.toJSON(),
      actionCodeSettings,
    }));

    const firebaseLink = await adminAuth.generatePasswordResetLink(
      email,
      actionCodeSettings,
    );

    const resetLink = buildResetLink(siteOrigin, firebaseLink, email);
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
    return NextResponse.json({ error: error?.message || 'Unable to send the reset email right now.' }, { status: 500 });
  }
}

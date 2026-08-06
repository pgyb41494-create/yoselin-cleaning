import { NextResponse } from 'next/server';

/**
 * Deprecated: returning reset links to the browser was unsafe.
 * Clients must use Firebase Auth sendPasswordResetEmail instead.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'This endpoint has been disabled. Use the in-app forgot-password form, which emails a reset link securely through Firebase Auth.',
    },
    { status: 410 },
  );
}

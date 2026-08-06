import { NextResponse } from 'next/server';

/**
 * Disabled: previously accepted unauthenticated requests and could send SMS.
 * Re-enable only behind Firebase ID-token + admin verification and rate limits.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'SMS endpoint is disabled.' },
    { status: 403 },
  );
}

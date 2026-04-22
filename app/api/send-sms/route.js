import { NextResponse } from 'next/server';

export async function POST(request) {
  const { to, body } = await request.json();

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const from       = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !from) {
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 });
  }

  const targets = Array.isArray(to) ? to : [to];
  const results = [];

  for (const number of targets) {
    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ From: from, To: number, Body: body }).toString(),
        }
      );
      const data = await res.json();
      results.push({ number, sid: data.sid, status: data.status, error: data.message });
    } catch (e) {
      results.push({ number, error: e.message });
    }
  }

  return NextResponse.json({ results });
}

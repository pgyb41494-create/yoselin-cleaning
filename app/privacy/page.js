export const metadata = { title: 'Privacy Policy' };

export default function Page() {
  return (
    <main style={{ padding: 40, maxWidth: 900, margin: '0 auto', color: '#e5e7eb' }}>
      <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.6rem', marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: '#9ca3af', marginBottom: 18 }}>Last updated: {new Date().toLocaleDateString()}</p>

      <section style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: '1.05rem' }}>What we collect</h2>
        <p style={{ color: '#cbd5e1' }}>We collect the information you provide when booking a service or contacting us, such as your name, email, phone number, and service address. We may also store messages you exchange with our team.</p>
      </section>

      <section style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: '1.05rem' }}>How we use your data</h2>
        <p style={{ color: '#cbd5e1' }}>We use your information to schedule and provide cleaning services, communicate about bookings, and to comply with legal obligations. We do not sell your personal information.</p>
      </section>

      <section style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: '1.05rem' }}>Security</h2>
        <p style={{ color: '#cbd5e1' }}>We take reasonable steps to protect your data. If you have concerns about account security, please contact us at hello@yoselincleaning.com.</p>
      </section>

      <section>
        <h2 style={{ fontSize: '1.05rem' }}>Contact</h2>
        <p style={{ color: '#cbd5e1' }}>Questions about this policy? Email us at hello@yoselincleaning.com</p>
      </section>
    </main>
  );
}

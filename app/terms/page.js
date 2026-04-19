export const metadata = { title: 'Terms of Service' };

export default function Page() {
  return (
    <main style={{ padding: 40, maxWidth: 900, margin: '0 auto', color: '#e5e7eb' }}>
      <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.6rem', marginBottom: 8 }}>Terms of Service</h1>
      <p style={{ color: '#9ca3af', marginBottom: 18 }}>These terms govern your use of our booking service. By booking, you agree to our terms below.</p>

      <section style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: '1.05rem' }}>Booking & cancellations</h2>
        <p style={{ color: '#cbd5e1' }}>Bookings are confirmed when you receive a confirmation message. Please notify us as soon as possible if you need to cancel or reschedule; our cancellation policy will apply to short-notice cancellations.</p>
      </section>

      <section style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: '1.05rem' }}>Liability</h2>
        <p style={{ color: '#cbd5e1' }}>Our team is insured and bonded. While we take care to avoid damage, liability is limited as permitted by law.</p>
      </section>

      <section style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: '1.05rem' }}>Payment</h2>
        <p style={{ color: '#cbd5e1' }}>Payment terms will be communicated during booking. Additional charges may apply for extra services or extensive cleaning beyond the agreed scope.</p>
      </section>

      <section>
        <h2 style={{ fontSize: '1.05rem' }}>Contact</h2>
        <p style={{ color: '#cbd5e1' }}>Questions about these terms? Email hello@yoselincleaning.com</p>
      </section>
    </main>
  );
}

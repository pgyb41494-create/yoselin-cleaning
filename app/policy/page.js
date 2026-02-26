export default function PolicyPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: 'white', fontFamily: "'DM Sans', sans-serif" }}>

      {/* NAV */}
      <nav style={{ background: '#0d0d0d', borderBottom: '1px solid #1f1f1f', padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center' }}>
          <img src="/logo.png" alt="Yoselin's Cleaning" style={{ height: '42px', objectFit: 'contain' }} />
        </a>
        <a href="/" style={{ fontSize: '.85rem', color: '#9ca3af', textDecoration: 'none', fontWeight: '600' }}>
          {'\u2190'} Back to Home
        </a>
      </nav>

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '40px 20px 80px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '2.2rem', fontWeight: '900', color: 'white', marginBottom: '8px' }}>
            Policies & Procedures
          </h1>
          <p style={{ color: '#6b7280', fontSize: '.9rem' }}>Please read before booking your first appointment.</p>
        </div>

        {/* Section: Satisfaction Guaranteed */}
        <Section title="Satisfaction Guaranteed" underline>
          <Policy term="Re-Cleans">
            If you are unsatisfied with the quality of your clean, contact us and we will assess your concern.
            If applicable, the problem area will be re-cleaned free of charge. A re-clean request must be
            reported within <strong>48 hours</strong> of the initial service date.
          </Policy>
          <Policy term="Refunds">
            If you are not satisfied by the re-clean and the Cleaner is at fault, a partial refund according
            to circumstances will be offered. <strong>Full refunds are not available.</strong>
          </Policy>
        </Section>

        {/* Section: Fees & Payments */}
        <Section title="Fees & Payments" underline>
          <Policy term="Extra Service Fees">
            Client will be charged any fees as necessary for extra services the Cleaner is providing in order
            to work properly, such as picking up items, doing dishes, folding laundry, etc.
          </Policy>
          <Policy term="Payment">
            Payment for cleaning must be made the day of cleaning, due as Zelle, Check, or Cash. Failure to
            pay for cleaning on the day of service will result in a{' '}
            <strong>late fee of $10 per day until payment is made.</strong>
          </Policy>
        </Section>

        {/* Section: Cancellation */}
        <Section title="Cancellation" underline>
          <Policy term="Rescheduling, skipping or cancelling a clean">
            A written notice of any schedule change is <strong>required 2 days before service</strong>. The
            Cleaner will proceed to the scheduled job if a written notice via text is not provided.
          </Policy>
          <Policy term="Late Notice">
            Client will be charged <strong>$50</strong> for any schedule changes made within their arrival window.
          </Policy>
          <Policy term="Lockouts">
            If a notice from the Client is not made and a Cleaner cannot gain entry to your home or if they are
            denied access, client will be charged <strong>50% of their total cleaning/estimated fee.</strong>
          </Policy>
        </Section>

        {/* Section: Pricing & Preferences */}
        <Section title="Pricing & Preferences" underline>
          <Policy term="Flat-rate pricing">
            A flat rate price will be charged for all services, however, the condition of your home is accounted for.
          </Policy>
          <Policy term="Price Increase">
            We reserve the right to raise any rate/price as needed. Clients will be notified in advance of any
            price increase. Bi-Annual price reviews are implemented.
          </Policy>
          <Policy term="Scheduling Preferences">
            Any specific date, time or cleaning tech request is not guaranteed, but we will accommodate to the
            best of our ability.
          </Policy>
        </Section>

        {/* Contact */}
        <div style={{ background: '#181818', border: '1.5px solid #2a2a2a', borderRadius: '16px', padding: '24px', textAlign: 'center', marginTop: '16px' }}>
          <p style={{ color: '#9ca3af', fontSize: '.88rem', marginBottom: '10px' }}>
            Questions about our policies? Reach out directly.
          </p>
          <a href="tel:5133709082" style={{ color: '#f472b6', fontWeight: '700', fontSize: '1rem', textDecoration: 'none' }}>
            513-370-9082
          </a>
          <span style={{ color: '#4b5563', margin: '0 10px' }}>|</span>
          <a href="tel:5132576942" style={{ color: '#f472b6', fontWeight: '700', fontSize: '1rem', textDecoration: 'none' }}>
            513-257-6942
          </a>
        </div>

      </div>
    </div>
  );
}

function Section({ title, underline, children }) {
  return (
    <div style={{ marginBottom: '36px' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h2 style={{
          fontFamily: 'Playfair Display, serif', fontSize: '1.25rem', fontWeight: '700', color: 'white',
          display: 'inline-block',
          borderBottom: underline ? '2px solid #db2777' : 'none',
          paddingBottom: '4px',
        }}>
          {title}
        </h2>
      </div>
      <div style={{ background: '#111', border: '1px solid #222', borderRadius: '16px', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {children}
      </div>
    </div>
  );
}

function Policy({ term, children }) {
  return (
    <div style={{ borderBottom: '1px solid #1f1f1f', paddingBottom: '14px' }}>
      <div style={{ fontWeight: '700', color: 'white', fontSize: '.9rem', marginBottom: '5px' }}>{term}</div>
      <div style={{ color: '#9ca3af', fontSize: '.85rem', lineHeight: '1.7' }}>{children}</div>
    </div>
  );
}

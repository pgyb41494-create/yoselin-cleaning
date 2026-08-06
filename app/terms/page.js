import LegalPage, { LegalSection } from '../../components/LegalPage';

export const metadata = { title: 'Terms of Service' };

export default function Page() {
  return (
    <LegalPage title="Terms of Service" subtitle="These terms govern your use of our booking service. By booking, you agree to our terms below.">
      <LegalSection title="Booking & cancellations">
        <p>Bookings are confirmed when you receive a confirmation message. Please notify us as soon as possible if you need to cancel or reschedule; our cancellation policy will apply to short-notice cancellations.</p>
      </LegalSection>

      <LegalSection title="Liability">
        <p>Our team is insured and bonded. While we take care to avoid damage, liability is limited as permitted by law.</p>
      </LegalSection>

      <LegalSection title="Payment">
        <p>Payment terms will be communicated during booking. Additional charges may apply for extra services or extensive cleaning beyond the agreed scope.</p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>Questions about these terms? Email hello@yoselincleaning.com</p>
      </LegalSection>
    </LegalPage>
  );
}

import LegalPage, { LegalSection } from '../../components/LegalPage';

export const metadata = { title: 'Privacy Policy' };

export default function Page() {
  return (
    <LegalPage title="Privacy Policy" subtitle={`Last updated: ${new Date().toLocaleDateString()}`}>
      <LegalSection title="What we collect">
        <p>We collect the information you provide when booking a service or contacting us, such as your name, email, phone number, and service address. We may also store messages you exchange with our team.</p>
      </LegalSection>

      <LegalSection title="How we use your data">
        <p>We use your information to schedule and provide cleaning services, communicate about bookings, and to comply with legal obligations. We do not sell your personal information.</p>
      </LegalSection>

      <LegalSection title="Security">
        <p>We take reasonable steps to protect your data. If you have concerns about account security, please contact us at hello@yoselincleaning.com.</p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>Questions about this policy? Email us at hello@yoselincleaning.com</p>
      </LegalSection>
    </LegalPage>
  );
}

import LegalPage, { LegalSection, LegalTerm } from '../../components/LegalPage';

export const metadata = { title: 'Policies & Procedures' };

export default function PolicyPage() {
  return (
    <LegalPage title="Policies & Procedures" subtitle="Please read before booking your first appointment.">
      <LegalSection title="Satisfaction Guaranteed">
        <LegalTerm term="Re-Cleans">
          If you are unsatisfied with the quality of your clean, contact us and we will assess your concern.
          If applicable, the problem area will be re-cleaned free of charge. A re-clean request must be
          reported within <strong>48 hours</strong> of the initial service date.
        </LegalTerm>
        <LegalTerm term="Refunds">
          If you are not satisfied by the re-clean and the Cleaner is at fault, a partial refund according
          to circumstances will be offered. <strong>Full refunds are not available.</strong>
        </LegalTerm>
      </LegalSection>

      <LegalSection title="Fees & Payments">
        <LegalTerm term="Extra Service Fees">
          Client will be charged any fees as necessary for extra services the Cleaner is providing in order
          to work properly, such as picking up items, doing dishes, folding laundry, etc.
        </LegalTerm>
        <LegalTerm term="Payment">
          Payment for cleaning must be made the day of cleaning, due as Zelle, Check, or Cash. Failure to
          pay for cleaning on the day of service will result in a{' '}
          <strong>late fee of $10 per day until payment is made.</strong>
        </LegalTerm>
      </LegalSection>

      <LegalSection title="Cancellation">
        <LegalTerm term="Rescheduling, skipping or cancelling a clean">
          A written notice of any schedule change is <strong>required 2 days before service</strong>. The
          Cleaner will proceed to the scheduled job if a written notice via text is not provided.
        </LegalTerm>
        <LegalTerm term="Late Notice">
          Client will be charged <strong>$50</strong> for any schedule changes made within their arrival window.
        </LegalTerm>
        <LegalTerm term="Lockouts">
          If a notice from the Client is not made and a Cleaner cannot gain entry to your home or if they are
          denied access, client will be charged <strong>50% of their total cleaning/estimated fee.</strong>
        </LegalTerm>
      </LegalSection>

      <LegalSection title="Pricing & Preferences">
        <LegalTerm term="Flat-rate pricing">
          A flat rate price will be charged for all services, however, the condition of your home is accounted for.
        </LegalTerm>
        <LegalTerm term="Price Increase">
          We reserve the right to raise any rate/price as needed. Clients will be notified in advance of any
          price increase. Bi-Annual price reviews are implemented.
        </LegalTerm>
        <LegalTerm term="Scheduling Preferences">
          Any specific date, time or cleaning tech request is not guaranteed, but we will accommodate to the
          best of our ability.
        </LegalTerm>
      </LegalSection>

      <div className="legal-contact">
        <p>Questions about our policies? Reach out directly.</p>
        <a href="tel:5133709082">513-370-9082</a>
        <span>|</span>
        <a href="tel:5132576942">513-257-6942</a>
      </div>
    </LegalPage>
  );
}

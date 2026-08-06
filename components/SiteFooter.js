import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="site-footer" id="contact">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <img src="/icon.png" alt="" width={40} height={40} />
          <div>
            <strong>Yoselin&apos;s Cleaning</strong>
            <p>Fairfield, Ohio &amp; surrounding areas</p>
          </div>
        </div>

        <div className="site-footer__grid">
          <div>
            <h4>Contact</h4>
            <a href="tel:5132576942">513-257-6942</a>
            <a href="tel:5133709082">513-370-9082 (Español)</a>
          </div>
          <div>
            <h4>Quick links</h4>
            <Link href="/book">Get a quote</Link>
            <Link href="/gallery">Photo gallery</Link>
            <Link href="/policy">Policies</Link>
          </div>
          <div>
            <h4>Legal</h4>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href="https://www.google.com/maps/search/?api=1&query=Yoselin%27s+Cleaning+Fairfield+OH" target="_blank" rel="noopener noreferrer">
              Google Business
            </a>
          </div>
        </div>

        <p className="site-footer__copy">
          © {new Date().getFullYear()} Yoselin&apos;s Cleaning. Insured &amp; background-checked.
        </p>
      </div>
    </footer>
  );
}

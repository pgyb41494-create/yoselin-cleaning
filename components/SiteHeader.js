'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, ADMIN_EMAILS } from '../lib/firebase';

const NAV = [
  { href: '/#services', label: 'Services' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/#reviews', label: 'Reviews' },
  { href: '/#contact', label: 'Contact' },
];

export default function SiteHeader({ onLoginClick, transparent = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const isAdmin = user && (ADMIN_EMAILS.includes(user.email?.toLowerCase()) || ADMIN_EMAILS.includes(user.email));
  const portalHref = isAdmin ? '/admin' : '/dashboard';
  const portalLabel = isAdmin ? 'Admin' : 'My Account';

  const handleBook = () => {
    if (user && !isAdmin) router.push('/book');
    else if (user && isAdmin) router.push('/admin');
    else if (onLoginClick) onLoginClick('signup');
    else router.push('/book');
  };

  return (
    <header className={`site-header${transparent ? ' site-header--transparent' : ''}`}>
      <div className="site-header__inner">
        <Link href="/" className="site-brand">
          <img src="/icon.png" alt="" className="site-brand__icon" width={36} height={36} />
          <span className="site-brand__text">
            Yoselin&apos;s <em>Cleaning</em>
          </span>
        </Link>

        <nav className={`site-nav${menuOpen ? ' site-nav--open' : ''}`} aria-label="Main">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href} className="site-nav__link">
              {label}
            </Link>
          ))}
          {ready && user ? (
            <>
              <Link href={portalHref} className="site-nav__link">{portalLabel}</Link>
              <button type="button" className="site-nav__link site-nav__link--muted" onClick={() => signOut(auth)}>
                Sign out
              </button>
            </>
          ) : (
            <button type="button" className="site-nav__link" onClick={() => onLoginClick?.('login')}>
              Log in
            </button>
          )}
          <button type="button" className="btn btn-primary site-nav__cta" onClick={handleBook}>
            Get a Quote
          </button>
        </nav>

        <button
          type="button"
          className="site-menu-btn"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span /><span /><span />
        </button>
      </div>
    </header>
  );
}

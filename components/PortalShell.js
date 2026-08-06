'use client';
import SiteHeader from './SiteHeader';

export default function PortalShell({ children, badge }) {
  return (
    <div className="portal-shell">
      <SiteHeader />
      {badge && <div className="portal-shell__badge">{badge}</div>}
      {children}
    </div>
  );
}

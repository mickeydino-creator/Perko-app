'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { DashboardProvider, useDashboard } from '../../components/Dashboard';
import { getAlerts } from '../../lib/api';

const SECTIONS = [
  { href: '/program', label: 'תוכנית' },
  { href: '/team', label: 'צוות' },
  { href: '/log', label: 'יומן' },
  { href: '/insights', label: 'תובנות' },
  { href: '/alerts', label: 'התראות' },
  { href: '/qr', label: 'קוד לקופה' },
];

export default function DashLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardProvider>
      <Shell>{children}</Shell>
    </DashboardProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { businesses, business, choose, signOut } = useDashboard();
  const path = usePathname();
  const [unseen, setUnseen] = useState(0);

  useEffect(() => {
    let live = true;
    getAlerts(business.id).then((a) => live && setUnseen(a.filter((x) => !x.seenAt).length)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [business.id, path]);

  return (
    <div className="shell">
      <header className="top">
        <Link href="/program" className="wordmark" aria-label="Perko לעסקים">perk<i /></Link>
        <span className="muted small">לעסקים</span>
        <span className="grow" />
        {businesses.length > 1 ? (
          <select aria-label="העסק" value={business.id} onChange={(e) => choose(e.target.value)} style={{ width: 'auto' }}>
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        ) : (
          <strong>{business.name}</strong>
        )}
        <button className="btn quiet small" onClick={signOut}>יציאה</button>
      </header>
      {!business.active ? <p className="note warn">העסק מושהה ב-Perko: הוא לא מופיע באפליקציה ואי אפשר לצבור בו.</p> : null}
      <nav className="nav" aria-label="ניווט">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} aria-current={path === s.href ? 'page' : undefined}>
            {s.label}
            {s.href === '/alerts' && unseen > 0 ? <span className="badge" aria-label={`${unseen} חדשות`}>{unseen}</span> : null}
          </Link>
        ))}
      </nav>
      <main>{children}</main>
    </div>
  );
}

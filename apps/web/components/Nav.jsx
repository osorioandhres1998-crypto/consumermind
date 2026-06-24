'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Inicio' },
  { href: '/strategy', label: 'Strategy' },
  { href: '/copy-studio', label: 'Copy Studio' },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      <Link href="/" className="brand" style={{ all: 'unset', cursor: 'pointer' }}>
        <span className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="logo">C</span>
          <b>ConsumerMind</b>
        </span>
      </Link>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={path === l.href ? 'active' : ''}>
          {l.label}
        </Link>
      ))}
      <span className="spacer" />
      <span className="plan">Workspace Demo · plan free</span>
    </nav>
  );
}

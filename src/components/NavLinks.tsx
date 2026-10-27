'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

function Links({ items }: { items: { href: string; label: string; badge?: number }[] }) {
  const path = usePathname();
  return (
    <ul className="nav flex-wrap me-md-auto">
      {items.map((i) => {
        const active = i.href === '/admin' ? path === '/admin' : path === i.href || path.startsWith(i.href + '/');
        return (
          <li className="nav-item" key={i.href}>
            <Link className={`nav-link ${active ? 'active' : ''}`} href={i.href} aria-current={active ? 'page' : undefined}>
              {i.label}
              {i.badge ? <span className="badge bg-primary ms-1">{i.badge}</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function StudentNavLinks({ unread }: { unread: number }) {
  return (
    <Links
      items={[
        { href: '/dashboard', label: 'Dashboard', badge: unread },
        { href: '/preferences', label: 'Preferences' },
        { href: '/checklist', label: 'Documents' },
        { href: '/support', label: 'Support' },
      ]}
    />
  );
}

export function AdminNavLinks() {
  return (
    <Links
      items={[
        { href: '/admin', label: 'Dashboard' },
        { href: '/admin/students', label: 'Students' },
        { href: '/admin/records', label: 'CAP records' },
        { href: '/admin/requests', label: 'Link requests' },
        { href: '/admin/queue', label: 'Service desk' },
        { href: '/admin/appointments', label: 'Appointments' },
        { href: '/admin/planner', label: 'Planner' },
        { href: '/admin/allotment', label: 'Allotment demo' },
        { href: '/admin/audit', label: 'Audit & undo' },
      ]}
    />
  );
}

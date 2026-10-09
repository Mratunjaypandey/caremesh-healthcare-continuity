'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  ShieldCheck,
  TriangleAlert,
  ClipboardList,
  Bell,
  FileText,
  LogOut,
  Menu,
  X,
  Sparkles,
  UserRound,
  Settings,
  MoreHorizontal,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Stethoscope,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { SessionUser } from '@/lib/auth';
import { initials } from '@/lib/utils';
import { InstallAppButton } from '@/components/install-app-button';
import { PatientAiLauncher } from '@/components/patient-ai-assistant';

const adminNav: Array<{ href: Route; label: string; icon: typeof LayoutDashboard; group: string }> = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, group: 'Workspace' },
  { href: '/admin/patients', label: 'Patients', icon: Users, group: 'Workspace' },
  { href: '/admin/appointments', label: 'Appointments', icon: CalendarClock, group: 'Workspace' },
  { href: '/admin/team', label: 'Care team', icon: Stethoscope, group: 'Organization' },
  { href: '/admin/care-gaps', label: 'Care gaps', icon: TriangleAlert, group: 'Workspace' },
  { href: '/admin/audit', label: 'Audit trail', icon: ShieldCheck, group: 'Governance' },
];

const patientNav: Array<{ href: Route; label: string; icon: typeof LayoutDashboard; group: string }> = [
  { href: '/patient', label: 'Overview', icon: LayoutDashboard, group: 'My care' },
  { href: '/patient/timeline', label: 'Timeline', icon: ClipboardList, group: 'My care' },
  { href: '/patient/documents', label: 'Documents', icon: FileText, group: 'My care' },
  { href: '/patient/appointments', label: 'Appointments', icon: CalendarClock, group: 'My care' },
  { href: '/patient/notifications', label: 'Notifications', icon: Bell, group: 'My care' },
];

function isActivePath(pathname: string, href: string) {
  return href === '/admin' || href === '/patient' ? pathname === href : pathname.startsWith(href);
}

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('caremesh.sidebar.collapsed');
      if (saved === '1') setSidebarCollapsed(true);
    } catch {}
  }, []);

  function toggleSidebar() {
    if (window.innerWidth <= 900) {
      setMenuOpen((value) => !value);
      return;
    }
    setSidebarCollapsed((value) => {
      const next = !value;
      try { window.localStorage.setItem('caremesh.sidebar.collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  }
  const nav = user.role === 'PATIENT'
    ? patientNav
    : user.role === 'ADMIN'
      ? adminNav
      : adminNav.filter((item) => item.href !== '/admin/team');

  const mobilePrimary = user.role === 'PATIENT'
    ? ['/patient', '/patient/timeline', '/patient/documents', '/patient/appointments'] as Route[]
    : ['/admin', '/admin/patients', '/admin/appointments', '/profile'] as Route[];

  const pageTitle = useMemo(() => {
    if (pathname === '/admin' || pathname === '/patient') return 'Care overview';
    if (pathname.startsWith('/profile')) return 'Profile & settings';
    if (pathname.includes('/patients/')) return 'Patient record';
    const match = nav.find((item) => isActivePath(pathname, item.href));
    if (pathname.startsWith('/patient/assistant')) return 'CareMesh AI';
    return match?.label || 'CareMesh';
  }, [pathname, nav]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const initialsText = initials(user.fullName);

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${menuOpen ? 'mobile-menu-open' : ''}`}>
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} aria-label="Primary navigation">
        <div className="sidebar-brand">
          <Link href={user.role === 'PATIENT' ? '/patient' : '/admin'} className="brand-link" onClick={() => setMenuOpen(false)}>
            <div className="brand-mark">CM</div>
            <div className="brand-copy">
              <div className="brand-title">CareMesh</div>
              <div className="brand-subtitle">Healthcare continuity</div>
            </div>
          </Link>
          <button
            className="icon-btn sidebar-close-control mobile-only"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            title="Close menu"
          ><X size={18} /></button>
          <button
            className="sidebar-collapse-control desktop-only"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
            title={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
          >{sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
        </div>

        <Link href="/profile" className="sidebar-user" onClick={() => setMenuOpen(false)} title={sidebarCollapsed ? `${user.fullName} · Profile` : undefined}>
          <div className="avatar avatar-small">{initialsText}</div>
          <div className="sidebar-user-copy">
            <div className="sidebar-user-name">{user.fullName}</div>
            <div className="sidebar-user-meta">{user.role === 'PATIENT' ? user.patientCode || 'Patient portal' : user.role === 'CLINICIAN' ? 'Clinician' : 'Hospital / Lab admin'}</div>
          </div>
          <ChevronRight size={14} className="sidebar-user-arrow" />
        </Link>

        <nav className="side-nav">
          {Array.from(new Set(nav.map((item) => item.group))).map((group) => (
            <div key={group} className="nav-group">
              <div className="nav-label">{group}</div>
              {nav.filter((item) => item.group === group).map((item) => {
                const Icon = item.icon;
                const active = isActivePath(pathname, item.href);
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className={`nav-link ${active ? 'nav-link-active' : ''}`} title={sidebarCollapsed ? item.label : undefined}>
                    <span className="nav-link-icon"><Icon size={17} strokeWidth={2} /></span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}

          {user.role === 'PATIENT' ? (
            <div className="nav-group">
              <div className="nav-label">Assistant</div>
              <Link href="/patient/assistant" onClick={() => setMenuOpen(false)} className={`nav-link nav-link-ai ${pathname.startsWith('/patient/assistant') ? 'nav-link-active' : ''}`} title={sidebarCollapsed ? 'CareMesh AI' : undefined}>
                <span className="nav-link-icon"><Sparkles size={17}/></span>
                <span>CareMesh AI</span>
                <span className="nav-badge">AI</span>
              </Link>
            </div>
          ) : null}
        </nav>

        <div className="sidebar-footer">
          <Link href="/profile" className={`nav-link nav-link-secondary ${pathname.startsWith('/profile') ? 'nav-link-active' : ''}`} title={sidebarCollapsed ? 'Profile & settings' : undefined} onClick={() => setMenuOpen(false)}>
            <span className="nav-link-icon"><UserRound size={17}/></span><span>Profile & settings</span>
          </Link>
          <InstallAppButton compact />
          <div className="security-note"><ShieldCheck size={14}/><span>Role-based access · private records</span></div>
          <button className="nav-link nav-link-danger" onClick={signOut}><span className="nav-link-icon"><LogOut size={17} /></span><span>Sign out</span></button>
        </div>
      </aside>

      <div className={`mobile-backdrop ${menuOpen ? 'show' : ''}`} onClick={() => setMenuOpen(false)} />

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="menu-trigger icon-btn nav-toggle"
              onClick={toggleSidebar}
              aria-label={menuOpen ? 'Close menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              title={menuOpen ? 'Close menu' : 'Open menu'}
            >
              <span className="nav-toggle-mobile-icon"><Menu size={19} /></span>
              <span className="nav-toggle-desktop-icon">{sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}</span>
            </button>
            <div>
              <div className="topbar-kicker">{user.role === 'PATIENT' ? 'Patient portal' : 'Care team workspace'}</div>
              <div className="topbar-title">{pageTitle}</div>
            </div>
          </div>

          <div className="topbar-right">
            {user.role === 'PATIENT' ? <Link href="/patient/assistant" className="topbar-ai"><Sparkles size={14}/><span>Ask CareMesh AI</span></Link> : null}
            <div className="header-divider" aria-hidden="true" />
            {user.role === 'PATIENT' && typeof (user as any).unreadNotifications === 'number' ? <Link href="/patient/notifications" className="header-icon-button" aria-label="Open notifications" title="Notifications"><Bell size={18}/>{(user as any).unreadNotifications > 0 ? <span className="header-notification-count">{Math.min((user as any).unreadNotifications, 99)}</span> : null}</Link> : null}
            <InstallAppButton />
            <div className="profile-menu-wrap">
              <button className="user-chip" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen}>
                <div className="avatar avatar-tiny">{initialsText}</div>
                <span className="desktop-user-name">{user.fullName}</span>
                <MoreHorizontal size={14} />
              </button>
              {profileOpen ? (
                <div className="profile-menu" role="menu">
                  <div className="profile-menu-head">
                    <div className="avatar avatar-small">{initialsText}</div>
                    <div><strong>{user.fullName}</strong><span>{user.email || 'CareMesh account'}</span></div>
                  </div>
                  <Link href="/profile" onClick={() => setProfileOpen(false)}><UserRound size={15}/>Profile & settings</Link>
                  {user.role === 'PATIENT' ? <Link href="/patient/assistant" onClick={() => setProfileOpen(false)}><Sparkles size={15}/>CareMesh AI</Link> : null}
                  <InstallAppButton menuItem />
                  <button onClick={signOut}><LogOut size={15}/>Sign out</button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="page-wrap">{children}</div>
      </main>

      {user.role === 'PATIENT' ? <PatientAiLauncher /> : null}

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {mobilePrimary.map((href) => {
          const item = nav.find((entry) => entry.href === href);
          const Icon = item?.icon || (href === '/profile' ? Settings : MoreHorizontal);
          const label = href === '/profile' ? 'Profile' : item?.label || 'Menu';
          const active = href === '/profile' ? pathname.startsWith('/profile') : isActivePath(pathname, href);
          return (
            <Link key={href} href={href} className={active ? 'mobile-bottom-active' : ''} onClick={() => setMenuOpen(false)}>
              <Icon size={18}/><span>{label}</span>
            </Link>
          );
        })}
        <button onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen}><Menu size={18}/><span>Menu</span></button>
      </nav>
    </div>
  );
}

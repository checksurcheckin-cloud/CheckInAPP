import React from 'react';
import { NavLink } from 'react-router-dom';
import { Activity, Building2, LayoutDashboard, LogOut, ScrollText, ShieldCheck, Tablet } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ROLE_LABELS } from '../lib/format';

const NAV = [
  { to: '/', label: "Vue d'ensemble", icon: LayoutDashboard, end: true },
  { to: '/companies', label: 'Entreprises', icon: Building2 },
  { to: '/devices', label: 'Tablettes', icon: Tablet },
  { to: '/health', label: 'Santé', icon: Activity },
  { to: '/audit', label: 'Journal', icon: ScrollText },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { admin, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <ShieldCheck size={18} />
          </span>
          <div>
            <div className="brand-name">CheckInApp</div>
            <div className="brand-sub">Console plateforme</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <item.icon size={17} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="who">
            <span className="who-name">{admin?.name}</span>
            <span className="who-role">{admin ? ROLE_LABELS[admin.role] : ''}</span>
          </div>
          <button className="btn btn-ghost-dark" onClick={logout}>
            <LogOut size={15} />
            Déconnexion
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

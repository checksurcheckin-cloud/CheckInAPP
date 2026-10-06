import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  CalendarDays,
  Radio,
  ArrowLeftRight,
  Users,
  LogOut,
  CalendarClock,
  Settings,
  MapPin,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { colors, gradients, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import { useAuth } from '../services/AuthService';

const COLLAPSE_KEY = 'horaires_sidebar_collapsed';

function readCollapsedPreference(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

const NAV_ITEMS = [
  { to: '/planning', label: 'Planning', icon: CalendarDays },
  { to: '/presence', label: 'Présence', icon: Radio },
  { to: '/approvals', label: 'Échanges', icon: ArrowLeftRight },
  { to: '/team', label: 'Équipe', icon: Users },
  { to: '/sites', label: 'Sites', icon: MapPin },
  { to: '/settings', label: 'Réglages', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  // Repliable surtout pour la page Planning (grille large, décision #12) —
  // persisté en localStorage pour ne pas revenir déplié à chaque navigation
  // ou rechargement. Best-effort : une exception ici (mode privé, storage
  // bloqué) ne doit jamais empêcher la page de s'afficher.
  const [collapsed, setCollapsed] = useState(readCollapsedPreference);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // Best-effort — voir readCollapsedPreference.
      }
      return next;
    });
  };

  return (
    <div className="app-shell" style={styles.root}>
      <aside
        className="app-sidebar"
        style={{ ...styles.sidebar, width: collapsed ? 84 : 220, padding: collapsed ? spacing.sm : spacing.lg }}
      >
        <div style={styles.brandRow}>
          <div style={styles.brandMark}>
            <CalendarClock size={18} color={colors.surface} strokeWidth={2.5} />
          </div>
          {collapsed ? null : (
            <span className="gradient-text" style={styles.brand}>
              Horaires
            </span>
          )}
        </div>
        <nav className="app-sidebar-nav" style={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className="nav-link"
              title={collapsed ? item.label : undefined}
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(collapsed ? styles.navLinkCollapsed : {}),
                ...(isActive ? styles.navLinkActive : {}),
              })}
            >
              <item.icon size={collapsed ? 28 : 18} strokeWidth={2} />
              {collapsed ? null : item.label}
            </NavLink>
          ))}
        </nav>
        <button
          className="btn"
          style={styles.collapseButton}
          onClick={toggleCollapsed}
          title={collapsed ? 'Déplier le menu' : 'Replier le menu'}
        >
          {collapsed ? (
            <ChevronRight size={24} strokeWidth={2} />
          ) : (
            <ChevronLeft size={16} strokeWidth={2} />
          )}
          {collapsed ? null : 'Replier'}
        </button>
        <div className="app-sidebar-footer" style={styles.footer}>
          {collapsed ? null : (
            <div className="app-sidebar-footer-name" style={styles.userName}>
              {user?.firstName} {user?.lastName}
            </div>
          )}
          <button
            className="btn"
            style={{ ...styles.logoutButton, ...(collapsed ? styles.logoutButtonCollapsed : {}) }}
            onClick={logout}
            title={collapsed ? 'Déconnexion' : undefined}
          >
            <LogOut size={collapsed ? 24 : 16} strokeWidth={2} />
            {collapsed ? null : 'Déconnexion'}
          </button>
        </div>
      </aside>
      <main className="page-padding" style={styles.main}>
        {children}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  // height (pas minHeight) : la sidebar reste fixe à l'écran et seul `main`
  // défile quand le contenu d'une page (ex: grille planning) dépasse la
  // hauteur visible — avant ce changement, root grandissait avec le
  // contenu et faisait défiler toute la page, sidebar comprise.
  root: { display: 'flex', height: '100vh', backgroundColor: colors.background },
  sidebar: {
    flexShrink: 0,
    backgroundColor: colors.surface,
    borderRight: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    padding: spacing.lg,
    transition: 'width 0.15s ease',
    // overflowY (pas overflowX) en style inline : sous 880px, la CSS
    // (index.css) bascule la sidebar en barre horizontale avec son propre
    // `overflow-x: auto` — un overflowX inline ici (plus prioritaire que la
    // feuille de style externe faute de !important) le casserait.
    overflowY: 'auto',
  },
  brandRow: { display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    background: gradients.brand,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  brand: {
    fontFamily: "'Sora', sans-serif",
    fontSize: typography.sizes.xl,
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  nav: { display: 'flex', flexDirection: 'column', gap: spacing.xs, flex: 1 },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.md,
    color: colors.textSecondary,
    textDecoration: 'none',
    fontSize: typography.sizes.md,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  navLinkActive: { backgroundColor: colors.primary, color: colors.surface, fontWeight: 600, boxShadow: shadows.sm },
  navLinkCollapsed: { justifyContent: 'center', paddingLeft: spacing.xs, paddingRight: spacing.xs },
  collapseButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.textSecondary,
    whiteSpace: 'nowrap',
    marginBottom: spacing.md,
  },
  footer: { borderTop: `1px solid ${colors.border}`, paddingTop: spacing.md },
  userName: { fontSize: typography.sizes.sm, color: colors.textPrimary, marginBottom: spacing.sm, whiteSpace: 'nowrap' },
  logoutButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    width: '100%',
    padding: spacing.sm,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.textSecondary,
    whiteSpace: 'nowrap',
  },
  logoutButtonCollapsed: { padding: spacing.sm, width: 'auto' },
  // minHeight: 0 est nécessaire ici : un enfant flex a par défaut une
  // hauteur minimale = celle de son contenu, ce qui empêcherait `overflowY:
  // auto` de jamais s'activer (le conteneur grandirait plutôt que de
  // défiler) même avec `root` en hauteur fixe.
  main: { flex: 1, padding: spacing.xl, overflowY: 'auto', minWidth: 0, minHeight: 0 },
};

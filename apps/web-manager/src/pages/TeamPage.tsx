import React, { useEffect, useState } from 'react';
import { UserPlus, RefreshCw, KeyRound, Eye, EyeOff } from 'lucide-react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { Site, SiteScope, User, UserRole, UserStatus } from '@horaires/shared-types';
import { apiClient, useAuth } from '../services/AuthService';
import { SiteSelect } from '../components/SiteSelect';
import { ManagedSitesDialog, managedSitesLabel } from '../components/ManagedSitesDialog';
import { loadManagedSites } from '../lib/siteScope';
import { Dialog } from '../components/Dialog';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employé',
};

const STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Actif',
  invited: 'Invité',
  disabled: 'Désactivé',
};

export function TeamPage() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<UserRole>('employee');
  const [inviteSiteId, setInviteSiteId] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  // PIN tablette affichés en clair, par employé — masqués par défaut, lus à
  // la demande (GET /users/:id/pin) pour ne pas les exposer à l'écran en
  // permanence. null = compte sans PIN consultable.
  const [revealedPins, setRevealedPins] = useState<Record<string, string | null>>({});
  const [pinToRegenerate, setPinToRegenerate] = useState<User | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  // Filtre de la liste : '' = tous les magasins, 'none' = employés sans
  // magasin, sinon l'id d'un site (seulement les employés qui y sont
  // rattachés — managers/admins n'apparaissent que sous « Tous »).
  const [siteFilter, setSiteFilter] = useState('');
  // Périmètre de l'appelant (décision #36) : un manager limité ne voit que
  // les employés de ses magasins (et ceux pas encore rattachés).
  const [scope, setScope] = useState<SiteScope | null>(null);
  const scoped = scope !== null && !scope.allSites;
  const [managedTarget, setManagedTarget] = useState<User | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const [list, managed] = await Promise.all([apiClient.getUsers(), loadManagedSites()]);
      setUsers(list);
      setSites(managed.sites);
      setScope(managed.scope);
      // Manager limité : un employé invité doit être rattaché à un de ses
      // magasins (le backend le refuse sinon).
      if (!managed.scope.allSites) {
        setInviteSiteId((current) => current || managed.sites[0]?.id || '');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsInviting(true);
    try {
      await apiClient.inviteUser({
        email: email.trim(),
        firstName,
        lastName,
        role,
        siteId: inviteSiteId || undefined,
      });
      setEmail('');
      setFirstName('');
      setLastName('');
      setRole('employee');
      if (!scoped) setInviteSiteId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'invitation");
    } finally {
      setIsInviting(false);
    }
  };

  const changeRole = async (userId: string, newRole: UserRole) => {
    setBusyUserId(userId);
    try {
      await apiClient.updateUserRole(userId, newRole);
      await load();
    } finally {
      setBusyUserId(null);
    }
  };

  // Pas encore de flow "accepter l'invitation" (voir CLAUDE.md) — en
  // attendant, un manager peut activer/désactiver un compte directement ici.
  const changeStatus = async (userId: string, newStatus: UserStatus) => {
    setBusyUserId(userId);
    try {
      await apiClient.updateUserStatus(userId, newStatus);
      await load();
    } finally {
      setBusyUserId(null);
    }
  };

  const regenerateBadge = async (userId: string) => {
    setBusyUserId(userId);
    try {
      await apiClient.regenerateBadge(userId);
      await load();
    } finally {
      setBusyUserId(null);
    }
  };

  const togglePin = async (userId: string) => {
    if (userId in revealedPins) {
      setRevealedPins(({ [userId]: _hidden, ...rest }) => rest);
      return;
    }
    setBusyUserId(userId);
    try {
      const { pin } = await apiClient.getUserPin(userId);
      setRevealedPins((prev) => ({ ...prev, [userId]: pin }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN indisponible');
    } finally {
      setBusyUserId(null);
    }
  };

  // Nouveau PIN aléatoire (unique dans l'entreprise) — affiché directement
  // pour que le manager puisse le communiquer ; l'ancien ne marche plus.
  const regeneratePin = async (userId: string) => {
    setPinToRegenerate(null);
    setBusyUserId(userId);
    try {
      const { pin } = await apiClient.regenerateUserPin(userId);
      setRevealedPins((prev) => ({ ...prev, [userId]: pin }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la régénération du PIN');
    } finally {
      setBusyUserId(null);
    }
  };

  // Surcharge individuelle d'un réglage de pointage (GPS ou app mobile) —
  // tri-state : 'inherit' (null, suit le réglage entreprise), 'on' (true),
  // 'off' (false).
  const changeClockInSetting = async (
    userId: string,
    key: 'gpsClockInEnabled' | 'mobileClockInEnabled',
    value: 'inherit' | 'on' | 'off',
  ) => {
    setBusyUserId(userId);
    try {
      await apiClient.updateUserSettings(userId, { [key]: value === 'inherit' ? null : value === 'on' });
      await load();
    } finally {
      setBusyUserId(null);
    }
  };

  // Site de rattachement — valeur vide = aucun site (siteId: null), reste
  // visible sur tous les sites de la grille planning (décision #25).
  const changeSite = async (userId: string, value: string) => {
    setBusyUserId(userId);
    try {
      await apiClient.updateUserSettings(userId, { siteId: value || null });
      await load();
    } finally {
      setBusyUserId(null);
    }
  };

  // Rôle admin et comptes admin réservés aux admins — un manager ne peut ni
  // promouvoir quelqu'un admin, ni modifier le rôle/statut d'un admin. Et on
  // ne retire jamais son rôle ou son accès au dernier admin actif de
  // l'entreprise (sinon plus personne ne peut changer les réglages réservés).
  // ATTENTION : masquage d'interface seulement — l'API PATCH /users/:id/role
  // et /status l'accepte toujours d'un manager (pas de garde backend).
  const activeAdminCount = users.filter((u) => u.role === 'admin' && u.status === 'active').length;
  const canEditAccess = (u: User) => {
    if (u.role !== 'admin') return true;
    if (!isAdmin) return false;
    return !(u.status === 'active' && activeAdminCount <= 1);
  };

  const scopedUsers = scoped
    ? users.filter((u) => u.role === 'employee' && (!u.siteId || scope!.siteIds.includes(u.siteId)))
    : users;
  const visibleUsers =
    siteFilter === ''
      ? scopedUsers
      : siteFilter === 'none'
        ? scopedUsers.filter((u) => u.role === 'employee' && !u.siteId)
        : scopedUsers.filter((u) => u.siteId === siteFilter);

  return (
    <div>
      <div style={styles.headerRow}>
        <h1 style={{ ...styles.title, marginBottom: 0 }}>Équipe</h1>
        <SiteSelect
          sites={sites}
          value={siteFilter}
          onChange={setSiteFilter}
          allOptionLabel="Tous les magasins"
          extraOptions={[{ value: 'none', label: 'Sans magasin' }]}
        />
      </div>

      <form style={styles.inviteForm} onSubmit={invite}>
        <h2 style={styles.sectionTitle}>Inviter un employé</h2>
        <div style={styles.inviteRow}>
          <input
            style={styles.input}
            placeholder="Prénom"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <input
            style={styles.input}
            placeholder="Nom"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {scoped ? null : (
            <select style={styles.input} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="employee">Employé</option>
              <option value="manager">Manager</option>
            </select>
          )}
          <select style={styles.input} value={inviteSiteId} onChange={(e) => setInviteSiteId(e.target.value)}>
            {scoped ? null : <option value="">Aucun site</option>}
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            className="btn btn-gradient"
            style={styles.button}
            type="submit"
            disabled={isInviting || !email || !firstName || !lastName}
          >
            <UserPlus size={16} strokeWidth={2.25} />
            Inviter
          </button>
        </div>
        {error ? <p style={styles.error}>{error}</p> : null}
      </form>

      {isLoading ? (
        <p style={styles.muted}>Chargement…</p>
      ) : (
        <div style={styles.tableWrap}>
        <table className="data-table" style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Nom</th>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Rôle</th>
              <th style={styles.th}>Site</th>
              <th style={styles.th}>Statut</th>
              <th style={styles.th}>Badge</th>
              <th style={styles.th}>PIN</th>
              <th style={styles.th}>Pointage QR</th>
              <th style={styles.th}>Pointage GPS</th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={9}>
                  <span style={styles.muted}>Aucun employé pour ce magasin.</span>
                </td>
              </tr>
            ) : null}
            {visibleUsers.map((u) => (
              <tr key={u.id}>
                <td style={styles.td}>
                  {u.firstName} {u.lastName}
                </td>
                <td style={styles.td}>{u.email}</td>
                <td style={styles.td}>
                  {canEditAccess(u) && !scoped ? (
                    <select
                      style={styles.inlineSelect}
                      value={u.role}
                      disabled={busyUserId === u.id}
                      onChange={(e) => changeRole(u.id, e.target.value as UserRole)}
                    >
                      <option value="employee">{ROLE_LABELS.employee}</option>
                      <option value="manager">{ROLE_LABELS.manager}</option>
                      {isAdmin ? <option value="admin">{ROLE_LABELS.admin}</option> : null}
                    </select>
                  ) : (
                    <span title={isAdmin ? 'Dernier admin actif' : 'Réservé aux admins'}>{ROLE_LABELS[u.role]}</span>
                  )}
                </td>
                <td style={styles.td}>
                  {/* Managers/admins supervisent tous les sites — pas de
                      rattachement possible, voir décision #25. */}
                  {u.role === 'employee' ? (
                    <select
                      style={styles.inlineSelect}
                      value={u.siteId ?? ''}
                      disabled={busyUserId === u.id}
                      onChange={(e) => changeSite(u.id, e.target.value)}
                    >
                      <option value="">Aucun (tous les sites)</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : u.role === 'manager' && isAdmin ? (
                    // Magasins gérés par ce manager (décision #36).
                    <button
                      type="button"
                      className="btn"
                      style={styles.inlineSelect}
                      disabled={busyUserId === u.id}
                      onClick={() => setManagedTarget(u)}
                    >
                      {managedSitesLabel(u, sites)} ▾
                    </button>
                  ) : (
                    <span style={styles.muted}>
                      {u.role === 'manager' ? managedSitesLabel(u, sites) : 'Tous les magasins'}
                    </span>
                  )}
                </td>
                <td style={styles.td}>
                  {canEditAccess(u) ? (
                    <select
                      style={styles.inlineSelect}
                      value={u.status}
                      disabled={busyUserId === u.id}
                      onChange={(e) => changeStatus(u.id, e.target.value as UserStatus)}
                    >
                      <option value="invited">{STATUS_LABELS.invited}</option>
                      <option value="active">{STATUS_LABELS.active}</option>
                      <option value="disabled">{STATUS_LABELS.disabled}</option>
                    </select>
                  ) : (
                    <span title={isAdmin ? 'Dernier admin actif' : 'Réservé aux admins'}>{STATUS_LABELS[u.status]}</span>
                  )}
                </td>
                <td style={styles.td}>
                  <button
                    className="btn"
                    style={styles.smallButton}
                    disabled={busyUserId === u.id}
                    onClick={() => regenerateBadge(u.id)}
                  >
                    <RefreshCw size={12} strokeWidth={2.25} />
                    Régénérer
                  </button>
                </td>
                <td style={styles.td}>
                  <div style={styles.pinRow}>
                    <span style={styles.pinValue}>
                      {u.id in revealedPins ? (revealedPins[u.id] ?? 'Aucun') : '••••'}
                    </span>
                    <button
                      className="btn"
                      style={styles.iconButton}
                      disabled={busyUserId === u.id}
                      onClick={() => togglePin(u.id)}
                      aria-label={u.id in revealedPins ? 'Masquer le PIN' : 'Afficher le PIN'}
                      title={u.id in revealedPins ? 'Masquer le PIN' : 'Afficher le PIN'}
                    >
                      {u.id in revealedPins ? <EyeOff size={12} strokeWidth={2.25} /> : <Eye size={12} strokeWidth={2.25} />}
                    </button>
                    <button
                      className="btn"
                      style={styles.smallButton}
                      disabled={busyUserId === u.id}
                      onClick={() => setPinToRegenerate(u)}
                    >
                      <KeyRound size={12} strokeWidth={2.25} />
                      Nouveau
                    </button>
                  </div>
                </td>
                {(['mobileClockInEnabled', 'gpsClockInEnabled'] as const).map((key) => (
                  <td key={key} style={styles.td}>
                    <select
                      style={styles.inlineSelect}
                      value={u[key] === true ? 'on' : u[key] === false ? 'off' : 'inherit'}
                      disabled={busyUserId === u.id}
                      onChange={(e) => changeClockInSetting(u.id, key, e.target.value as 'inherit' | 'on' | 'off')}
                    >
                      <option value="inherit">Suit le réglage entreprise</option>
                      <option value="on">Activé (surcharge)</option>
                      <option value="off">Désactivé (surcharge)</option>
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <ManagedSitesDialog
        manager={managedTarget}
        sites={sites}
        onClose={() => setManagedTarget(null)}
        onSave={async (userId, siteIds) => {
          await apiClient.setManagedSites(userId, siteIds);
          await load();
        }}
      />

      <Dialog
        open={pinToRegenerate !== null}
        variant="warning"
        title="Générer un nouveau PIN ?"
        message={
          pinToRegenerate
            ? `L'ancien PIN de ${pinToRegenerate.firstName} ${pinToRegenerate.lastName} ne fonctionnera plus sur la tablette. Le nouveau s'affichera dans la colonne PIN.`
            : ''
        }
        confirmLabel="Générer"
        cancelLabel="Annuler"
        onConfirm={() => pinToRegenerate && regeneratePin(pinToRegenerate.id)}
        onClose={() => setPinToRegenerate(null)}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  title: { fontSize: typography.sizes['2xl'], fontWeight: 700, color: colors.textPrimary, marginBottom: spacing.lg },
  sectionTitle: { fontSize: typography.sizes.md, fontWeight: 700, color: colors.textPrimary, margin: 0, marginBottom: spacing.sm },
  inviteForm: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    border: `1px solid ${colors.border}`,
    marginBottom: spacing.xl,
    boxShadow: shadows.sm,
  },
  inviteRow: { display: 'flex', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' },
  input: {
    padding: spacing.sm,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    fontSize: typography.sizes.sm,
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.md,
    border: 'none',
    backgroundColor: colors.primary,
    color: colors.surface,
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: { color: colors.danger, fontSize: typography.sizes.sm, marginTop: spacing.sm },
  muted: { color: colors.textSecondary },
  tableWrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    border: `1px solid ${colors.border}`,
    overflowX: 'auto',
    boxShadow: shadows.sm,
  },
  table: { width: '100%', minWidth: 820, borderCollapse: 'collapse' },
  th: {
    textAlign: 'left',
    padding: spacing.sm,
    borderBottom: `1px solid ${colors.border}`,
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
  },
  td: { padding: spacing.sm, borderBottom: `1px solid ${colors.border}`, color: colors.textPrimary },
  inlineSelect: { padding: spacing.xs, borderRadius: radius.sm, border: `1px solid ${colors.border}` },
  smallButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: `${spacing.xs}px ${spacing.sm}px`,
    borderRadius: radius.sm,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    cursor: 'pointer',
    fontSize: typography.sizes.xs,
  },
  pinRow: { display: 'flex', alignItems: 'center', gap: spacing.xs },
  pinValue: {
    minWidth: 40,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontWeight: 700,
    letterSpacing: 2,
    color: colors.textPrimary,
  },
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    padding: spacing.xs,
    borderRadius: radius.sm,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    cursor: 'pointer',
  },
};

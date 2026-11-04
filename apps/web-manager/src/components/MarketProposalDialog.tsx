import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { MarketScope, ProposeShiftOnMarketPayload, Shift, Site, User } from '@horaires/shared-types';
import { apiClient } from '../services/AuthService';

type Props = {
  shift: Shift | null;
  sites: Site[];
  users: User[];
  onClose: () => void;
  onSave: (shiftId: string, payload: ProposeShiftOnMarketPayload) => Promise<void>;
};

// Public d'un créneau libre sur le marché (décision #33) : par défaut le
// magasin du shift, sinon élargi (tous les sites, certains sites) ou
// restreint (certains employés). Ouvert depuis une carte de la ligne
// « Shifts disponibles ».
export function MarketProposalDialog({ shift, sites, users, onClose, onSave }: Props) {
  const [scope, setScope] = useState<MarketScope>('site');
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Employés qui travaillent déjà pendant ce créneau, tous sites confondus —
  // on ne leur propose pas un second shift au même moment (le marché les
  // filtre aussi côté backend, listOpenOffers).
  const [busyUserIds, setBusyUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!shift) return;
    let cancelled = false;
    setBusyUserIds(new Set());
    const start = new Date(shift.startsAt);
    const end = new Date(shift.endsAt);
    // `from`/`to` filtrent sur l'heure de début : on remonte d'un jour pour
    // attraper un shift de nuit commencé la veille.
    apiClient
      .getShifts({ from: new Date(start.getTime() - 86400000).toISOString(), to: end.toISOString() })
      .then((list) => {
        if (cancelled) return;
        const ids = list
          .filter((s) => s.id !== shift.id && new Date(s.startsAt) < end && new Date(s.endsAt) > start)
          .flatMap((s) => (s.assignments ?? []).filter((a) => a.status !== 'cancelled').map((a) => a.userId));
        setBusyUserIds(new Set(ids));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [shift]);

  useEffect(() => {
    if (!shift) return;
    setScope(shift.marketScope ?? 'site');
    setSiteIds(shift.marketSiteIds ?? []);
    setUserIds(shift.marketUserIds ?? []);
    setQuery('');
    setError(null);
  }, [shift]);

  const siteName = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites]);
  const employees = useMemo(
    () =>
      users
        .filter((u) => u.role === 'employee' && u.status !== 'disabled')
        .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)),
    [users],
  );
  const freeEmployees = employees.filter((u) => !busyUserIds.has(u.id));
  const hiddenCount = employees.length - freeEmployees.length;
  const visibleEmployees = freeEmployees.filter((u) =>
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  // Un employé choisi avant d'avoir pris un autre shift sur ce créneau n'est
  // plus proposable : il sort de la sélection envoyée.
  const selectedUserIds = userIds.filter((id) => !busyUserIds.has(id));

  if (!shift) return null;

  const shiftSiteName = siteName.get(shift.siteId) ?? 'son magasin';
  const canSave =
    !isSaving && (scope === 'sites' ? siteIds.length > 0 : scope === 'employees' ? selectedUserIds.length > 0 : true);

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await onSave(shift.id, {
        scope,
        ...(scope === 'sites' ? { siteIds } : {}),
        ...(scope === 'employees' ? { userIds: selectedUserIds } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de proposer ce shift');
    } finally {
      setIsSaving(false);
    }
  };

  const options: { value: MarketScope; label: string; hint: string }[] = [
    { value: 'site', label: 'Son magasin', hint: `Les employés de ${shiftSiteName} (par défaut)` },
    { value: 'all_sites', label: 'Tous les sites', hint: "Tous les employés de l'entreprise" },
    { value: 'sites', label: 'Sites spécifiques', hint: 'Les employés des sites choisis' },
    { value: 'employees', label: 'Employés spécifiques', hint: 'Seulement les personnes choisies' },
  ];

  const timeLabel = `${new Date(shift.startsAt).toLocaleDateString('fr-BE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })}, ${new Date(shift.startsAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })} - ${new Date(
    shift.endsAt,
  ).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.box} onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 style={styles.title}>Proposer sur le marché</h2>
          <p style={styles.subtitle}>{timeLabel}</p>
        </div>

        <div style={styles.optionList}>
          {options.map((opt) => {
            const active = scope === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className="btn"
                style={{ ...styles.option, ...(active ? styles.optionActive : {}) }}
                onClick={() => setScope(opt.value)}
              >
                <span style={{ ...styles.radio, ...(active ? styles.radioActive : {}) }} />
                <span style={styles.optionText}>
                  <span style={styles.optionLabel}>{opt.label}</span>
                  <span style={styles.optionHint}>{opt.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {scope === 'sites' ? (
          <div style={styles.pickList}>
            {sites.map((s) => (
              <label key={s.id} style={styles.pickRow}>
                <input type="checkbox" checked={siteIds.includes(s.id)} onChange={() => setSiteIds(toggle(siteIds, s.id))} />
                {s.name}
              </label>
            ))}
          </div>
        ) : null}

        {scope === 'employees' ? (
          <>
            <div style={styles.searchWrap}>
              <Search size={14} color={colors.textSecondary} />
              <input
                style={styles.searchInput}
                placeholder="Rechercher un employé"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div style={styles.pickList}>
              {visibleEmployees.map((u) => (
                <label key={u.id} style={styles.pickRow}>
                  <input
                    type="checkbox"
                    checked={userIds.includes(u.id)}
                    onChange={() => setUserIds(toggle(userIds, u.id))}
                  />
                  <span style={{ flex: 1 }}>
                    {u.firstName} {u.lastName}
                  </span>
                  <span style={styles.pickMeta}>{u.siteId ? siteName.get(u.siteId) ?? '' : 'Sans site'}</span>
                </label>
              ))}
              {visibleEmployees.length === 0 ? <p style={styles.pickMeta}>Aucun employé trouvé</p> : null}
            </div>
            <p style={styles.pickMeta}>
              {`${selectedUserIds.length} employé${selectedUserIds.length > 1 ? 's' : ''} sélectionné${
                selectedUserIds.length > 1 ? 's' : ''
              }`}
              {hiddenCount > 0
                ? ` · ${hiddenCount} masqué${hiddenCount > 1 ? 's' : ''} (déjà en shift sur ce créneau)`
                : ''}
            </p>
          </>
        ) : null}

        {shift.status === 'draft' ? (
          <p style={styles.note}>Ce shift est encore en brouillon : le proposer le publiera.</p>
        ) : null}

        {error ? <p style={styles.error}>{error}</p> : null}

        <div style={styles.actions}>
          <button className="btn" style={styles.secondaryButton} onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn"
            style={{ ...styles.primaryButton, opacity: canSave ? 1 : 0.5 }}
            disabled={!canSave}
            onClick={handleSave}
          >
            {isSaving ? 'Envoi…' : 'Proposer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Libellé court du public actuel, affiché sur la carte du shift.
export function marketScopeLabel(shift: Shift): string {
  switch (shift.marketScope) {
    case 'all_sites':
      return 'Tous les sites';
    case 'sites': {
      const n = shift.marketSiteIds?.length ?? 0;
      return `${n} site${n > 1 ? 's' : ''}`;
    }
    case 'employees': {
      const n = shift.marketUserIds?.length ?? 0;
      return `${n} employé${n > 1 ? 's' : ''}`;
    }
    default:
      return 'Son magasin';
  }
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(17, 24, 39, 0.4)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    animation: 'fade-in 0.15s ease',
  },
  box: {
    width: 440,
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: 'calc(100vh - 64px)',
    overflowY: 'auto',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    boxShadow: shadows.lg,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    animation: 'scale-in 0.15s ease',
  },
  title: {
    fontFamily: "'Sora', sans-serif",
    fontSize: typography.sizes.lg,
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
  },
  subtitle: { margin: '4px 0 0', fontSize: typography.sizes.sm, color: colors.textSecondary },
  optionList: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    textAlign: 'left',
    cursor: 'pointer',
  },
  optionActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  radio: {
    width: 14,
    height: 14,
    flexShrink: 0,
    borderRadius: radius.full,
    border: `2px solid ${colors.border}`,
  },
  radioActive: { borderColor: colors.primary, boxShadow: `inset 0 0 0 3px ${colors.surface}`, backgroundColor: colors.primary },
  optionText: { display: 'flex', flexDirection: 'column' },
  optionLabel: { fontSize: typography.sizes.sm, fontWeight: 600, color: colors.textPrimary },
  optionHint: { fontSize: typography.sizes.xs, color: colors.textSecondary },
  pickList: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 220,
    overflowY: 'auto',
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  pickRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `6px ${spacing.sm}px`,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    cursor: 'pointer',
  },
  pickMeta: { fontSize: typography.sizes.xs, color: colors.textSecondary, margin: 0 },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `0 ${spacing.sm}px`,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
  },
  searchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    padding: `${spacing.sm}px 0`,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    backgroundColor: 'transparent',
  },
  note: {
    margin: 0,
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    backgroundColor: colors.warningTint,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  error: { color: colors.danger, fontSize: typography.sizes.sm, margin: 0 },
  actions: { display: 'flex', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.sm },
  secondaryButton: {
    padding: `${spacing.sm}px ${spacing.lg}px`,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontWeight: 600,
    cursor: 'pointer',
  },
  primaryButton: {
    padding: `${spacing.sm}px ${spacing.lg}px`,
    borderRadius: radius.md,
    border: 'none',
    backgroundColor: colors.primary,
    color: colors.surface,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

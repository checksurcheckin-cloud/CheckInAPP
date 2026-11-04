import React, { useEffect, useState } from 'react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { Site, User } from '@horaires/shared-types';

type Props = {
  manager: User | null;
  sites: Site[];
  onClose: () => void;
  onSave: (userId: string, siteIds: string[]) => Promise<void>;
};

// Magasins gérés par un manager (décision #36) — admin uniquement. Aucun
// magasin coché = le manager gère tous les magasins.
export function ManagedSitesDialog({ manager, sites, onClose, onSave }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!manager) return;
    setSelected((manager.managedSites ?? []).map((m) => m.siteId));
    setError(null);
  }, [manager]);

  if (!manager) return null;

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await onSave(manager.id, selected);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la mise à jour');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.box} onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 style={styles.title}>Magasins gérés</h2>
          <p style={styles.subtitle}>
            {manager.firstName} {manager.lastName} ne gérera que les magasins cochés : planning, présence, équipe et
            échanges.
          </p>
        </div>

        <div style={styles.pickList}>
          {sites.map((s) => (
            <label key={s.id} style={styles.pickRow}>
              <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
              {s.name}
            </label>
          ))}
        </div>

        <p style={styles.hint}>
          {selected.length === 0
            ? 'Aucun magasin coché : ce manager gère tous les magasins.'
            : `${selected.length} magasin${selected.length > 1 ? 's' : ''} sur ${sites.length}.`}
        </p>

        {error ? <p style={styles.error}>{error}</p> : null}

        <div style={styles.actions}>
          <button className="btn" style={styles.secondaryButton} onClick={onClose}>
            Annuler
          </button>
          <button className="btn" style={styles.primaryButton} disabled={isSaving} onClick={handleSave}>
            {isSaving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Libellé court pour la colonne Site de la page Équipe.
export function managedSitesLabel(manager: User, sites: Site[]): string {
  const ids = (manager.managedSites ?? []).map((m) => m.siteId);
  if (ids.length === 0) return 'Tous les magasins';
  if (ids.length === 1) return sites.find((s) => s.id === ids[0])?.name ?? '1 magasin';
  return `${ids.length} magasins`;
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
    width: 420,
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
  subtitle: { margin: '4px 0 0', fontSize: typography.sizes.sm, color: colors.textSecondary, lineHeight: 1.5 },
  pickList: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 260,
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
  hint: { fontSize: typography.sizes.xs, color: colors.textSecondary, margin: 0 },
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

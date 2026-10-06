import React, { useEffect, useState } from 'react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { Shift, ShiftStatus, Site } from '@horaires/shared-types';
import { toLocalInputValue } from '../lib/date';

type Props = {
  shift: Shift | null;
  sites: Site[];
  onClose: () => void;
  onSave: (
    shiftId: string,
    payload: { siteId: string; startsAt: string; endsAt: string; roleNeeded?: string; status: ShiftStatus },
  ) => Promise<void>;
};

const STATUS_OPTIONS: { value: ShiftStatus; label: string }[] = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'published', label: 'Publié' },
  { value: 'cancelled', label: 'Annulé' },
];

const STATUS_COLORS: Record<ShiftStatus, string> = {
  draft: colors.textSecondary,
  published: colors.success,
  cancelled: colors.danger,
};

// Double-cliquer une carte de shift ouvre ce dialog — modification complète
// (site, horaires, rôle, statut) sans quitter le planning.
export function EditShiftDialog({ shift, sites, onClose, onSave }: Props) {
  const [siteId, setSiteId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [roleNeeded, setRoleNeeded] = useState('');
  const [status, setStatus] = useState<ShiftStatus>('draft');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shift) return;
    setSiteId(shift.siteId);
    setStartsAt(toLocalInputValue(new Date(shift.startsAt)));
    setEndsAt(toLocalInputValue(new Date(shift.endsAt)));
    setRoleNeeded(shift.roleNeeded ?? '');
    setStatus(shift.status);
    setError(null);
  }, [shift]);

  if (!shift) return null;

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await onSave(shift.id, {
        siteId,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        roleNeeded: roleNeeded || undefined,
        status,
      });
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
        <h2 style={styles.title}>Modifier le shift</h2>

        <label style={styles.label}>
          Site
          <select style={styles.input} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <div style={styles.row}>
          <label style={styles.label}>
            Début
            <input
              style={styles.input}
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </label>
          <label style={styles.label}>
            Fin
            <input
              style={styles.input}
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </label>
        </div>

        <label style={styles.label}>
          Rôle
          <input
            style={styles.input}
            value={roleNeeded}
            onChange={(e) => setRoleNeeded(e.target.value)}
            placeholder="ex: Caissier"
          />
        </label>

        <span style={styles.labelText}>Statut</span>
        <div style={styles.statusRow}>
          {STATUS_OPTIONS.map((opt) => {
            const active = status === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className="btn"
                style={{
                  ...styles.statusPill,
                  ...(active
                    ? { backgroundColor: STATUS_COLORS[opt.value], borderColor: STATUS_COLORS[opt.value], color: colors.surface }
                    : {}),
                }}
                onClick={() => setStatus(opt.value)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {shift.assignments && shift.assignments.length > 0 ? (
          <p style={styles.assignedHint}>
            Assigné à {shift.assignments.length} employé{shift.assignments.length > 1 ? 's' : ''}.
          </p>
        ) : null}

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
  // Empilés verticalement plutôt que côte à côte : deux <input type="datetime-local">
  // sur une seule ligne dans une boîte de 420px se font couper par le navigateur.
  row: { display: 'flex', flexDirection: 'column', gap: spacing.md },
  label: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: typography.sizes.xs, color: colors.textSecondary },
  labelText: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginBottom: -spacing.sm },
  input: {
    padding: spacing.sm,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  statusRow: { display: 'flex', gap: spacing.xs },
  statusPill: {
    flex: 1,
    padding: `${spacing.xs}px ${spacing.sm}px`,
    borderRadius: radius.full,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
  },
  assignedHint: { fontSize: typography.sizes.xs, color: colors.textSecondary, margin: 0 },
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

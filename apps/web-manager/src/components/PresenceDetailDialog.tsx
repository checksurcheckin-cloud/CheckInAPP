import React, { useEffect } from 'react';
import { Coffee, LogIn, LogOut, Play, X } from 'lucide-react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { PresentEmployee, TimeEntrySource, TimeEntryType } from '@horaires/shared-types';
import { ENTRY_LABELS, computeDayTotals, formatClockTime, formatDuration } from '../lib/presence';

const ENTRY_ICONS: Record<TimeEntryType, typeof LogIn> = {
  clock_in: LogIn,
  break_start: Coffee,
  break_end: Play,
  clock_out: LogOut,
};

const ENTRY_COLORS: Record<TimeEntryType, { background: string; color: string }> = {
  clock_in: { background: colors.successTint, color: colors.success },
  break_start: { background: colors.warningTint, color: colors.warning },
  break_end: { background: colors.primaryTint, color: colors.primary },
  clock_out: { background: colors.background, color: colors.textSecondary },
};

type Props = {
  employee: PresentEmployee | null;
  now: number;
  sourceLabels: Record<TimeEntrySource, string>;
  onClose: () => void;
};

// Détail de la journée d'un employé (page Présence en direct) : chaque
// pointage dans l'ordre — arrivée, pause(s), fin(s) de pause, départ — avec
// le temps travaillé et le temps de pause cumulés.
export function PresenceDetailDialog({ employee, now, sourceLabels, onClose }: Props) {
  useEffect(() => {
    if (!employee) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [employee, onClose]);

  if (!employee) return null;

  const { workedMs, breakMs } = computeDayTotals(employee.entries, now);
  const statusLabel =
    employee.status === 'present' ? 'En poste' : employee.status === 'on_break' ? 'En pause' : 'Parti';

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={styles.box}
        role="dialog"
        aria-modal="true"
        aria-label={`Pointages de ${employee.firstName} ${employee.lastName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>
              {employee.firstName} {employee.lastName}
            </h2>
            <span style={styles.subtitle}>{statusLabel} · pointages du jour</span>
          </div>
          <button className="btn" style={styles.closeButton} onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        {employee.entries.length === 0 ? (
          <p style={styles.empty}>Aucun pointage aujourd'hui.</p>
        ) : (
          <ol style={styles.timeline}>
            {employee.entries.map((entry, index) => {
              const Icon = ENTRY_ICONS[entry.type];
              const tone = ENTRY_COLORS[entry.type];
              return (
                <li key={`${entry.timestamp}-${index}`} style={styles.row}>
                  <span style={{ ...styles.iconWrap, backgroundColor: tone.background, color: tone.color }}>
                    <Icon size={16} strokeWidth={2.25} />
                  </span>
                  <div style={styles.rowText}>
                    <span style={styles.rowLabel}>{ENTRY_LABELS[entry.type]}</span>
                    <span style={styles.rowSource}>{sourceLabels[entry.source] ?? entry.source}</span>
                  </div>
                  <span style={styles.rowTime}>{formatClockTime(entry.timestamp)}</span>
                </li>
              );
            })}
          </ol>
        )}

        <div style={styles.totals}>
          <div style={styles.total}>
            <span style={styles.totalLabel}>Temps travaillé</span>
            <span style={styles.totalValue}>{formatDuration(workedMs)}</span>
          </div>
          <div style={styles.total}>
            <span style={styles.totalLabel}>Pause</span>
            <span style={styles.totalValue}>{formatDuration(breakMs)}</span>
          </div>
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
    animation: 'scale-in 0.15s ease',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg },
  title: {
    fontFamily: "'Sora', sans-serif",
    fontSize: typography.sizes.lg,
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
  },
  subtitle: { fontSize: typography.sizes.sm, color: colors.textSecondary },
  closeButton: {
    border: 'none',
    background: 'transparent',
    color: colors.textSecondary,
    cursor: 'pointer',
    padding: spacing.xs,
    borderRadius: radius.md,
    display: 'flex',
  },
  empty: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  timeline: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: spacing.sm },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
  rowLabel: { fontWeight: 600, color: colors.textPrimary, fontSize: typography.sizes.sm },
  rowSource: { fontSize: typography.sizes.xs, color: colors.textSecondary },
  rowTime: { fontWeight: 700, color: colors.textPrimary, fontVariantNumeric: 'tabular-nums' },
  totals: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTop: `1px solid ${colors.border}`,
  },
  total: { display: 'flex', flexDirection: 'column' },
  totalLabel: { fontSize: typography.sizes.xs, color: colors.textSecondary },
  totalValue: { fontSize: typography.sizes.lg, fontWeight: 700, color: colors.textPrimary, fontVariantNumeric: 'tabular-nums' },
};

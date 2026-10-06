import React from 'react';
import { colors, spacing, radius, typography } from '@horaires/ui-tokens';
import type { Shift } from '@horaires/shared-types';
import { startOfWeek, startOfMonth, addDays } from '../lib/date';

type Props = {
  monthAnchor: Date;
  shifts: Shift[];
  onSelectShift: (shift: Shift) => void;
};

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MAX_VISIBLE_PER_DAY = 3;

// Vue d'ensemble en lecture — pas de glisser-déposer à cette échelle (les
// cases sont trop petites). Cliquer un shift bascule sur la vue semaine,
// qui reste l'écran interactif (créer/assigner/déplacer/supprimer).
export function MonthCalendar({ monthAnchor, shifts, onSelectShift }: Props) {
  const gridStart = startOfWeek(startOfMonth(monthAnchor));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const currentMonth = monthAnchor.getMonth();
  const today = new Date();

  return (
    <div>
      <div style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} style={styles.weekdayLabel}>
            {label}
          </div>
        ))}
      </div>
      <div style={styles.grid}>
        {days.map((date) => {
          const inMonth = date.getMonth() === currentMonth;
          const isToday = today.toDateString() === date.toDateString();
          const dayShifts = shifts
            .filter((s) => new Date(s.startsAt).toDateString() === date.toDateString())
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
          const visible = dayShifts.slice(0, MAX_VISIBLE_PER_DAY);
          const overflow = dayShifts.length - visible.length;

          return (
            <div key={date.toISOString()} style={{ ...styles.cell, opacity: inMonth ? 1 : 0.45 }}>
              <span style={{ ...styles.dayNumber, ...(isToday ? styles.dayNumberToday : {}) }}>
                {date.getDate()}
              </span>
              <div style={styles.pills}>
                {visible.map((shift) => (
                  <button key={shift.id} style={styles.pill} onClick={() => onSelectShift(shift)}>
                    {new Date(shift.startsAt).toLocaleTimeString('fr-BE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {(shift.assignments ?? []).length === 0 ? ' · non assigné' : ''}
                  </button>
                ))}
                {overflow > 0 ? <span style={styles.more}>+{overflow} de plus</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  weekdayRow: { display: 'flex', marginBottom: spacing.xs },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: spacing.xs,
  },
  cell: {
    minHeight: 96,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    padding: spacing.xs,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  dayNumber: {
    fontSize: typography.sizes.sm,
    fontWeight: 700,
    color: colors.textPrimary,
    fontFamily: "'Sora', sans-serif",
  },
  dayNumberToday: {
    color: colors.primary,
    backgroundColor: colors.primaryTint,
    borderRadius: radius.full,
    width: 22,
    height: 22,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pills: { display: 'flex', flexDirection: 'column', gap: 2 },
  pill: {
    textAlign: 'left',
    fontSize: 11,
    padding: '2px 6px',
    borderRadius: radius.sm,
    border: 'none',
    backgroundColor: colors.primaryTint,
    color: colors.primary,
    cursor: 'pointer',
    fontWeight: 600,
  },
  more: { fontSize: 11, color: colors.textSecondary, paddingLeft: 6 },
};

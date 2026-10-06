import React from 'react';
import { colors, spacing, radius, typography } from '@horaires/ui-tokens';
import type { User } from '@horaires/shared-types';
import { formatDurationLabel } from '../lib/date';

type Props = { user: User; totalMinutes: number };

// Première colonne de la grille planning, une ligne par employé : photo
// (initiales tant qu'il n'y a pas de vraie photo de profil dans le modèle
// User), nom, et total d'heures planifiées sur la période affichée.
export function EmployeeRowHeader({ user, totalMinutes }: Props) {
  return (
    <div style={styles.row}>
      <span style={styles.avatar}>
        {user.firstName[0]}
        {user.lastName[0]}
      </span>
      <div style={styles.textCol}>
        <span style={styles.name}>
          {user.firstName} {user.lastName}
        </span>
        <span style={styles.hours}>{formatDurationLabel(totalMinutes)}</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRight: `1px solid ${colors.border}`,
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
  },
  avatar: {
    width: 36,
    height: 36,
    minWidth: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primaryTint,
    color: colors.primary,
    fontSize: typography.sizes.sm,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  name: {
    fontSize: typography.sizes.sm,
    fontWeight: 600,
    color: colors.textPrimary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  hours: { fontSize: typography.sizes.xs, color: colors.textSecondary },
};

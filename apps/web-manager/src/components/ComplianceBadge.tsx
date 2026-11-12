import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { colors, radius } from '@horaires/ui-tokens';
import type { ComplianceViolation } from '@horaires/shared-types';
import { worstSeverity } from '../lib/compliance';

type Props = {
  violations: ComplianceViolation[];
  // Avec le nombre d'alertes (ligne employé) ou icône seule (carte de shift).
  showCount?: boolean;
};

// Pastille d'alerte de conformité — rouge pour une infraction, ambre pour un
// point à vérifier. Le détail s'affiche au survol.
export function ComplianceBadge({ violations, showCount = false }: Props) {
  if (violations.length === 0) return null;
  const severity = worstSeverity(violations);
  const color = severity === 'error' ? colors.danger : colors.warning;
  const unique = [...new Set(violations.map((v) => v.message))];

  return (
    <span
      style={{
        ...styles.badge,
        color,
        backgroundColor: severity === 'error' ? '#FEE2E2' : '#FEF3C7',
      }}
      title={unique.map((m) => `• ${m}`).join('\n')}
      aria-label={`${violations.length} alerte${violations.length > 1 ? 's' : ''} de conformité`}
    >
      <AlertTriangle size={10} strokeWidth={2.5} />
      {showCount ? <span>{unique.length}</span> : null}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '1px 5px',
    borderRadius: radius.full,
    fontSize: 10,
    fontWeight: 700,
    lineHeight: '14px',
    flexShrink: 0,
  },
};

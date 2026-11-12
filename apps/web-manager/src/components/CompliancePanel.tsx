import React, { useMemo, useState } from 'react';
import { AlertTriangle, Info, Scale, X } from 'lucide-react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { ComplianceViolation, User } from '@horaires/shared-types';
import { ComplianceIndex, SEVERITY_LABELS } from '../lib/compliance';

type Props = {
  open: boolean;
  index: ComplianceIndex;
  users: User[];
  onClose: () => void;
};

function dateLabel(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Récapitulatif des alertes de conformité de la période affichée, employé
// par employé. Purement informatif : rien n'est bloqué.
export function CompliancePanel({ open, index, users, onClose }: Props) {
  const [showInfos, setShowInfos] = useState(false);
  const nameOf = useMemo(() => {
    const map = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    return (id: string) => map.get(id) ?? 'Employé';
  }, [users]);

  if (!open) return null;

  const listed = showInfos ? [...index.alerts, ...index.infos] : index.alerts;
  const byUser = new Map<string, ComplianceViolation[]>();
  for (const v of listed) byUser.set(v.userId, [...(byUser.get(v.userId) ?? []), v]);
  const missing = [...index.missingContract];

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.box} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.iconWrap}>
            <Scale size={18} color={colors.primary} strokeWidth={2.25} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={styles.title}>Conformité du planning</h2>
            <p style={styles.subtitle}>
              Droit du travail belge, selon la commission paritaire du site. Avertissements uniquement : votre
              règlement de travail ou une dérogation peut autoriser ce qui est signalé. Durées comptées sans déduire
              les pauses.
            </p>
          </div>
          <button className="btn btn-icon" style={styles.close} onClick={onClose} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>

        {missing.length > 0 ? (
          <p style={styles.missing}>
            Contrat non renseigné pour {missing.map(nameOf).join(', ')} — contrôlé(s) comme temps plein majeur.
            Renseignez-le dans Équipe.
          </p>
        ) : null}

        {byUser.size === 0 ? (
          <p style={styles.empty}>Aucune alerte sur cette période.</p>
        ) : (
          [...byUser.entries()].map(([userId, list]) => (
            <div key={userId} style={styles.employee}>
              <h3 style={styles.employeeName}>{nameOf(userId)}</h3>
              {list.map((v, i) => (
                <div key={`${v.ruleId}-${v.date}-${i}`} style={styles.violation}>
                  {v.severity === 'info' ? (
                    <Info size={14} color={colors.textSecondary} style={styles.icon} />
                  ) : (
                    <AlertTriangle
                      size={14}
                      color={v.severity === 'error' ? colors.danger : colors.warning}
                      style={styles.icon}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={styles.meta}>
                      <span
                        style={{
                          ...styles.severity,
                          color:
                            v.severity === 'error'
                              ? colors.danger
                              : v.severity === 'warning'
                                ? colors.warning
                                : colors.textSecondary,
                        }}
                      >
                        {SEVERITY_LABELS[v.severity]}
                      </span>
                      <span>{dateLabel(v.date)}</span>
                      {v.toValidate ? <span style={styles.toValidate}>valeur sectorielle à valider</span> : null}
                    </div>
                    <p style={styles.message}>{v.message}</p>
                    <p style={styles.legalRef}>{v.legalRef}</p>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}

        {index.infos.length > 0 ? (
          <label style={styles.toggle}>
            <input type="checkbox" checked={showInfos} onChange={(e) => setShowInfos(e.target.checked)} />
            Afficher aussi les rappels ({index.infos.length}) — pauses, heures complémentaires
          </label>
        ) : null}
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
    width: 640,
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
  header: { display: 'flex', gap: spacing.md, alignItems: 'flex-start' },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    fontFamily: "'Sora', sans-serif",
    fontSize: typography.sizes.lg,
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
  },
  subtitle: { margin: '4px 0 0', fontSize: typography.sizes.xs, color: colors.textSecondary, lineHeight: 1.5 },
  close: { border: 'none', background: 'transparent', cursor: 'pointer', color: colors.textSecondary },
  missing: {
    margin: 0,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    fontSize: typography.sizes.sm,
  },
  empty: { color: colors.textSecondary, fontSize: typography.sizes.sm, margin: 0 },
  employee: { borderTop: `1px solid ${colors.border}`, paddingTop: spacing.md },
  employeeName: { fontSize: typography.sizes.md, fontWeight: 700, color: colors.textPrimary, margin: `0 0 ${spacing.sm}px` },
  violation: { display: 'flex', gap: spacing.sm, alignItems: 'flex-start', marginBottom: spacing.sm },
  icon: { marginTop: 2, flexShrink: 0 },
  meta: { display: 'flex', gap: spacing.sm, alignItems: 'center', fontSize: typography.sizes.xs, color: colors.textSecondary },
  severity: { fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 },
  toValidate: {
    padding: '0 6px',
    borderRadius: radius.full,
    backgroundColor: colors.primaryTint,
    color: colors.primary,
    fontWeight: 600,
  },
  message: { margin: '2px 0 0', fontSize: typography.sizes.sm, color: colors.textPrimary, lineHeight: 1.45 },
  legalRef: { margin: '2px 0 0', fontSize: typography.sizes.xs, color: colors.textSecondary },
  toggle: { display: 'flex', gap: spacing.sm, alignItems: 'center', fontSize: typography.sizes.sm, color: colors.textSecondary },
};

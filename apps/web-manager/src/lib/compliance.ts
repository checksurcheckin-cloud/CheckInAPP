import type { ComplianceReport, ComplianceSeverity, ComplianceViolation } from '@horaires/shared-types';

// Alertes de conformité (droit du travail belge) calculées par le backend
// (GET /compliance) — ce fichier ne fait que les ranger pour l'affichage.

export type ComplianceIndex = {
  // Alertes `error`/`warning` par shift et par employé — les `info` (rappels
  // de pause, heures complémentaires…) ne s'affichent que dans le panneau.
  byShift: Map<string, ComplianceViolation[]>;
  byUser: Map<string, ComplianceViolation[]>;
  alerts: ComplianceViolation[];
  infos: ComplianceViolation[];
  missingContract: Set<string>;
};

export const EMPTY_COMPLIANCE: ComplianceIndex = {
  byShift: new Map(),
  byUser: new Map(),
  alerts: [],
  infos: [],
  missingContract: new Set(),
};

export function indexCompliance(report: ComplianceReport | undefined): ComplianceIndex {
  if (!report) return EMPTY_COMPLIANCE;
  const byShift = new Map<string, ComplianceViolation[]>();
  const byUser = new Map<string, ComplianceViolation[]>();
  const alerts: ComplianceViolation[] = [];
  const infos: ComplianceViolation[] = [];
  for (const v of report.violations) {
    if (v.severity === 'info') {
      infos.push(v);
      continue;
    }
    alerts.push(v);
    for (const id of v.shiftIds) byShift.set(id, [...(byShift.get(id) ?? []), v]);
    byUser.set(v.userId, [...(byUser.get(v.userId) ?? []), v]);
  }
  return { byShift, byUser, alerts, infos, missingContract: new Set(report.missingContract) };
}

export function worstSeverity(list: ComplianceViolation[]): ComplianceSeverity {
  if (list.some((v) => v.severity === 'error')) return 'error';
  if (list.some((v) => v.severity === 'warning')) return 'warning';
  return 'info';
}

export const SEVERITY_LABELS: Record<ComplianceSeverity, string> = {
  error: 'Infraction',
  warning: 'À vérifier',
  info: 'Rappel',
};

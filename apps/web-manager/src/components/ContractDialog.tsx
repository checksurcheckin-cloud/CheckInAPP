import React, { useEffect, useState } from 'react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { ContractType, User } from '@horaires/shared-types';

export const CONTRACT_LABELS: Record<ContractType, string> = {
  full_time: 'Temps plein',
  part_time: 'Temps partiel',
  student: 'Étudiant',
  flexi_job: 'Flexi-job',
};

export type ContractPayload = {
  contractType: ContractType | null;
  weeklyContractHours: number | null;
  birthDate: string | null;
};

// Libellé court pour la colonne Contrat de la page Équipe.
export function contractLabel(user: User): string | null {
  if (!user.contractType) return null;
  const hours = user.contractType === 'part_time' && user.weeklyContractHours ? ` · ${user.weeklyContractHours} h` : '';
  return `${CONTRACT_LABELS[user.contractType]}${hours}`;
}

type Props = {
  employee: User | null;
  onClose: () => void;
  onSave: (userId: string, payload: ContractPayload) => Promise<void>;
};

// Contrat d'un employé : utilisé uniquement par les contrôles de conformité
// du planning (droit du travail belge) — temps partiel, étudiant et mineur
// n'ont pas les mêmes limites.
export function ContractDialog({ employee, onClose, onSave }: Props) {
  const [contractType, setContractType] = useState<ContractType | ''>('');
  const [hours, setHours] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!employee) return;
    setContractType(employee.contractType ?? '');
    setHours(employee.weeklyContractHours != null ? String(employee.weeklyContractHours) : '');
    setBirthDate(employee.birthDate ? employee.birthDate.slice(0, 10) : '');
    setError(null);
  }, [employee]);

  if (!employee) return null;

  const handleSave = async () => {
    setError(null);
    const parsedHours = hours.trim() === '' ? null : Number(hours.replace(',', '.'));
    if (parsedHours !== null && (Number.isNaN(parsedHours) || parsedHours < 1 || parsedHours > 50)) {
      setError('Heures par semaine : entre 1 et 50.');
      return;
    }
    setIsSaving(true);
    try {
      await onSave(employee.id, {
        contractType: contractType || null,
        weeklyContractHours: contractType === 'part_time' ? parsedHours : null,
        birthDate: birthDate || null,
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
        <div>
          <h2 style={styles.title}>Contrat</h2>
          <p style={styles.subtitle}>
            {employee.firstName} {employee.lastName} — sert uniquement à vérifier le planning avec le droit du travail.
          </p>
        </div>

        <label style={styles.field}>
          <span style={styles.label}>Type de contrat</span>
          <select
            style={styles.input}
            value={contractType}
            onChange={(e) => setContractType(e.target.value as ContractType | '')}
          >
            <option value="">Non renseigné</option>
            {(Object.keys(CONTRACT_LABELS) as ContractType[]).map((type) => (
              <option key={type} value={type}>
                {CONTRACT_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        {contractType === 'part_time' ? (
          <label style={styles.field}>
            <span style={styles.label}>Heures par semaine (contrat)</span>
            <input
              style={styles.input}
              inputMode="decimal"
              placeholder="ex. 20"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </label>
        ) : null}

        <label style={styles.field}>
          <span style={styles.label}>Date de naissance</span>
          <input style={styles.input} type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          <span style={styles.hint}>Pour les règles des moins de 18 ans (nuit, dimanche, durées, repos).</span>
        </label>

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

export const dialogStyles: Record<string, React.CSSProperties> = {
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
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: typography.sizes.sm, fontWeight: 600, color: colors.textPrimary },
  input: {
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
  },
  hint: { fontSize: typography.sizes.xs, color: colors.textSecondary },
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

const styles = dialogStyles;

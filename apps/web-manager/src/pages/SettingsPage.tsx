import React, { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { Company } from '@horaires/shared-types';
import { apiClient, useAuth } from '../services/AuthService';

export function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .getMyCompany()
      .then(setCompany)
      .finally(() => setIsLoading(false));
  }, []);

  const toggleGpsClockIn = async () => {
    if (!company || !isAdmin) return;
    setError(null);
    setIsSaving(true);
    const next = !company.gpsClockInEnabled;
    try {
      const updated = await apiClient.updateCompanySettings({ gpsClockInEnabled: next });
      setCompany(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la mise à jour');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <h1 style={styles.title}>Réglages</h1>

      {isLoading ? (
        <p style={styles.muted}>Chargement…</p>
      ) : company ? (
        <div style={styles.card}>
          <div style={styles.rowHeader}>
            <div style={styles.iconMark}>
              <MapPin size={18} color={colors.primary} strokeWidth={2.25} />
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={styles.sectionTitle}>Pointage GPS</h2>
              <p style={styles.description}>
                Autorise par défaut les employés de l'entreprise à pointer via la géolocalisation
                de leur téléphone, en plus du QR, du badge et du PIN. Ce réglage peut être
                surchargé individuellement pour chaque employé depuis l'écran Équipe.
              </p>
            </div>
            <label style={styles.switchWrap}>
              <input
                type="checkbox"
                checked={company.gpsClockInEnabled}
                disabled={!isAdmin || isSaving}
                onChange={toggleGpsClockIn}
                style={styles.switchInput}
              />
              <span
                style={{
                  ...styles.switchTrack,
                  backgroundColor: company.gpsClockInEnabled ? colors.primary : colors.border,
                }}
              >
                <span
                  style={{
                    ...styles.switchThumb,
                    transform: company.gpsClockInEnabled ? 'translateX(18px)' : 'translateX(0px)',
                  }}
                />
              </span>
            </label>
          </div>
          <p style={styles.status}>
            Pointage GPS actuellement{' '}
            <strong style={{ color: company.gpsClockInEnabled ? colors.success : colors.danger }}>
              {company.gpsClockInEnabled ? 'activé' : 'désactivé'}
            </strong>{' '}
            par défaut pour l'entreprise.
          </p>
          {!isAdmin ? (
            <p style={styles.muted}>Seul un administrateur peut modifier ce réglage.</p>
          ) : null}
          {error ? <p style={styles.error}>{error}</p> : null}
        </div>
      ) : (
        <p style={styles.muted}>Impossible de charger les réglages de l'entreprise.</p>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: typography.sizes['2xl'], fontWeight: 700, color: colors.textPrimary, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    border: `1px solid ${colors.border}`,
    boxShadow: shadows.sm,
    maxWidth: 640,
  },
  rowHeader: { display: 'flex', alignItems: 'flex-start', gap: spacing.md },
  iconMark: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sectionTitle: { fontSize: typography.sizes.md, fontWeight: 700, color: colors.textPrimary, margin: 0, marginBottom: spacing.xs },
  description: { fontSize: typography.sizes.sm, color: colors.textSecondary, margin: 0, lineHeight: 1.5 },
  switchWrap: { position: 'relative', display: 'inline-block', width: 40, height: 22, flexShrink: 0, marginTop: 2 },
  switchInput: { opacity: 0, width: 0, height: 0, position: 'absolute' },
  switchTrack: {
    display: 'block',
    width: 40,
    height: 22,
    borderRadius: radius.full,
    transition: 'background-color 0.15s ease',
    cursor: 'pointer',
    padding: 2,
    boxSizing: 'border-box',
  },
  switchThumb: {
    display: 'block',
    width: 18,
    height: 18,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    boxShadow: shadows.sm,
    transition: 'transform 0.15s ease',
  },
  status: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: spacing.md, marginBottom: 0 },
  muted: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  error: { color: colors.danger, fontSize: typography.sizes.sm, marginTop: spacing.sm },
};

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MapPin, Smartphone } from 'lucide-react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import { apiClient, useAuth } from '../services/AuthService';
import { queryKeys, useCompany } from '../lib/queries';

export function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const queryClient = useQueryClient();

  const companyQuery = useCompany();
  const company = companyQuery.data ?? null;
  const isLoading = companyQuery.isPending;
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (key: 'gpsClockInEnabled' | 'mobileClockInEnabled') => {
    if (!company || !isAdmin) return;
    setError(null);
    setIsSaving(true);
    try {
      const updated = await apiClient.updateCompanySettings({ [key]: !company[key] });
      queryClient.setQueryData(queryKeys.company, updated);
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
          <SettingRow
            icon={<Smartphone size={18} color={colors.primary} strokeWidth={2.25} />}
            title="Pointage par QR sur le téléphone"
            description="Autorise par défaut les employés à afficher sur leur téléphone le QR que la tablette scanne. Si le QR et le GPS sont tous deux désactivés, l'onglet Pointage disparaît de l'app mobile et le Planning devient l'écran d'accueil : on pointe alors uniquement par PIN ou badge sur la tablette."
            checked={company.mobileClockInEnabled}
            disabled={!isAdmin || isSaving}
            onToggle={() => toggle('mobileClockInEnabled')}
          />
          <div style={styles.divider} />
          <SettingRow
            icon={<MapPin size={18} color={colors.primary} strokeWidth={2.25} />}
            title="Pointage GPS"
            description="Autorise par défaut les employés à pointer via la géolocalisation de leur téléphone, indépendamment du QR. Désactivé, l'option GPS n'apparaît plus dans l'app mobile."
            checked={company.gpsClockInEnabled}
            disabled={!isAdmin || isSaving}
            onToggle={() => toggle('gpsClockInEnabled')}
          />
          <p style={styles.status}>
            Ces deux réglages peuvent être surchargés individuellement pour chaque employé depuis l'écran Équipe.
          </p>
          {!isAdmin ? <p style={styles.muted}>Seul un administrateur peut modifier ces réglages.</p> : null}
          {error ? <p style={styles.error}>{error}</p> : null}
        </div>
      ) : (
        <p style={styles.muted}>Impossible de charger les réglages de l'entreprise.</p>
      )}
    </div>
  );
}

function SettingRow({
  icon,
  title,
  description,
  checked,
  disabled,
  onToggle,
  note,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  note?: string;
}) {
  return (
    <div style={styles.rowHeader}>
      <div style={styles.iconMark}>{icon}</div>
      <div style={{ flex: 1 }}>
        <h2 style={styles.sectionTitle}>
          {title}{' '}
          <span style={{ ...styles.stateTag, color: checked ? colors.success : colors.danger }}>
            {checked ? 'activé' : 'désactivé'}
          </span>
        </h2>
        <p style={styles.description}>{description}</p>
        {note ? <p style={styles.note}>{note}</p> : null}
      </div>
      <label style={styles.switchWrap}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} style={styles.switchInput} />
        <span style={{ ...styles.switchTrack, backgroundColor: checked ? colors.primary : colors.border }}>
          <span style={{ ...styles.switchThumb, transform: checked ? 'translateX(18px)' : 'translateX(0px)' }} />
        </span>
      </label>
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
  divider: { height: 1, backgroundColor: colors.border, margin: `${spacing.lg}px 0` },
  stateTag: { fontSize: typography.sizes.xs, fontWeight: 600 },
  note: { fontSize: typography.sizes.xs, color: colors.warning, margin: `${spacing.xs}px 0 0` },
  status: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: spacing.md, marginBottom: 0 },
  muted: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  error: { color: colors.danger, fontSize: typography.sizes.sm, marginTop: spacing.sm },
};

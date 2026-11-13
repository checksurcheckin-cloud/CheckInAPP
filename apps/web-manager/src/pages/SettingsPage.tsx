import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, MapPin, Save, Scale, Smartphone } from 'lucide-react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import { apiClient, useAuth } from '../services/AuthService';
import { queryKeys, useCompany, useJointCommittees } from '../lib/queries';

export function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const queryClient = useQueryClient();

  const companyQuery = useCompany();
  const company = companyQuery.data ?? null;
  const isLoading = companyQuery.isPending;
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedAt, setSavedAt] = useState<number | null>(null);

  const jointCommittees = useJointCommittees().data ?? [];

  // Les modifications restent en brouillon sur la page jusqu'au clic sur
  // « Enregistrer » : un seul envoi pour tous les réglages modifiés.
  const [draft, setDraft] = useState<Draft | null>(null);
  const saved: Draft | null = company
    ? {
        jointCommittee: company.jointCommittee ?? '',
        mobileClockInEnabled: company.mobileClockInEnabled,
        gpsClockInEnabled: company.gpsClockInEnabled,
      }
    : null;
  const current = draft ?? saved;
  const changes =
    current && saved
      ? (Object.keys(current) as (keyof Draft)[]).filter((key) => current[key] !== saved[key])
      : [];
  const isDirty = changes.length > 0;

  const update = (patch: Partial<Draft>) => {
    if (!current || !isAdmin) return;
    setSavedAt(null);
    setDraft({ ...current, ...patch });
  };

  const save = async () => {
    if (!current || !isDirty || !isAdmin) return;
    setError(null);
    setIsSaving(true);
    try {
      const updated = await apiClient.updateCompanySettings({
        ...(changes.includes('jointCommittee') ? { jointCommittee: current.jointCommittee || null } : {}),
        ...(changes.includes('mobileClockInEnabled') ? { mobileClockInEnabled: current.mobileClockInEnabled } : {}),
        ...(changes.includes('gpsClockInEnabled') ? { gpsClockInEnabled: current.gpsClockInEnabled } : {}),
      });
      queryClient.setQueryData(queryKeys.company, updated);
      if (changes.includes('jointCommittee')) void queryClient.invalidateQueries({ queryKey: queryKeys.compliance });
      setDraft(null);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'enregistrement");
    } finally {
      setIsSaving(false);
    }
  };

  const cancel = () => {
    setDraft(null);
    setError(null);
  };

  // Le message « Réglages enregistrés » s'efface de lui-même.
  useEffect(() => {
    if (!savedAt) return;
    const timer = setTimeout(() => setSavedAt(null), 4000);
    return () => clearTimeout(timer);
  }, [savedAt]);

  // Quitter la page (fermeture d'onglet, rechargement) avec des modifications
  // non enregistrées : le navigateur demande confirmation.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  return (
    <div>
      <h1 style={styles.title}>Réglages</h1>

      {isLoading ? (
        <p style={styles.muted}>Chargement…</p>
      ) : company && current ? (
        <>
        <div style={{ ...styles.card, marginBottom: spacing.lg }}>
          <div style={styles.rowHeader}>
            <div style={styles.iconMark}>
              <Scale size={18} color={colors.primary} strokeWidth={2.25} />
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={styles.sectionTitle}>Commission paritaire</h2>
              <p style={styles.description}>
                Détermine les règles du droit du travail belge vérifiées lors de la création des horaires (durées
                maximales, repos, dimanche, nuit, temps partiel…). Un site peut avoir sa propre commission (page Sites),
                par exemple un service de livraison.
              </p>
              <select
                value={current.jointCommittee}
                disabled={!isAdmin || isSaving}
                onChange={(e) => update({ jointCommittee: e.target.value })}
                style={styles.select}
              >
                <option value="">Non renseignée — socle légal uniquement</option>
                {jointCommittees.map((jc) => (
                  <option key={jc.code} value={jc.code}>
                    {jc.label}
                  </option>
                ))}
              </select>
              <p style={styles.note}>
                Les contrôles sont des avertissements, jamais bloquants : le planning ne connaît ni votre règlement de
                travail ni vos dérogations. Les paramètres sectoriels sont à faire valider par votre secrétariat social.
              </p>
            </div>
          </div>
        </div>
        <div style={styles.card}>
          <SettingRow
            icon={<Smartphone size={18} color={colors.primary} strokeWidth={2.25} />}
            title="Pointage par QR sur le téléphone"
            description="Autorise par défaut les employés à afficher sur leur téléphone le QR que la tablette scanne. Si le QR et le GPS sont tous deux désactivés, l'onglet Pointage disparaît de l'app mobile et le Planning devient l'écran d'accueil : on pointe alors uniquement par PIN ou badge sur la tablette."
            checked={current.mobileClockInEnabled}
            disabled={!isAdmin || isSaving}
            onToggle={() => update({ mobileClockInEnabled: !current.mobileClockInEnabled })}
          />
          <div style={styles.divider} />
          <SettingRow
            icon={<MapPin size={18} color={colors.primary} strokeWidth={2.25} />}
            title="Pointage GPS"
            description="Autorise par défaut les employés à pointer via la géolocalisation de leur téléphone, indépendamment du QR. Désactivé, l'option GPS n'apparaît plus dans l'app mobile."
            checked={current.gpsClockInEnabled}
            disabled={!isAdmin || isSaving}
            onToggle={() => update({ gpsClockInEnabled: !current.gpsClockInEnabled })}
          />
          <p style={styles.status}>
            Ces deux réglages peuvent être surchargés individuellement pour chaque employé depuis l'écran Équipe.
          </p>
          {!isAdmin ? <p style={styles.muted}>Seul un administrateur peut modifier ces réglages.</p> : null}
        </div>

        {isAdmin ? (
          <div style={styles.saveBar}>
            <span style={styles.saveStatus}>
              {error ? (
                <span style={{ color: colors.danger }}>{error}</span>
              ) : isDirty ? (
                `${changes.length} modification${changes.length > 1 ? 's' : ''} non enregistrée${changes.length > 1 ? 's' : ''}`
              ) : savedAt ? (
                <span style={styles.savedText}>
                  <Check size={14} strokeWidth={2.5} /> Réglages enregistrés
                </span>
              ) : (
                'Aucune modification'
              )}
            </span>
            <button className="btn" style={styles.cancelButton} disabled={!isDirty || isSaving} onClick={cancel}>
              Annuler
            </button>
            <button
              className="btn btn-gradient"
              style={{ ...styles.saveButton, opacity: !isDirty || isSaving ? 0.5 : 1 }}
              disabled={!isDirty || isSaving}
              onClick={() => void save()}
            >
              <Save size={15} strokeWidth={2.25} />
              {isSaving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        ) : null}
        </>
      ) : (
        <p style={styles.muted}>Impossible de charger les réglages de l'entreprise.</p>
      )}
    </div>
  );
}

type Draft = {
  jointCommittee: string; // '' = non renseignée
  mobileClockInEnabled: boolean;
  gpsClockInEnabled: boolean;
};

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
  select: {
    marginTop: spacing.md,
    width: '100%',
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
  },
  saveBar: {
    position: 'sticky',
    bottom: 0,
    maxWidth: 640,
    marginTop: spacing.lg,
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.md}px ${spacing.lg}px`,
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    boxShadow: shadows.md,
  },
  saveStatus: { flex: 1, fontSize: typography.sizes.sm, color: colors.textSecondary },
  savedText: { display: 'inline-flex', alignItems: 'center', gap: 4, color: colors.success, fontWeight: 600 },
  cancelButton: {
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontWeight: 600,
    fontSize: typography.sizes.sm,
    cursor: 'pointer',
  },
  saveButton: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.sm}px ${spacing.lg}px`,
    borderRadius: radius.md,
    border: 'none',
    color: colors.surface,
    fontWeight: 600,
    fontSize: typography.sizes.sm,
    cursor: 'pointer',
  },
  divider: { height: 1, backgroundColor: colors.border, margin: `${spacing.lg}px 0` },
  stateTag: { fontSize: typography.sizes.xs, fontWeight: 600 },
  note: { fontSize: typography.sizes.xs, color: colors.warning, margin: `${spacing.xs}px 0 0` },
  status: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: spacing.md, marginBottom: 0 },
  muted: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  error: { color: colors.danger, fontSize: typography.sizes.sm, marginTop: spacing.sm },
};

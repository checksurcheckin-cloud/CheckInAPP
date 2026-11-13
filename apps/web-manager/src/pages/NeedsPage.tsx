import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Plus, Save, Trash2, X } from 'lucide-react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { Site, StaffingNeedLine } from '@horaires/shared-types';
import { apiClient } from '../services/AuthService';
import { queryKeys, useCompany, useSiteScope, useSiteStaffingNeeds } from '../lib/queries';
import { SiteSelect } from '../components/SiteSelect';
import { WEEKDAY_LABELS_FR, durationMinutesFromTimeRange, formatDurationLabel } from '../lib/date';

const NO_SITES: Site[] = [];
const NEW_LINE: StaffingNeedLine = { startTime: '09:00', endTime: '17:00', roleNeeded: null, count: 1 };

function sameLines(a: StaffingNeedLine[], b: StaffingNeedLine[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function weekdayOf(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() + 6) % 7;
}

function dateLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('fr-BE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Besoins journaliers en personnel (admin uniquement, décision #40) : une
// semaine type par magasin, et des exceptions à des dates précises. En mode
// « selon les besoins » (Réglages), le planning ne propose plus que ces
// créneaux.
export function NeedsPage() {
  const queryClient = useQueryClient();
  const scopeQuery = useSiteScope();
  const sites = scopeQuery.data?.sites ?? NO_SITES;
  const [siteId, setSiteId] = useState<string | null>(null);
  const company = useCompany().data;
  const needsQuery = useSiteStaffingNeeds(siteId);
  const needs = needsQuery.data;
  const [newDate, setNewDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!siteId && sites.length > 0) setSiteId(sites[0].id);
  }, [siteId, sites]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.staffingNeeds });

  const addException = async () => {
    if (!siteId || !newDate || !needs) return;
    setError(null);
    // Part de la semaine type de ce jour-là, à ajuster ensuite.
    const base = needs.weekly.find((d) => d.dayOfWeek === weekdayOf(newDate))?.needs ?? [];
    try {
      await apiClient.setDateStaffingNeeds(siteId, newDate, base);
      setNewDate('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'ajouter l'exception");
    }
  };

  const upcomingDates = useMemo(() => {
    const today = todayISO();
    return (needs?.dates ?? []).filter((d) => d.date >= today);
  }, [needs]);

  return (
    <div>
      <div style={styles.headerRow}>
        <h1 style={{ ...styles.title, marginBottom: 0 }}>Besoins</h1>
        <SiteSelect sites={sites} value={siteId} onChange={setSiteId} />
      </div>

      <p style={styles.intro}>
        Définissez, pour chaque magasin, combien de personnes il faut sur quels horaires. En mode « Selon les besoins »,
        le planning ne propose plus que ces créneaux : les managers les glissent sur les employés, sans pouvoir créer de
        shift en dehors.
      </p>
      {company && company.planningMode !== 'needs' ? (
        <p style={styles.modeNotice}>
          Le planning est actuellement en mode <strong>libre</strong> : ces besoins ne s'appliqueront qu'une fois le mode
          « Selon les besoins » choisi dans <Link to="/settings">Réglages</Link>.
        </p>
      ) : null}

      {!siteId || needsQuery.isPending ? (
        <p style={styles.muted}>Chargement…</p>
      ) : needs ? (
        <>
          <h2 style={styles.sectionTitle}>Semaine type</h2>
          <p style={styles.hint}>Se répète chaque semaine, sauf aux dates qui ont une exception.</p>
          <div style={styles.dayGrid}>
            {needs.weekly.map((day) => (
              <NeedsCard
                key={`${siteId}-${day.dayOfWeek}`}
                title={WEEKDAY_LABELS_FR[day.dayOfWeek]}
                lines={day.needs}
                onSave={async (lines) => {
                  await apiClient.setWeeklyStaffingNeeds(siteId, day.dayOfWeek, lines);
                  await refresh();
                }}
              />
            ))}
          </div>

          <h2 style={{ ...styles.sectionTitle, marginTop: spacing.xl }}>Exceptions</h2>
          <p style={styles.hint}>
            Une date précise (jour férié, événement, inventaire…) qui remplace la semaine type. Sans aucun besoin, le
            magasin est considéré comme fermé ce jour-là.
          </p>
          <div style={styles.addException}>
            <input
              type="date"
              style={styles.input}
              value={newDate}
              min={todayISO()}
              onChange={(e) => setNewDate(e.target.value)}
            />
            <button
              className="btn"
              style={styles.secondaryButton}
              disabled={!newDate || upcomingDates.some((d) => d.date === newDate)}
              onClick={() => void addException()}
            >
              <CalendarPlus size={15} strokeWidth={2.25} />
              Ajouter une exception
            </button>
            {error ? <span style={styles.error}>{error}</span> : null}
          </div>
          {upcomingDates.length === 0 ? (
            <p style={styles.muted}>Aucune exception à venir.</p>
          ) : (
            <div style={styles.dayGrid}>
              {upcomingDates.map((d) => (
                <NeedsCard
                  key={`${siteId}-${d.date}`}
                  title={dateLabel(d.date)}
                  lines={d.needs}
                  emptyLabel="Fermé — aucun besoin ce jour-là"
                  onSave={async (lines) => {
                    await apiClient.setDateStaffingNeeds(siteId, d.date, lines);
                    await refresh();
                  }}
                  onRemove={async () => {
                    await apiClient.clearDateStaffingNeeds(siteId, d.date);
                    await refresh();
                  }}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <p style={styles.muted}>Impossible de charger les besoins de ce magasin.</p>
      )}
    </div>
  );
}

// Liste des besoins d'un jour, modifiée en brouillon puis enregistrée d'un
// coup (comme Réglages).
function NeedsCard({
  title,
  lines,
  emptyLabel = 'Aucun besoin',
  onSave,
  onRemove,
}: {
  title: string;
  lines: StaffingNeedLine[];
  emptyLabel?: string;
  onSave: (lines: StaffingNeedLine[]) => Promise<void>;
  // Exception : la retirer remet la date sur la semaine type.
  onRemove?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<StaffingNeedLine[]>(lines);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rechargé (enregistrement ici ou par un autre admin) : repart des données
  // à jour.
  useEffect(() => setDraft(lines), [lines]);

  const dirty = !sameLines(draft, lines);
  const people = draft.reduce((sum, l) => sum + l.count, 0);
  const hours = draft.reduce((sum, l) => sum + l.count * durationMinutesFromTimeRange(l.startTime, l.endTime), 0);

  const patch = (index: number, change: Partial<StaffingNeedLine>) =>
    setDraft((current) => current.map((l, i) => (i === index ? { ...l, ...change } : l)));

  const save = async () => {
    setError(null);
    if (draft.some((l) => l.startTime === l.endTime)) {
      setError('Le début et la fin d’un besoin ne peuvent pas être identiques.');
      return;
    }
    setIsSaving(true);
    try {
      await onSave(draft.map((l) => ({ ...l, roleNeeded: l.roleNeeded?.trim() || null })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'enregistrement");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <h3 style={styles.cardTitle}>{title}</h3>
        <span style={styles.summary}>
          {people > 0 ? `${people} pers. · ${formatDurationLabel(hours)}` : ''}
        </span>
        {onRemove ? (
          <button
            className="btn btn-icon"
            style={styles.iconButton}
            title="Retirer l'exception (revient à la semaine type)"
            onClick={() => void onRemove()}
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>

      {draft.length === 0 ? <p style={styles.empty}>{emptyLabel}</p> : null}
      {draft.map((line, i) => (
        <div key={i} style={styles.line}>
          <input
            type="number"
            min={1}
            max={50}
            style={{ ...styles.input, width: 52 }}
            value={line.count}
            onChange={(e) => patch(i, { count: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })}
            aria-label="Nombre de personnes"
          />
          <span style={styles.times}>×</span>
          <input
            type="time"
            style={styles.input}
            value={line.startTime}
            onChange={(e) => patch(i, { startTime: e.target.value })}
            aria-label="Début"
          />
          <span style={styles.times}>–</span>
          <input
            type="time"
            style={styles.input}
            value={line.endTime}
            onChange={(e) => patch(i, { endTime: e.target.value })}
            aria-label="Fin"
          />
          <input
            style={{ ...styles.input, flex: 1, minWidth: 80 }}
            placeholder="Rôle (optionnel)"
            value={line.roleNeeded ?? ''}
            onChange={(e) => patch(i, { roleNeeded: e.target.value })}
          />
          <button
            className="btn btn-icon"
            style={styles.iconButton}
            title="Retirer ce besoin"
            onClick={() => setDraft((current) => current.filter((_, j) => j !== i))}
          >
            <X size={14} />
          </button>
        </div>
      ))}

      <div style={styles.cardActions}>
        <button className="btn" style={styles.linkButton} onClick={() => setDraft((c) => [...c, { ...NEW_LINE }])}>
          <Plus size={14} strokeWidth={2.5} />
          Ajouter un besoin
        </button>
        <div style={{ flex: 1 }} />
        {dirty ? (
          <>
            <button className="btn" style={styles.linkButton} onClick={() => setDraft(lines)} disabled={isSaving}>
              Annuler
            </button>
            <button className="btn btn-gradient" style={styles.saveButton} onClick={() => void save()} disabled={isSaving}>
              <Save size={13} strokeWidth={2.25} />
              {isSaving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </>
        ) : null}
      </div>
      {error ? <p style={styles.error}>{error}</p> : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  title: { fontSize: typography.sizes['2xl'], fontWeight: 700, color: colors.textPrimary },
  intro: { fontSize: typography.sizes.sm, color: colors.textSecondary, maxWidth: 760, lineHeight: 1.5, marginTop: 0 },
  modeNotice: {
    fontSize: typography.sizes.sm,
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.md,
    backgroundColor: colors.warningTint,
    color: colors.textPrimary,
    maxWidth: 760,
  },
  sectionTitle: { fontSize: typography.sizes.lg, fontWeight: 700, color: colors.textPrimary, margin: `${spacing.lg}px 0 2px` },
  hint: { fontSize: typography.sizes.sm, color: colors.textSecondary, margin: `0 0 ${spacing.md}px` },
  muted: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  dayGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    padding: spacing.md,
    boxShadow: shadows.sm,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  cardHeader: { display: 'flex', alignItems: 'center', gap: spacing.sm },
  cardTitle: {
    margin: 0,
    flex: 1,
    fontSize: typography.sizes.md,
    fontWeight: 700,
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
  summary: { fontSize: typography.sizes.xs, color: colors.textSecondary },
  empty: { margin: 0, fontSize: typography.sizes.sm, color: colors.textSecondary, fontStyle: 'italic' },
  line: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  times: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  input: {
    padding: `6px ${spacing.sm}px`,
    borderRadius: radius.sm,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
  },
  iconButton: { border: 'none', background: 'transparent', color: colors.textSecondary, cursor: 'pointer', padding: 4 },
  cardActions: { display: 'flex', alignItems: 'center', gap: spacing.sm },
  linkButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    border: 'none',
    background: 'transparent',
    color: colors.primary,
    fontWeight: 600,
    fontSize: typography.sizes.sm,
    cursor: 'pointer',
    padding: 0,
  },
  saveButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: `6px ${spacing.md}px`,
    borderRadius: radius.md,
    border: 'none',
    color: colors.surface,
    fontWeight: 600,
    fontSize: typography.sizes.sm,
    cursor: 'pointer',
  },
  addException: { display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
  secondaryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontWeight: 600,
    fontSize: typography.sizes.sm,
    cursor: 'pointer',
  },
  error: { color: colors.danger, fontSize: typography.sizes.sm, margin: 0 },
};

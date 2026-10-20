import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { PresenceStatus, PresentEmployee, Site, TimeEntrySource } from '@horaires/shared-types';
import { apiClient, useAuth } from '../services/AuthService';
import { SiteSelect } from '../components/SiteSelect';
import { PresenceDetailDialog } from '../components/PresenceDetailDialog';
import { computeDayTotals, formatClockTime, formatDuration, formatElapsed, lastDeparture } from '../lib/presence';

const STATUS_STYLES: Record<PresenceStatus, { label: string; dot: string; live: boolean }> = {
  present: { label: 'En poste', dot: colors.success, live: true },
  on_break: { label: 'En pause', dot: colors.warning, live: true },
  left: { label: 'Parti', dot: colors.border, live: false },
};

// Présents d'abord, puis en pause, puis repartis — arrivée la plus ancienne
// en premier dans chaque groupe.
const STATUS_ORDER: Record<PresenceStatus, number> = { present: 0, on_break: 1, left: 2 };

// Libellés courts affichés sur la carte présence pour chaque mode de pointage.
const SOURCE_LABELS: Record<TimeEntrySource, string> = {
  qr_scan_own_phone: 'QR',
  badge_scan: 'Badge',
  pin_code: 'PIN',
  gps: 'GPS',
  manual_by_manager: 'Saisie manuelle',
};

// Seuils de distance (mètres) au-delà desquels le pointage GPS devient
// suspect — purement indicatif pour le manager, ne bloque rien côté serveur.
const DISTANCE_WARN_METERS = 100;
const DISTANCE_ALERT_METERS = 400;

function distanceColor(distance: number): string {
  if (distance <= DISTANCE_WARN_METERS) return colors.success;
  if (distance <= DISTANCE_ALERT_METERS) return colors.warning;
  return colors.danger;
}

// `resolvedAddress` vient du géocodage inverse (voir loadAddresses) —
// affiché à la place des coordonnées brutes quand le site n'a pas de
// coordonnées enregistrées (donc pas de distance calculable).
function sourceBadge(employee: PresentEmployee, resolvedAddress?: string): { text: string; color: string } {
  const label = SOURCE_LABELS[employee.source] ?? employee.source;
  if (employee.source !== 'gps') {
    return { text: label, color: colors.textSecondary };
  }
  if (employee.distanceFromSiteMeters != null) {
    return { text: `${label} — à ${employee.distanceFromSiteMeters}m du site`, color: distanceColor(employee.distanceFromSiteMeters) };
  }
  if (employee.geoLat != null && employee.geoLng != null) {
    const location = resolvedAddress ?? `${employee.geoLat.toFixed(4)}, ${employee.geoLng.toFixed(4)}`;
    return { text: `${label} — ${location}`, color: colors.textSecondary };
  }
  return { text: label, color: colors.textSecondary };
}

export function PresenceLivePage() {
  const { socket } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [present, setPresent] = useState<PresentEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Adresses résolues par géocodage inverse, indexées par "lat,lng" arrondi —
  // évite de re-résoudre la même position à chaque rafraîchissement (30s).
  const [addressLabels, setAddressLabels] = useState<Record<string, string>>({});
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  // Horloge partagée par tous les chronos de la page (une seule minuterie).
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const sortedEmployees = useMemo(
    () =>
      [...present].sort(
        (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.since.localeCompare(b.since),
      ),
    [present],
  );
  // Relu dans `present` à chaque rafraîchissement : la modale ouverte suit
  // les nouveaux pointages en direct (websocket / polling).
  const selectedEmployee = present.find((e) => e.id === selectedEmployeeId) ?? null;
  const closeDetail = useCallback(() => setSelectedEmployeeId(null), []);
  const onSiteDuty = present.filter((e) => e.status !== 'left').length;

  useEffect(() => {
    apiClient.getSites().then((list) => {
      setSites(list);
      setSelectedSiteId((current) => current ?? list[0]?.id ?? null);
    });
  }, []);

  // `silent` : rafraîchissements automatiques (polling, websocket) — on garde
  // les cartes et la modale affichées au lieu de repasser par « Chargement… ».
  const loadPresence = useCallback(async (siteId: string, { silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setIsLoading(true);
    try {
      const list = await apiClient.getPresence(siteId);
      // Un backend pas encore redéployé renvoie l'ancien format (présents
      // seulement, sans status/entries) — on complète plutôt que de planter.
      setPresent(
        list.map((e) => ({
          ...e,
          status: e.status ?? 'present',
          breakSince: e.breakSince ?? null,
          entries: e.entries ?? [{ type: 'clock_in', timestamp: e.since, source: e.source }],
        })),
      );
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setSelectedEmployeeId(null);
    if (selectedSiteId) void loadPresence(selectedSiteId);
  }, [selectedSiteId, loadPresence]);

  // Rafraîchit automatiquement — vue "en direct" pensée pour rester ouverte.
  // Le polling 30s reste en filet de sécurité (socket déconnecté, backend
  // sans websocket) ; le websocket sert juste à rafraîchir plus vite.
  useEffect(() => {
    if (!selectedSiteId) return;
    const interval = setInterval(() => loadPresence(selectedSiteId, { silent: true }), 30_000);
    return () => clearInterval(interval);
  }, [selectedSiteId, loadPresence]);

  useEffect(() => {
    if (!socket || !selectedSiteId) return;
    const onTimeEntriesChanged = () => void loadPresence(selectedSiteId, { silent: true });
    socket.on('time-entries:changed', onTimeEntriesChanged);
    return () => {
      socket.off('time-entries:changed', onTimeEntriesChanged);
    };
  }, [socket, selectedSiteId, loadPresence]);

  // Résout en adresse lisible les pointages GPS pour lesquels aucune distance
  // n'a pu être calculée (site sans coordonnées) — échec silencieux : en cas
  // de souci réseau/service, l'affichage retombe simplement sur les coordonnées.
  useEffect(() => {
    const toResolve = present.filter(
      (e) => e.source === 'gps' && e.distanceFromSiteMeters == null && e.geoLat != null && e.geoLng != null,
    );
    for (const employee of toResolve) {
      const key = `${employee.geoLat!.toFixed(4)},${employee.geoLng!.toFixed(4)}`;
      if (key in addressLabels) continue;
      apiClient
        .geocodeReverse(employee.geoLat!, employee.geoLng!)
        .then(({ label }) => {
          if (label) setAddressLabels((prev) => ({ ...prev, [key]: label }));
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present]);

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Présence en direct</h1>
        <SiteSelect sites={sites} value={selectedSiteId} onChange={setSelectedSiteId} />
      </div>

      {isLoading ? (
        <p style={styles.muted}>Chargement…</p>
      ) : present.length === 0 ? (
        <p style={styles.muted}>Personne n'a pointé aujourd'hui sur ce site.</p>
      ) : (
        <>
          <p style={styles.summary}>
            {onSiteDuty} en poste · {present.length} pointé{present.length > 1 ? 's' : ''} aujourd'hui
          </p>
          <div style={styles.grid}>
            {sortedEmployees.map((employee) => {
              const addressKey =
                employee.geoLat != null && employee.geoLng != null
                  ? `${employee.geoLat.toFixed(4)},${employee.geoLng.toFixed(4)}`
                  : null;
              const badge = sourceBadge(employee, addressKey ? addressLabels[addressKey] : undefined);
              const status = STATUS_STYLES[employee.status];
              const departure = lastDeparture(employee);
              const isLeft = employee.status === 'left';
              return (
                <button
                  key={employee.id}
                  type="button"
                  className="card-hover"
                  style={{ ...styles.card, ...(isLeft ? styles.cardLeft : null) }}
                  onClick={() => setSelectedEmployeeId(employee.id)}
                >
                  <span
                    style={{ ...styles.dot, backgroundColor: status.dot }}
                    className={status.live ? 'live-dot' : undefined}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={styles.name}>
                      {employee.firstName} {employee.lastName}
                    </span>
                    <span style={{ ...styles.badge, color: badge.color }}>{badge.text}</span>
                    {isLeft ? (
                      <>
                        <span style={styles.timerLabel}>
                          {status.label}
                          {departure ? ` à ${formatClockTime(departure)}` : ''}
                        </span>
                        <span style={{ ...styles.timer, color: colors.textSecondary }}>
                          {formatDuration(computeDayTotals(employee.entries, now).workedMs)} travaillées
                        </span>
                      </>
                    ) : (
                      <>
                        <span style={styles.timerLabel}>
                          {employee.status === 'on_break' && employee.breakSince
                            ? `En pause depuis ${formatClockTime(employee.breakSince)}`
                            : `Arrivé à ${formatClockTime(employee.since)}`}
                        </span>
                        <span style={styles.timer}>
                          {formatElapsed(now - new Date(employee.since).getTime())}
                        </span>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <PresenceDetailDialog
        employee={selectedEmployee}
        now={now}
        sourceLabels={SOURCE_LABELS}
        onClose={closeDetail}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: { fontSize: typography.sizes['2xl'], fontWeight: 700, color: colors.textPrimary, margin: 0 },
  muted: { color: colors.textSecondary },
  summary: { color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: 0, marginBottom: spacing.md },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: spacing.md },
  card: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    border: `1px solid ${colors.border}`,
    boxShadow: shadows.sm,
    font: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    width: '100%',
  },
  cardLeft: { backgroundColor: colors.background, boxShadow: 'none' },
  dot: { width: 10, height: 10, marginTop: 4, borderRadius: radius.full, backgroundColor: colors.success, display: 'inline-block', flexShrink: 0 },
  name: { display: 'block', fontWeight: 600, color: colors.textPrimary },
  badge: { display: 'block', fontSize: typography.sizes.xs, fontWeight: 600, marginTop: 2 },
  timerLabel: { display: 'block', fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: spacing.sm },
  timer: {
    display: 'block',
    fontSize: typography.sizes.lg,
    fontWeight: 700,
    color: colors.textPrimary,
    fontVariantNumeric: 'tabular-nums',
  },
};

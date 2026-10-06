import React, { useCallback, useEffect, useState } from 'react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { PresentEmployee, Site, TimeEntrySource } from '@horaires/shared-types';
import { apiClient, useAuth } from '../services/AuthService';
import { SiteSelect } from '../components/SiteSelect';

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

  useEffect(() => {
    apiClient.getSites().then((list) => {
      setSites(list);
      setSelectedSiteId((current) => current ?? list[0]?.id ?? null);
    });
  }, []);

  const loadPresence = useCallback(async (siteId: string) => {
    setIsLoading(true);
    try {
      const list = await apiClient.getPresence(siteId);
      setPresent(list);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSiteId) void loadPresence(selectedSiteId);
  }, [selectedSiteId, loadPresence]);

  // Rafraîchit automatiquement — vue "en direct" pensée pour rester ouverte.
  // Le polling 30s reste en filet de sécurité (socket déconnecté, backend
  // sans websocket) ; le websocket sert juste à rafraîchir plus vite.
  useEffect(() => {
    if (!selectedSiteId) return;
    const interval = setInterval(() => loadPresence(selectedSiteId), 30_000);
    return () => clearInterval(interval);
  }, [selectedSiteId, loadPresence]);

  useEffect(() => {
    if (!socket || !selectedSiteId) return;
    const onTimeEntriesChanged = () => void loadPresence(selectedSiteId);
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
        <p style={styles.muted}>Personne n'est actuellement en poste sur ce site.</p>
      ) : (
        <div style={styles.grid}>
          {present.map((employee) => {
            const addressKey =
              employee.geoLat != null && employee.geoLng != null
                ? `${employee.geoLat.toFixed(4)},${employee.geoLng.toFixed(4)}`
                : null;
            const badge = sourceBadge(employee, addressKey ? addressLabels[addressKey] : undefined);
            return (
              <div key={employee.id} className="card-hover" style={styles.card}>
                <span style={styles.dot} className="live-dot" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={styles.name}>
                    {employee.firstName} {employee.lastName}
                  </span>
                  <span style={{ ...styles.badge, color: badge.color }}>{badge.text}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
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
  },
  dot: { width: 10, height: 10, marginTop: 4, borderRadius: radius.full, backgroundColor: colors.success, display: 'inline-block', flexShrink: 0 },
  name: { display: 'block', fontWeight: 600, color: colors.textPrimary },
  badge: { display: 'block', fontSize: typography.sizes.xs, fontWeight: 600, marginTop: 2 },
};

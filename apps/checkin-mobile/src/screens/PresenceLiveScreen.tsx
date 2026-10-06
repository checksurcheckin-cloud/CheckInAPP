import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@horaires/ui-tokens';
import type { PresentEmployee, Site, TimeEntrySource } from '@horaires/shared-types';
import { apiClient, useAuth } from '../services/AuthService';
import { fonts } from '../theme';

// Libellés courts affichés sous le nom pour chaque mode de pointage.
const SOURCE_LABELS: Record<TimeEntrySource, string> = {
  qr_scan_own_phone: 'QR',
  badge_scan: 'Badge',
  pin_code: 'PIN',
  gps: 'GPS',
  manual_by_manager: 'Saisie manuelle',
};

// Seuils de distance (mètres) — purement indicatifs pour le manager.
const DISTANCE_WARN_METERS = 100;
const DISTANCE_ALERT_METERS = 400;

function distanceColor(distance: number): string {
  if (distance <= DISTANCE_WARN_METERS) return colors.success;
  if (distance <= DISTANCE_ALERT_METERS) return colors.warning;
  return colors.danger;
}

// `resolvedAddress` vient du géocodage inverse (voir loadAddresses ci-dessous)
// — affiché à la place des coordonnées brutes quand le site n'a pas de
// coordonnées enregistrées (donc pas de distance calculable).
function sourceBadge(employee: PresentEmployee, resolvedAddress?: string): { text: string; color: string } {
  const label = SOURCE_LABELS[employee.source] ?? employee.source;
  if (employee.source !== 'gps') {
    return { text: label, color: colors.textSecondary };
  }
  if (employee.distanceFromSiteMeters != null) {
    return {
      text: `${label} — à ${employee.distanceFromSiteMeters}m du site`,
      color: distanceColor(employee.distanceFromSiteMeters),
    };
  }
  if (employee.geoLat != null && employee.geoLng != null) {
    const location = resolvedAddress ?? `${employee.geoLat.toFixed(4)}, ${employee.geoLng.toFixed(4)}`;
    return { text: `${label} — ${location}`, color: colors.textSecondary };
  }
  return { text: label, color: colors.textSecondary };
}

function addressKeyFor(employee: PresentEmployee): string | null {
  return employee.geoLat != null && employee.geoLng != null
    ? `${employee.geoLat.toFixed(4)},${employee.geoLng.toFixed(4)}`
    : null;
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

function sinceLabel(since: string) {
  return new Date(since).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
}

// Calculée à chaque affichage/rafraîchissement (pas de minuteur live) — le
// pull-to-refresh existant suffit, pas besoin d'un chrono qui tourne.
function durationLabel(since: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
}

export function PresenceLiveScreen() {
  const { user, socket } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [present, setPresent] = useState<PresentEmployee[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Adresses résolues par géocodage inverse, indexées par "lat,lng" arrondi.
  const [addressLabels, setAddressLabels] = useState<Record<string, string>>({});

  const loadSites = useCallback(async () => {
    const siteList = await apiClient.getSites();
    setSites(siteList);
    setSelectedSiteId((current) => current ?? siteList[0]?.id ?? null);
  }, []);

  const loadPresence = useCallback(async (siteId: string) => {
    const list = await apiClient.getPresence(siteId);
    setPresent(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSites();
    }, [loadSites]),
  );

  useFocusEffect(
    useCallback(() => {
      if (selectedSiteId) void loadPresence(selectedSiteId);
    }, [selectedSiteId, loadPresence]),
  );

  // Cet écran n'avait pas de polling (contrairement à sa contrepartie web) —
  // il ne se rafraîchissait qu'au focus. Le websocket le fait vivre en
  // continu tant qu'il reste ouvert.
  useEffect(() => {
    if (!socket || !selectedSiteId) return;
    const onTimeEntriesChanged = () => void loadPresence(selectedSiteId);
    socket.on('time-entries:changed', onTimeEntriesChanged);
    return () => {
      socket.off('time-entries:changed', onTimeEntriesChanged);
    };
  }, [socket, selectedSiteId, loadPresence]);

  // Résout en adresse lisible les pointages GPS pour lesquels aucune distance
  // n'a pu être calculée (site sans coordonnées) — échec silencieux, retombe
  // sur les coordonnées brutes déjà affichées par défaut.
  useEffect(() => {
    const toResolve = present.filter((e) => e.source === 'gps' && e.distanceFromSiteMeters == null && addressKeyFor(e));
    for (const employee of toResolve) {
      const key = addressKeyFor(employee)!;
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

  const refresh = async () => {
    if (!selectedSiteId) return;
    setIsRefreshing(true);
    await loadPresence(selectedSiteId).catch(() => {});
    setIsRefreshing(false);
  };

  const selectedSite = sites.find((s) => s.id === selectedSiteId);
  const cycleSite = () => {
    if (sites.length < 2) return;
    const i = sites.findIndex((s) => s.id === selectedSiteId);
    setSelectedSiteId(sites[(i + 1) % sites.length].id);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>Présence</Text>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>EN DIRECT</Text>
          </View>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {`${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase()}
          </Text>
        </View>
      </View>

      {selectedSite ? (
        <Pressable style={styles.sitePill} onPress={cycleSite} disabled={sites.length < 2}>
          <Ionicons name="location-outline" size={13} color={colors.textPrimary} />
          <Text style={styles.sitePillText}>{selectedSite.name}</Text>
          {sites.length > 1 ? <Ionicons name="chevron-down" size={13} color={colors.textPrimary} /> : null}
        </Pressable>
      ) : null}

      <Text style={styles.count}>
        {present.length} employé{present.length > 1 ? 's' : ''} présent{present.length > 1 ? 's' : ''}
      </Text>

      {present.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripContent}>
          {present.map((p) => (
            <View key={p.id} style={styles.stripAvatar}>
              <Text style={styles.stripAvatarText}>{initials(p.firstName, p.lastName)}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <FlatList
        data={present}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        ListEmptyComponent={<Text style={styles.empty}>Personne n'est actuellement en poste sur ce site.</Text>}
        renderItem={({ item }) => {
          const key = addressKeyFor(item);
          const badge = sourceBadge(item, key ? addressLabels[key] : undefined);
          return (
            <View style={styles.card}>
              <View style={styles.cardAvatar}>
                <Text style={styles.cardAvatarText}>{initials(item.firstName, item.lastName)}</Text>
              </View>
              <View style={styles.nameGroup}>
                <Text style={styles.name}>
                  {item.firstName} {item.lastName}
                </Text>
                <Text style={styles.since}>Depuis {sinceLabel(item.since)}</Text>
                <Text style={[styles.sourceBadge, { color: badge.color }]}>{badge.text}</Text>
              </View>
              <View style={styles.durationGroup}>
                <Text style={styles.durationValue}>{durationLabel(item.since)}</Text>
                <Text style={styles.durationLabel}>en service</Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 28, paddingHorizontal: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.textPrimary, letterSpacing: -0.2 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.successTint,
    paddingVertical: 5,
    paddingLeft: 8,
    paddingRight: 10,
    borderRadius: 999,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  liveText: { fontSize: 11, fontWeight: '700', color: colors.textPrimary },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  avatarText: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.primary },

  sitePill: {
    marginTop: 16,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  sitePillText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },

  count: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginTop: 22 },
  stripContent: { gap: 10, paddingVertical: 12 },
  stripAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.success,
  },
  stripAvatarText: { fontFamily: fonts.displaySemiBold, fontSize: 15, color: colors.primary },

  listContent: { paddingTop: 26, paddingBottom: 110, gap: 10 },
  empty: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: 16,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAvatarText: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.primary },
  nameGroup: { flex: 1 },
  name: { fontSize: typography.sizes.md, color: colors.textPrimary, fontWeight: '700' },
  since: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  sourceBadge: { fontSize: 11, fontWeight: '700', marginTop: 3 },
  durationGroup: { alignItems: 'flex-end' },
  durationValue: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.success },
  durationLabel: { fontSize: 10.5, color: colors.textSecondary },
});

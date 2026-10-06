import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import { fonts } from '../theme';
import type { Site, TimeEntry, TimeEntryType } from '@horaires/shared-types';
import { apiClient, useAuth } from '../services/AuthService';
import { SitePicker } from '../components/SitePicker';
import { ConfirmationBanner } from '../components/ConfirmationBanner';
import { PersonalQrCode } from '../components/PersonalQrCode';
import { PinFallbackNotice } from '../components/PinFallbackNotice';
import { withPressedFeedback } from '../lib/pressedStyle';

const ACTIONS: { type: TimeEntryType; label: string }[] = [
  { type: 'clock_in', label: 'Arrivée' },
  { type: 'break_start', label: 'Début pause' },
  { type: 'break_end', label: 'Fin pause' },
  { type: 'clock_out', label: 'Départ' },
];

const TYPE_LABELS: Record<TimeEntryType, string> = {
  clock_in: 'Arrivée',
  clock_out: 'Départ',
  break_start: 'Début de pause',
  break_end: 'Fin de pause',
};

function initials(firstName?: string, lastName?: string) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
}

export function ClockInScreen() {
  const { user } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [lastEntry, setLastEntry] = useState<TimeEntry | null>(null);
  const [selectedType, setSelectedType] = useState<TimeEntryType | null>(null);
  const [showOtherMethods, setShowOtherMethods] = useState(false);
  const [showPinFallback, setShowPinFallback] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [siteList, entries] = await Promise.all([
        apiClient.getSites(),
        apiClient.getMyTimeEntries(),
      ]);
      setSites(siteList);
      setSelectedSiteId((current) => current ?? siteList[0]?.id ?? null);
      setLastEntry(entries[0] ?? null);
    } catch {
      // Silencieux — l'écran reste utilisable, juste sans statut affiché.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const submit = async () => {
    if (!selectedType || !selectedSiteId) return;
    setIsSubmitting(true);
    setBanner(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Autorisation de localisation refusée');
      }
      const position = await Location.getCurrentPositionAsync({});
      const entry: TimeEntry = await apiClient.clockInWithGps(
        selectedSiteId,
        selectedType,
        position.coords.latitude,
        position.coords.longitude,
      );
      setBanner({ kind: 'success', message: `${TYPE_LABELS[entry.type]} enregistrée` });
      setLastEntry(entry);
      setSelectedType(null);
    } catch (err) {
      setBanner({ kind: 'error', message: err instanceof Error ? err.message : 'Échec du pointage' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onDuty = lastEntry?.type === 'clock_in';
  const statusTime = lastEntry
    ? new Date(lastEntry.timestamp).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <View style={styles.brand}>
          <View style={styles.brandMark}>
            <Ionicons name="checkmark" size={18} color={colors.surface} />
          </View>
          <Text style={styles.brandName}>Check In</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(user?.firstName, user?.lastName)}</Text>
        </View>
      </View>

      <Text style={styles.greeting}>Bonjour, {user?.firstName ?? ''}</Text>

      {statusTime ? (
        <View style={[styles.statusPill, onDuty ? styles.statusPillOn : styles.statusPillOff]}>
          <View style={[styles.statusDot, { backgroundColor: onDuty ? colors.success : colors.textSecondary }]} />
          <Text style={styles.statusText}>
            {onDuty ? `En service depuis ${statusTime}` : `Hors service depuis ${statusTime}`}
          </Text>
        </View>
      ) : null}

      <View style={styles.hero}>
        <PersonalQrCode />
      </View>

      <Text style={styles.caption}>Présentez ce code à la tablette du site</Text>

      {showPinFallback ? (
        <View style={styles.pinNoticeWrap}>
          <PinFallbackNotice onClose={() => setShowPinFallback(false)} />
        </View>
      ) : (
        <Pressable onPress={() => setShowPinFallback(true)} style={withPressedFeedback(styles.fallbackLink)}>
          <Ionicons name="wifi-outline" size={14} color={colors.primary} />
          <Text style={styles.fallbackLinkText}>Pas de réseau ? Voir les alternatives</Text>
        </Pressable>
      )}

      {banner ? <ConfirmationBanner kind={banner.kind} message={banner.message} /> : null}

      <Pressable onPress={() => setShowOtherMethods((v) => !v)} style={styles.otherMethodsToggle}>
        <Text style={styles.otherMethodsText}>Autres méthodes de pointage</Text>
        <Ionicons name={showOtherMethods ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textSecondary} />
      </Pressable>

      {showOtherMethods ? (
        <View style={styles.otherMethodsPanel}>
          {lastEntry ? (
            <Text style={styles.status}>
              Dernier pointage : {TYPE_LABELS[lastEntry.type]} à {statusTime}
            </Text>
          ) : null}

          <SitePicker sites={sites} selectedSiteId={selectedSiteId} onSelect={setSelectedSiteId} />

          <View style={styles.actions}>
            {ACTIONS.map((action) => (
              <Pressable
                key={action.type}
                style={withPressedFeedback(
                  styles.actionButton,
                  selectedType === action.type && styles.actionButtonSelected,
                )}
                onPress={() => setSelectedType(action.type)}
              >
                <Text style={[styles.actionText, selectedType === action.type && styles.actionTextSelected]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {selectedType ? (
            <Pressable
              style={withPressedFeedback(styles.gpsButton, isSubmitting && styles.gpsButtonDisabled)}
              disabled={isSubmitting}
              onPress={() => submit()}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.gpsButtonText}>Confirmer via GPS</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.navSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: 28, paddingHorizontal: 24, paddingBottom: spacing.xl },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { fontFamily: fonts.display, fontSize: typography.sizes.md, color: colors.textPrimary },
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

  greeting: { fontFamily: fonts.display, fontSize: 23, color: colors.textPrimary, marginTop: 22, letterSpacing: -0.2 },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingTop: 7,
    paddingBottom: 7,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: radius.full,
  },
  statusPillOn: { backgroundColor: colors.successTint },
  statusPillOff: { backgroundColor: colors.border },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },

  hero: { alignItems: 'center', marginTop: 40 },
  caption: { textAlign: 'center', fontSize: 14, color: colors.textSecondary, marginTop: 22 },

  pinNoticeWrap: { marginTop: spacing.md },
  fallbackLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  fallbackLinkText: { fontSize: 13, fontWeight: '600', color: colors.primary },

  otherMethodsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: spacing.xl,
    paddingVertical: spacing.sm,
  },
  otherMethodsText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  otherMethodsPanel: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    ...nativeShadow.sm,
  },
  status: { fontSize: typography.sizes.sm, color: colors.textSecondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionButton: {
    flexBasis: '47%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  actionButtonSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionText: { color: colors.textPrimary, fontWeight: '600' },
  actionTextSelected: { color: colors.surface },
  gpsButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  gpsButtonDisabled: { opacity: 0.5 },
  gpsButtonText: { color: colors.surface, fontWeight: '600', fontSize: typography.sizes.md },

  navSpacer: { height: 90 },
});

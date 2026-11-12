import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, nativeShadow, radius, spacing, typography } from '@horaires/ui-tokens';
import type { TimeEntrySource, TimeEntryType } from '@horaires/shared-types';
import { useMyTimeEntries } from '../lib/queries';
import { buildHistory, formatWorked } from '../lib/timeEntryHistory';
import { fonts } from '../theme';

const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

const TYPE_STYLES: Record<TimeEntryType, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  clock_in: { label: 'Arrivée', icon: 'log-in-outline', color: colors.success },
  break_start: { label: 'Pause', icon: 'cafe-outline', color: colors.warning },
  break_end: { label: 'Reprise', icon: 'play-outline', color: colors.primary },
  clock_out: { label: 'Départ', icon: 'log-out-outline', color: colors.textSecondary },
};

const SOURCE_LABELS: Record<TimeEntrySource, string> = {
  qr_scan_own_phone: 'QR',
  badge_scan: 'Badge',
  pin_code: 'PIN',
  gps: 'GPS',
  manual_by_manager: 'Manager',
};

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
}

// Historique de ses pointages, mois par mois (Profil de checkin-mobile) —
// l'employé consulte lui-même ses données de pointage (exigence
// « accessible » de la conformité belge). Lecture seule : une correction
// passe par le manager (pointage manuel, motif obligatoire).
export function TimeEntryHistory({ userId }: { userId: string | undefined }) {
  const currentMonth = useMemo(() => startOfMonth(new Date()), []);
  const [month, setMonth] = useState(currentMonth);
  const query = useMyTimeEntries(userId, month);
  const days = useMemo(() => buildHistory(query.data ?? []), [query.data]);
  const totalMs = days.reduce((sum, d) => sum + d.workedMs, 0);
  const isCurrentMonth = month.getTime() === currentMonth.getTime();

  const goToMonth = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Mes pointages</Text>
        <View style={styles.monthNav}>
          <Pressable style={styles.arrow} onPress={() => goToMonth(-1)} accessibilityLabel="Mois précédent" hitSlop={6}>
            <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
          </Pressable>
          <Text style={styles.monthLabel}>
            {MONTHS[month.getMonth()]} {month.getFullYear()}
          </Text>
          <Pressable
            style={[styles.arrow, isCurrentMonth && styles.arrowDisabled]}
            onPress={() => goToMonth(1)}
            disabled={isCurrentMonth}
            accessibilityLabel="Mois suivant"
            hitSlop={6}
          >
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {query.data === undefined ? (
        query.isError ? (
          <Text style={styles.empty}>Impossible de charger vos pointages.</Text>
        ) : (
          <ActivityIndicator style={styles.loader} color={colors.primary} />
        )
      ) : days.length === 0 ? (
        <Text style={styles.empty}>Aucun pointage ce mois-ci.</Text>
      ) : (
        <>
          <View style={styles.summary}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{formatWorked(totalMs)}</Text>
              <Text style={styles.summaryLabel}>travaillées</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{days.length}</Text>
              <Text style={styles.summaryLabel}>jour{days.length > 1 ? 's' : ''} pointé{days.length > 1 ? 's' : ''}</Text>
            </View>
          </View>

          {days.map((day) => (
            <View key={day.key} style={styles.day}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayLabel}>
                  {day.date.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })}
                </Text>
                {day.ongoing ? (
                  <Text style={[styles.dayFlag, { color: colors.success }]}>En cours</Text>
                ) : day.missingClockOut ? (
                  <Text style={[styles.dayFlag, { color: colors.danger }]}>Départ manquant</Text>
                ) : null}
                <Text style={styles.dayTotal}>{formatWorked(day.workedMs)}</Text>
              </View>
              <View style={styles.entries}>
                {day.entries.map((entry) => {
                  const type = TYPE_STYLES[entry.type];
                  return (
                    <View key={entry.id} style={styles.entry}>
                      <Ionicons name={type.icon} size={13} color={type.color} />
                      <Text style={styles.entryTime}>{time(entry.timestamp)}</Text>
                      <Text style={styles.entryMeta}>
                        {type.label} · {SOURCE_LABELS[entry.source] ?? entry.source}
                        {entry.isEdited ? ' · modifié' : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...nativeShadow.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.displaySemiBold, fontSize: typography.sizes.md, color: colors.textPrimary },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  arrow: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  arrowDisabled: { opacity: 0.3 },
  monthLabel: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, minWidth: 104, textAlign: 'center' },

  loader: { marginVertical: spacing.lg },
  empty: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: spacing.md },

  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontFamily: fonts.display, fontSize: 18, color: colors.primary },
  summaryLabel: { fontSize: 11.5, color: colors.textSecondary, marginTop: 2 },
  summaryDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },

  day: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayLabel: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.textPrimary, textTransform: 'capitalize' },
  dayFlag: { fontSize: 11.5, fontWeight: '700' },
  dayTotal: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.textPrimary },
  entries: { marginTop: 8, gap: 6 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  entryTime: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  entryMeta: { fontSize: 12.5, color: colors.textSecondary },
});

import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Animated, FlatList, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@horaires/ui-tokens';
import type { Shift, Site } from '@horaires/shared-types';
import { useAuth } from '../services/AuthService';
import { queryKeys, useManualRefresh, useMyShifts, useRefreshOnFocus, useSites } from '../lib/queries';
import { fonts } from '../theme';

const NO_SHIFTS: Shift[] = [];
const NO_SITES: Site[] = [];
const REFRESHED_KEYS = [queryKeys.myShifts, queryKeys.sites];
import { NotificationBell } from '../components/NotificationBell';

const STATUS_LABELS: Record<string, string> = {
  assigned: 'Assigné',
  offered: 'Proposé',
  swap_pending: "En attente d'échange",
  confirmed: 'Confirmé',
  cancelled: 'Annulé',
};

const PENDING_STATUSES = new Set(['offered', 'swap_pending']);
const WEEKDAY_LABELS = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];
const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
// Distance de scroll (px) sur laquelle la grille se réduit complètement —
// au-delà, elle reste minimisée (extrapolate: 'clamp').
const COLLAPSE_DISTANCE = 130;

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // lundi = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Numéro de semaine ISO (lundi → dimanche), comme le « S47 » des
// notifications de nouveaux shifts.
function isoWeekNumber(date: Date) {
  const thursday = addDays(startOfWeek(date), 3);
  const firstThursday = addDays(startOfWeek(new Date(thursday.getFullYear(), 0, 4)), 3);
  return Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000)) + 1;
}

function weekRangeLabel(monday: Date) {
  const sunday = addDays(monday, 6);
  const short = (d: Date) => d.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' });
  return monday.getMonth() === sunday.getMonth() ? `${monday.getDate()} – ${short(sunday)}` : `${short(monday)} – ${short(sunday)}`;
}

// Liste du mois découpée par semaine : un en-tête avant les shifts de chaque
// semaine (seulement celles qui en ont).
type ListRow =
  | { kind: 'week'; key: string; number: number; range: string; count: number; isCurrent: boolean }
  | { kind: 'shift'; key: string; shift: Shift };

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Lecture seule — la création/édition d'horaires est exclusive à web-manager
// (voir CLAUDE.md, décision d'architecture). Cet écran ne fait qu'afficher.
//
// Vue mois en principal : le calendrier (barre de mois + grille) reste fixe
// au-dessus d'une liste qui montre TOUS les shifts du mois affiché (pas
// juste un jour), la carte d'aujourd'hui ressortant par sa couleur. La
// grille de jours se réduit progressivement (hauteur + opacité, animées sur
// le scroll de la liste) quand on glisse vers le haut pour regarder les
// cartes suivantes — seule la barre de mois (nav + libellé) reste toujours
// visible, jamais emportée par le scroll.
export function PlanningScreen() {
  const { user } = useAuth();
  // Depuis le cache : affiché tout de suite (hors ligne compris), rechargé
  // en arrière-plan, et à chaque `shifts:changed` (un manager publie ou
  // modifie un shift pendant que l'écran est ouvert).
  const shifts = useMyShifts().data ?? NO_SHIFTS;
  const sites = useSites().data ?? NO_SITES;
  useRefreshOnFocus(REFRESHED_KEYS);
  const refreshNow = useManualRefresh(REFRESHED_KEYS);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const today = useMemo(() => new Date(), []);
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(today));
  const [gridHeight, setGridHeight] = useState<number | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  // Instance FlatList sous-jacente (Animated.FlatList n'est plus générique
  // dans les types de React Native 0.88).
  const listRef = useRef<FlatList<ListRow> | null>(null);

  const refresh = async () => {
    setIsRefreshing(true);
    await refreshNow().catch(() => {});
    setIsRefreshing(false);
  };

  const siteName = (siteId: string) => sites.find((s) => s.id === siteId)?.name ?? siteId;

  // Grille de 42 cases (6 semaines) à partir du lundi de la semaine du 1er
  // du mois affiché — jours hors mois inclus mais estompés, comme n'importe
  // quel calendrier mensuel classique.
  const gridDays = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(monthAnchor));
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [monthAnchor]);

  const shiftsByDay = useMemo(() => {
    const map = new Set<string>();
    for (const s of shifts) map.add(new Date(s.startsAt).toDateString());
    return map;
  }, [shifts]);

  // Tous les shifts du mois affiché, triés par date — plus un seul jour à
  // la fois : on veut voir tout le mois défiler sous le calendrier.
  const monthShifts = useMemo(
    () =>
      shifts
        .filter((s) => {
          const d = new Date(s.startsAt);
          return d.getFullYear() === monthAnchor.getFullYear() && d.getMonth() === monthAnchor.getMonth();
        })
        .sort((a, b) => (a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0)),
    [shifts, monthAnchor],
  );

  const rows = useMemo(() => {
    const result: ListRow[] = [];
    const currentWeek = startOfWeek(today).getTime();
    const headers = new Map<string, Extract<ListRow, { kind: 'week' }>>();
    for (const s of monthShifts) {
      const monday = startOfWeek(new Date(s.startsAt));
      const key = `week-${monday.getTime()}`;
      let header = headers.get(key);
      if (!header) {
        header = {
          kind: 'week',
          key,
          number: isoWeekNumber(monday),
          range: weekRangeLabel(monday),
          count: 0,
          isCurrent: monday.getTime() === currentWeek,
        };
        headers.set(key, header);
        result.push(header);
      }
      header.count += 1;
      result.push({ kind: 'shift', key: s.id, shift: s });
    }
    return result;
  }, [monthShifts, today]);

  // Le prochain shift = le premier pas encore terminé (un shift en cours
  // compte encore), tous mois confondus — seule carte encadrée de la liste.
  const nextShiftId = useMemo(() => {
    const now = Date.now();
    let next: Shift | null = null;
    for (const s of shifts) {
      if (new Date(s.endsAt).getTime() <= now) continue;
      if (!next || s.startsAt < next.startsAt) next = s;
    }
    return next?.id ?? null;
  }, [shifts]);

  const goToMonth = (delta: number) => {
    setMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
    // Remonte la liste et redéplie la grille — un nouveau mois se présente
    // toujours en entier, pas à moitié réduit sur le scroll du précédent.
    scrollY.setValue(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const monthLabel = `${capitalize(MONTHS[monthAnchor.getMonth()])} ${monthAnchor.getFullYear()}`;

  const animatedGridStyle =
    gridHeight === null
      ? undefined
      : {
          height: scrollY.interpolate({
            inputRange: [0, COLLAPSE_DISTANCE],
            outputRange: [gridHeight, 0],
            extrapolate: 'clamp' as const,
          }),
          opacity: scrollY.interpolate({
            inputRange: [0, COLLAPSE_DISTANCE * 0.6],
            outputRange: [1, 0],
            extrapolate: 'clamp' as const,
          }),
        };

  const renderRow = ({ item }: { item: ListRow }) => {
    if (item.kind === 'shift') return renderCard(item.shift);
    return (
      <View style={styles.weekHeader}>
        <View style={[styles.weekBadge, item.isCurrent ? styles.weekBadgeCurrent : null]}>
          <Text style={[styles.weekBadgeText, item.isCurrent ? styles.weekBadgeTextCurrent : null]}>
            S{item.number}
          </Text>
        </View>
        <Text style={styles.weekRange}>
          {item.isCurrent ? 'Cette semaine · ' : ''}
          {item.range}
        </Text>
        <View style={styles.weekLine} />
        <Text style={styles.weekCount}>
          {item.count} shift{item.count > 1 ? 's' : ''}
        </Text>
      </View>
    );
  };

  const renderCard = (item: Shift) => {
    const mine = item.assignments?.find((a) => a.userId === user?.id);
    const pending = mine ? PENDING_STATUSES.has(mine.status) : false;
    const startDate = new Date(item.startsAt);
    const isToday = isSameDay(startDate, today);
    const isNext = item.id === nextShiftId;
    // Un seul encadré à la fois : le prochain shift (en cours compris). Un
    // shift d'aujourd'hui déjà terminé n'est plus mis en avant.
    return (
      <View style={[styles.card, isNext ? styles.cardToday : null]}>
        {isNext ? (
          <View style={styles.nextTag}>
            <Ionicons name="arrow-forward-circle" size={13} color={colors.primary} />
            <Text style={styles.nextTagText}>Prochain shift</Text>
          </View>
        ) : null}
        <View style={styles.cardTop}>
          <Text style={styles.cardDay}>
            {isToday
              ? "Aujourd'hui"
              : startDate.toLocaleDateString('fr-BE', { weekday: 'long', day: '2-digit', month: 'long' })}
          </Text>
          {mine ? (
            <View style={[styles.chip, pending ? styles.chipPending : styles.chipConfirmed]}>
              <Text style={styles.chipText}>{STATUS_LABELS[mine.status] ?? mine.status}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.time}>
          {startDate.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
          {' – '}
          {new Date(item.endsAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
        </Text>
        <View style={styles.siteRow}>
          <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.site}>{siteName(item.siteId)}</Text>
          {item.roleNeeded ? <Text style={styles.role}> · {item.roleNeeded}</Text> : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Planning</Text>
        <View style={styles.headerActions}>
          <NotificationBell />
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {`${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {/* Toujours visible, jamais emporté par le scroll de la liste — seule
          la partie grille (ci-dessous) se réduit. */}
      <View style={styles.calendarCard}>
        <View style={styles.calendarNav}>
          <Pressable style={styles.calendarArrow} onPress={() => goToMonth(-1)}>
            <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
          </Pressable>
          <Text style={styles.calendarMonthLabel}>{monthLabel}</Text>
          <Pressable style={styles.calendarArrow} onPress={() => goToMonth(1)}>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <Animated.View style={[{ overflow: 'hidden' }, animatedGridStyle]}>
          <View onLayout={(e) => setGridHeight((prev) => prev ?? e.nativeEvent.layout.height)}>
            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((label) => (
                <Text key={label} style={styles.weekdayLabel}>
                  {label}
                </Text>
              ))}
            </View>
            <View style={styles.daysGrid}>
              {gridDays.map((d) => {
                const inMonth = d.getMonth() === monthAnchor.getMonth();
                const isToday = isSameDay(d, today);
                const hasShift = shiftsByDay.has(d.toDateString());
                return (
                  <View key={d.toISOString()} style={styles.dayCell}>
                    <View style={[styles.dayCircle, isToday ? styles.dayCircleToday : null]}>
                      <Text
                        style={[
                          styles.dayNumber,
                          !inMonth ? styles.dayNumberMuted : null,
                          isToday ? styles.dayNumberToday : null,
                        ]}
                      >
                        {d.getDate()}
                      </Text>
                    </View>
                    <View style={[styles.dayDot, hasShift ? styles.dayDotFilled : null]} />
                  </View>
                );
              })}
            </View>
          </View>
        </Animated.View>
      </View>

      <Animated.FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(item: ListRow) => item.key}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        // Pas de rebond élastique en bas de liste (voulu à l'usage) — le
        // pull-to-refresh (RefreshControl) fonctionne quand même, son geste
        // ne dépend pas du rebond général de la liste.
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
        ListEmptyComponent={<Text style={styles.empty}>Aucun shift ce mois-ci.</Text>}
        renderItem={renderRow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 28, paddingHorizontal: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.textPrimary, letterSpacing: -0.2 },
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

  calendarCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    marginTop: 18,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  calendarNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calendarArrow: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  calendarMonthLabel: { fontFamily: fonts.displaySemiBold, fontSize: 14.5, color: colors.textPrimary },

  weekdayRow: { flexDirection: 'row', marginTop: 14, marginBottom: 4 },
  weekdayLabel: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 10.5,
    color: colors.textSecondary,
  },

  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 4,
    gap: 3,
  },
  dayCircle: {
    width: 29,
    height: 29,
    borderRadius: 14.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleToday: { backgroundColor: colors.primary },
  dayNumber: { fontSize: 13.5, color: colors.textPrimary },
  dayNumberMuted: { color: colors.border },
  dayNumberToday: { color: colors.surface, fontWeight: '700' },
  dayDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'transparent' },
  dayDotFilled: { backgroundColor: colors.primary },

  listContent: { paddingTop: 4, paddingBottom: 110, gap: 12 },
  // En-tête de semaine : « S47 · 16 – 22 nov. ——— 3 shifts ».
  weekHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  weekBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weekBadgeCurrent: { backgroundColor: colors.primary, borderColor: colors.primary },
  weekBadgeText: { fontFamily: fonts.displaySemiBold, fontSize: 12, color: colors.textPrimary },
  weekBadgeTextCurrent: { color: colors.surface },
  weekRange: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
  weekLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  weekCount: { fontSize: 11.5, color: colors.textSecondary },
  empty: { color: colors.textSecondary, marginTop: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 8,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  // Ressort du reste de la liste — même teinte que le reste de l'app pour
  // "aujourd'hui" (avatar, jour courant du calendrier ci-dessus).
  cardToday: { backgroundColor: colors.primaryTint, borderWidth: 1.5, borderColor: colors.primary },
  nextTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  nextTagText: { fontSize: 12, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardDay: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'capitalize' },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  chipConfirmed: { backgroundColor: colors.successTint },
  chipPending: { backgroundColor: colors.warningTint },
  chipText: { fontSize: 11, fontWeight: '700', color: colors.textPrimary },
  time: { fontFamily: fonts.displaySemiBold, fontSize: 21, color: colors.textPrimary, letterSpacing: -0.2 },
  siteRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  site: { fontSize: 13, color: colors.textSecondary },
  role: { fontSize: 13, color: colors.textSecondary },
});

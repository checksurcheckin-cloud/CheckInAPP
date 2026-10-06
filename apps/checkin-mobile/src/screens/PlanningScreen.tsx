import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@horaires/ui-tokens';
import type { Shift, Site } from '@horaires/shared-types';
import { apiClient, useAuth } from '../services/AuthService';
import { fonts } from '../theme';

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
  const { user, socket } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const today = useMemo(() => new Date(), []);
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(today));
  const [gridHeight, setGridHeight] = useState<number | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const listRef = useRef<Animated.FlatList<Shift> | null>(null);

  const load = useCallback(async () => {
    const [shiftList, siteList] = await Promise.all([apiClient.getShifts(), apiClient.getSites()]);
    setShifts(shiftList.slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
    setSites(siteList);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Un manager peut créer/publier un shift pendant que l'employé a l'écran
  // ouvert — voir realtime.gateway.ts côté backend.
  useEffect(() => {
    if (!socket) return;
    const onShiftsChanged = () => void load();
    socket.on('shifts:changed', onShiftsChanged);
    return () => {
      socket.off('shifts:changed', onShiftsChanged);
    };
  }, [socket, load]);

  const refresh = async () => {
    setIsRefreshing(true);
    await load().catch(() => {});
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
      shifts.filter((s) => {
        const d = new Date(s.startsAt);
        return d.getFullYear() === monthAnchor.getFullYear() && d.getMonth() === monthAnchor.getMonth();
      }),
    [shifts, monthAnchor],
  );

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

  const renderCard = ({ item }: { item: Shift }) => {
    const mine = item.assignments?.find((a) => a.userId === user?.id);
    const pending = mine ? PENDING_STATUSES.has(mine.status) : false;
    const startDate = new Date(item.startsAt);
    const isToday = isSameDay(startDate, today);
    return (
      <View style={[styles.card, isToday ? styles.cardToday : null]}>
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
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {`${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase()}
          </Text>
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
        data={monthShifts}
        keyExtractor={(item: Shift) => item.id}
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
        renderItem={renderCard}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 28, paddingHorizontal: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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

  listContent: { paddingTop: 16, paddingBottom: 110, gap: 12 },
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

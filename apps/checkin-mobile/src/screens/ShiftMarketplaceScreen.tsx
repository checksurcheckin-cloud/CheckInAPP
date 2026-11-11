import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shiftPalette } from '@horaires/ui-tokens';
import type { Availability, OpenShiftOffer, Shift, ShiftAssignment, Site, User } from '@horaires/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient, useAuth } from '../services/AuthService';
import {
  queryKeys,
  useManualRefresh,
  useMyAvailabilities,
  useMyShifts,
  useOpenOffers,
  useRefreshOnFocus,
  useSites,
  useUsers,
} from '../lib/queries';
import { ConfirmationBanner } from '../components/ConfirmationBanner';
import { fonts } from '../theme';
import { NotificationBell } from '../components/NotificationBell';
import { findBlockingUnavailability, toDateOnlyString, type BlockingUnavailability } from '../lib/unavailability';

type OwnAssignment = { kind: 'own'; id: string; shift: Shift; assignment: ShiftAssignment };
// `entry.kind` : 'swap' (un collègue cède son shift) ou 'open_shift' (créneau
// libre publié par le manager, sans titulaire).
type OpenOffer = { kind: 'offer'; id: string; shift: Shift; hasApplied: boolean; entry: OpenShiftOffer };
type Row = OwnAssignment | OpenOffer;
type Segment = 'available' | 'mine';

const NO_USERS: User[] = [];
const NO_SITES: Site[] = [];
const NO_AVAILABILITIES: Availability[] = [];
const REFRESHED_KEYS = [
  queryKeys.myShifts,
  queryKeys.openOffers,
  queryKeys.users,
  queryKeys.sites,
  queryKeys.myAvailabilities,
];

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatDuration(shift: Shift) {
  const minutes = Math.round((new Date(shift.endsAt).getTime() - new Date(shift.startsAt).getTime()) / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
}

// "Aujourd'hui" / "Demain" plutôt qu'une date brute quand c'est proche : c'est
// ce qui fait réagir sur un créneau de dernière minute.
function relativeDayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(d) - startOf(today)) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  return d.toLocaleDateString('fr-BE', { weekday: 'long' });
}

// Marché de shifts : on y trouve les shifts qu'un collègue propose de céder
// ET les créneaux libres publiés par le manager (ligne « Shifts disponibles »
// du planning, public choisi par le manager — décision #33). Dans les deux
// cas, plusieurs employés peuvent candidater ; le manager choisit ensuite.
// Tant que ce choix n'est pas fait, rien n'est attribué — candidater ici ne
// retire pas un shift d'échange à son propriétaire d'origine (voir CLAUDE.md).
// Pas de création d'horaires ici — uniquement le cycle offer/candidater.
//
// Liste verticale, lieu mis en avant (bandeau coloré par site + adresse) et
// filtre par site : sur un marché ouvert à plusieurs magasins, « où » compte
// autant que « quand ».
export function ShiftMarketplaceScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [segment, setSegment] = useState<Segment>('available');
  const [siteFilter, setSiteFilter] = useState<string | null>(null);
  // Depuis le cache, rechargé à chaque `shifts:changed` : une offre peut
  // trouver preneur, être validée/rejetée, ou un collègue candidater pendant
  // que l'écran reste ouvert.
  const myShiftsQuery = useMyShifts();
  const openOffersQuery = useOpenOffers();
  const users = useUsers().data ?? NO_USERS;
  const sites = useSites().data ?? NO_SITES;
  // Toujours "les miennes", même pour un manager (décision #31).
  const availabilities = useMyAvailabilities(user?.id).data ?? NO_AVAILABILITIES;
  const isLoading = myShiftsQuery.isPending || openOffersQuery.isPending;
  useRefreshOnFocus(REFRESHED_KEYS);
  const refreshNow = useManualRefresh(REFRESHED_KEYS);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  // Shift qu'on veut prendre un jour où l'on s'est déclaré indisponible :
  // on demande d'abord s'il faut lever l'indisponibilité ce jour-là.
  const [unavailablePrompt, setUnavailablePrompt] = useState<{
    entry: OpenShiftOffer;
    blocking: BlockingUnavailability;
  } | null>(null);

  // "Mes échanges" : mes propres shifts à venir, déjà proposés ou non.
  // getShifts ne renvoie que mes shifts, d'où le scan local. Un shift
  // terminé ne se propose plus (refusé par l'API, décision #32).
  const ownAssignments = useMemo(() => {
    const mine: OwnAssignment[] = [];
    const now = Date.now();
    for (const shift of myShiftsQuery.data ?? []) {
      if (new Date(shift.endsAt).getTime() <= now) continue;
      for (const assignment of shift.assignments ?? []) {
        if (assignment.userId === user?.id && (assignment.status === 'assigned' || assignment.status === 'offered')) {
          mine.push({ kind: 'own', id: assignment.id, shift, assignment });
        }
      }
    }
    return mine.sort((a, b) => a.shift.startsAt.localeCompare(b.shift.startsAt));
  }, [myShiftsQuery.data, user?.id]);

  // "Disponibles" : offres ouvertes des collègues et créneaux libres, via
  // l'endpoint dédié (l'API exclut déjà mes propres offres et ce qui
  // chevauche un de mes shifts).
  const openOffers = useMemo<OpenOffer[]>(
    () =>
      (openOffersQuery.data ?? []).map((o) => ({ kind: 'offer', id: o.id, shift: o.shift, hasApplied: o.hasApplied, entry: o })),
    [openOffersQuery.data],
  );

  // Après une action : recharge le marché et mes shifts (et mes dispos si
  // l'action en a levé une).
  const load = () =>
    Promise.all(
      [...REFRESHED_KEYS].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    ).then(() => {});

  const refresh = async () => {
    setIsRefreshing(true);
    await refreshNow().catch(() => {});
    setIsRefreshing(false);
  };

  const offerShift = async (assignmentId: string) => {
    setBusyId(assignmentId);
    setBanner(null);
    try {
      await apiClient.offerShiftAssignment(assignmentId);
      await load();
      setBanner({ kind: 'success', message: 'Shift proposé à vos collègues' });
    } catch (err) {
      setBanner({ kind: 'error', message: err instanceof Error ? err.message : 'Échec de la proposition' });
    } finally {
      setBusyId(null);
    }
  };

  // "Candidater", pas "Accepter" : ça n'attribue rien tout de suite, ça
  // ajoute juste l'employé à la liste que le manager arbitrera.
  const applyToOffer = async (entry: OpenShiftOffer) => {
    setBusyId(entry.id);
    setBanner(null);
    try {
      await apiClient.applyToMarketEntry(entry);
      await load();
      setBanner({ kind: 'success', message: 'Candidature envoyée, votre manager va trancher' });
    } catch (err) {
      // 400 si déjà candidat, 409 si un shift chevauche déjà ce créneau ou
      // si l'employé s'est déclaré indisponible — dans tous les cas,
      // l'utilisateur doit voir pourquoi ça n'a pas marché.
      setBanner({ kind: 'error', message: err instanceof Error ? err.message : 'Échec de la candidature' });
    } finally {
      setBusyId(null);
    }
  };

  // Avant de candidater : une indisponibilité déclarée sur ce créneau ferait
  // refuser la candidature (409, ensureAvailable) — on propose plutôt de la
  // lever pour ce jour-là.
  const takeShift = (entry: OpenShiftOffer) => {
    const blocking = findBlockingUnavailability(availabilities, entry.shift.startsAt, entry.shift.endsAt);
    if (blocking) {
      setUnavailablePrompt({ entry, blocking });
      return;
    }
    void applyToOffer(entry);
  };

  // Lève l'indisponibilité pour CE jour seulement, puis candidate. Une
  // exception ponctuelle est simplement repassée à Disponible ; une
  // indisponibilité récurrente reste en place pour les autres semaines, et
  // reçoit une exception "disponible" sur ce jour (même mécanisme que
  // « Garder la récurrence, libérer cette semaine », décision #18).
  const liftUnavailabilityAndApply = async () => {
    if (!unavailablePrompt) return;
    const { entry, blocking } = unavailablePrompt;
    setUnavailablePrompt(null);
    setBusyId(entry.id);
    setBanner(null);
    try {
      const fullDay = { startTime: '00:00', endTime: '23:59', isAvailable: true };
      if (blocking.isRecurring) {
        await apiClient.createAvailability({
          specificDate: toDateOnlyString(new Date(entry.shift.startsAt)),
          ...fullDay,
        });
      } else {
        await apiClient.updateAvailability(blocking.record.id, fullDay);
      }
    } catch (err) {
      setBanner({ kind: 'error', message: err instanceof Error ? err.message : "Impossible de lever l'indisponibilité" });
      setBusyId(null);
      return;
    }
    await applyToOffer(entry);
  };

  const siteById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  // Une couleur stable par site (ordre de la liste des sites), pour qu'un
  // magasin se reconnaisse d'un coup d'œil d'une carte à l'autre.
  const siteColor = useCallback(
    (siteId: string) => {
      const index = sites.findIndex((s) => s.id === siteId);
      return shiftPalette[(index < 0 ? 0 : index) % shiftPalette.length];
    },
    [sites],
  );
  const userName = (userId: string) => {
    const u = users.find((candidate) => candidate.id === userId);
    return u ? `${u.firstName} ${u.lastName}` : 'Un collègue';
  };

  const allRows: Row[] = segment === 'available' ? openOffers : ownAssignments;
  // Chips de filtre : seulement les sites réellement présents dans la liste.
  const siteCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of allRows) counts.set(row.shift.siteId, (counts.get(row.shift.siteId) ?? 0) + 1);
    return counts;
  }, [allRows]);
  const activeFilter = siteFilter && siteCounts.has(siteFilter) ? siteFilter : null;
  const rows = activeFilter ? allRows.filter((r) => r.shift.siteId === activeFilter) : allRows;
  const toTake = openOffers.filter((o) => !o.hasApplied).length;

  const renderCard = (row: Row) => {
    const busy = busyId === row.id;
    const site = siteById.get(row.shift.siteId);
    const tint = siteColor(row.shift.siteId);
    const start = new Date(row.shift.startsAt);
    const alreadyApplied = row.kind === 'offer' && row.hasApplied;
    const pendingOffer = row.kind === 'own' && row.assignment.status === 'offered';
    const done = alreadyApplied || pendingOffer;

    return (
      <View key={row.id} style={styles.card}>
        <View style={styles.cardInner}>
        <View style={[styles.siteBand, { backgroundColor: tint.bg }]}>
          <View style={[styles.siteIcon, { backgroundColor: colors.surface }]}>
            <Ionicons name="storefront" size={16} color={tint.text} />
          </View>
          <View style={styles.siteTextWrap}>
            <Text style={[styles.siteName, { color: tint.text }]} numberOfLines={1}>
              {site?.name ?? 'Site'}
            </Text>
            {site?.address ? (
              <View style={styles.addressRow}>
                <Ionicons name="location-outline" size={11} color={tint.text} />
                <Text style={[styles.siteAddress, { color: tint.text }]} numberOfLines={1}>
                  {site.address}
                </Text>
              </View>
            ) : null}
          </View>
          {row.kind === 'offer' ? (
            <View style={styles.kindPill}>
              <Ionicons
                name={row.entry.kind === 'swap' ? 'swap-horizontal' : 'sparkles'}
                size={11}
                color={row.entry.kind === 'swap' ? colors.primary : colors.accent}
              />
              <Text style={[styles.kindPillText, { color: row.entry.kind === 'swap' ? colors.primary : colors.accent }]}>
                {row.entry.kind === 'swap' ? 'Échange' : 'Libre'}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.cardBody}>
          <View style={styles.dateBlock}>
            <Text style={styles.dateDay}>{start.getDate()}</Text>
            <Text style={styles.dateMonth}>
              {start.toLocaleDateString('fr-BE', { month: 'short' }).replace('.', '')}
            </Text>
          </View>
          <View style={styles.timeWrap}>
            <Text style={styles.relativeDay}>{relativeDayLabel(row.shift.startsAt)}</Text>
            <Text style={styles.timeRange}>
              {formatTime(row.shift.startsAt)} – {formatTime(row.shift.endsAt)}
            </Text>
            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
                <Text style={styles.metaText}>{formatDuration(row.shift)}</Text>
              </View>
              {row.shift.roleNeeded ? (
                <View style={styles.metaChip}>
                  <Ionicons name="briefcase-outline" size={12} color={colors.textSecondary} />
                  <Text style={styles.metaText}>{row.shift.roleNeeded}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {row.kind === 'offer' && row.entry.offeredBy ? (
          <View style={styles.byRow}>
            <View style={styles.miniAvatar}>
              <Text style={styles.miniAvatarText}>{initials(userName(row.entry.offeredBy))}</Text>
            </View>
            <Text style={styles.byName}>
              Proposé par <Text style={styles.byNameStrong}>{userName(row.entry.offeredBy)}</Text>
            </Text>
          </View>
        ) : row.kind === 'offer' ? (
          <View style={styles.byRow}>
            <View style={[styles.miniAvatar, styles.openSlotIcon]}>
              <Ionicons name="megaphone-outline" size={12} color={colors.accent} />
            </View>
            <Text style={styles.byName}>Créneau ouvert par votre manager</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.cta,
            done && styles.ctaDone,
            pressed && !done && styles.ctaPressed,
          ]}
          disabled={busy || done}
          onPress={() => (row.kind === 'own' ? offerShift(row.assignment.id) : takeShift(row.entry))}
        >
          {busy ? (
            <ActivityIndicator color={colors.surface} size="small" />
          ) : done ? (
            <>
              <Ionicons name={alreadyApplied ? 'checkmark-circle' : 'hourglass-outline'} size={17} color={colors.success} />
              <Text style={styles.ctaDoneText}>{alreadyApplied ? 'Candidature envoyée' : 'Proposé, en attente de preneur'}</Text>
            </>
          ) : (
            <>
              <Text style={styles.ctaText}>{row.kind === 'own' ? 'Proposer à mes collègues' : 'Je prends ce shift'}</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.surface} />
            </>
          )}
        </Pressable>
        </View>
      </View>
    );
  };

  const filterChips = siteCounts.size > 1 ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
      <Pressable style={[styles.chip, !activeFilter && styles.chipActive]} onPress={() => setSiteFilter(null)}>
        <Text style={[styles.chipText, !activeFilter && styles.chipTextActive]}>Tous · {allRows.length}</Text>
      </Pressable>
      {[...siteCounts.entries()].map(([siteId, count]) => {
        const active = activeFilter === siteId;
        const tint = siteColor(siteId);
        return (
          <Pressable
            key={siteId}
            style={[styles.chip, active && { backgroundColor: tint.text, borderColor: tint.text }]}
            onPress={() => setSiteFilter(active ? null : siteId)}
          >
            <View style={[styles.chipDot, { backgroundColor: active ? colors.surface : tint.text }]} />
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {siteById.get(siteId)?.name ?? 'Site'} · {count}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  ) : null;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
      >
        <View style={styles.px}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Marché de shifts</Text>
            <View style={styles.headerActions}>
              <NotificationBell />
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {`${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name="flash" size={20} color={colors.surface} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>
                {toTake === 0
                  ? 'Rien à prendre pour le moment'
                  : `${toTake} shift${toTake > 1 ? 's' : ''} à prendre`}
              </Text>
              <Text style={styles.heroSubtitle}>
                {toTake === 0
                  ? 'Tirez vers le bas pour actualiser'
                  : 'Candidatez, votre manager choisit parmi les volontaires'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.stickyBar}>
          <View style={[styles.segmented, styles.pxMargin]}>
            <Pressable style={[styles.seg, segment === 'available' && styles.segActive]} onPress={() => setSegment('available')}>
              <Text style={[styles.segText, segment === 'available' && styles.segTextActive]}>
                Disponibles{openOffers.length ? ` · ${openOffers.length}` : ''}
              </Text>
            </Pressable>
            <Pressable style={[styles.seg, segment === 'mine' && styles.segActive]} onPress={() => setSegment('mine')}>
              <Text style={[styles.segText, segment === 'mine' && styles.segTextActive]}>
                Mes shifts{ownAssignments.length ? ` · ${ownAssignments.length}` : ''}
              </Text>
            </Pressable>
          </View>
          {filterChips}
        </View>

        <View style={styles.px}>
          {banner ? (
            <View style={styles.bannerWrap}>
              <ConfirmationBanner kind={banner.kind} message={banner.message} onHide={() => setBanner(null)} />
            </View>
          ) : null}

          {isLoading ? (
            <ActivityIndicator style={styles.loader} color={colors.primary} />
          ) : rows.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name={segment === 'available' ? 'cafe-outline' : 'calendar-outline'}
                  size={28}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {segment === 'available' ? 'Aucun shift disponible' : 'Aucun shift à proposer'}
              </Text>
              <Text style={styles.emptyText}>
                {segment === 'available'
                  ? 'Les créneaux libres et les échanges de vos collègues apparaîtront ici.'
                  : 'Vos prochains shifts publiés apparaîtront ici pour être proposés.'}
              </Text>
            </View>
          ) : (
            <View style={styles.list}>{rows.map(renderCard)}</View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={unavailablePrompt !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setUnavailablePrompt(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="calendar-clear-outline" size={22} color={colors.warning} />
            </View>
            <Text style={styles.modalTitle}>Vous êtes indisponible ce jour-là</Text>
            <Text style={styles.modalMessage}>
              {unavailablePrompt
                ? `Vous vous êtes déclaré indisponible le ${new Date(unavailablePrompt.entry.shift.startsAt).toLocaleDateString(
                    'fr-BE',
                    { weekday: 'long', day: 'numeric', month: 'long' },
                  )}${unavailablePrompt.blocking.isRecurring ? ' (chaque semaine)' : ''}. Voulez-vous retirer cette indisponibilité pour ce jour et prendre le shift ?`
                : ''}
            </Text>
            {unavailablePrompt?.blocking.isRecurring ? (
              <Text style={styles.modalHint}>
                Votre indisponibilité récurrente reste active pour les autres semaines : seul ce jour devient une
                exception.
              </Text>
            ) : null}
            <Pressable style={styles.modalPrimaryBtn} onPress={liftUnavailabilityAndApply}>
              <Text style={styles.modalPrimaryBtnText}>Oui, retirer et prendre le shift</Text>
            </Pressable>
            <Pressable style={styles.modalCancelBtn} onPress={() => setUnavailablePrompt(null)}>
              <Text style={styles.modalCancelBtnText}>Non, garder mon indisponibilité</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingTop: 28, paddingBottom: 130 },
  px: { paddingHorizontal: 20 },
  pxMargin: { marginHorizontal: 20 },

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

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 18,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.surface },
  heroSubtitle: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 2 },

  stickyBar: { backgroundColor: colors.background, paddingTop: 16, paddingBottom: 10 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 4,
  },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10 },
  segActive: { backgroundColor: colors.textPrimary },
  segText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  segTextActive: { color: colors.surface },

  chipsRow: { gap: 8, paddingHorizontal: 20, paddingTop: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 12.5, fontWeight: '600', color: colors.textPrimary },
  chipTextActive: { color: colors.surface },

  bannerWrap: { marginTop: 6 },
  loader: { marginTop: 40 },
  list: { gap: 20, marginTop: 8 },

  // Bordure nette + ombre plus marquée : chaque carte doit se détacher
  // franchement du fond et de sa voisine. L'ombre est portée par `card`
  // (pas d'overflow: hidden, qui la couperait sur iOS) ; c'est `cardInner`
  // qui arrondit et découpe le bandeau du site.
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#D9DEE7',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 8,
  },
  cardInner: { borderRadius: 20.5, overflow: 'hidden' },
  siteBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 23, 42, 0.06)',
  },
  siteIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  siteTextWrap: { flex: 1 },
  siteName: { fontFamily: fonts.display, fontSize: 15.5 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  siteAddress: { fontSize: 11.5, opacity: 0.85, flexShrink: 1 },
  kindPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  kindPillText: { fontSize: 11, fontWeight: '700' },

  cardBody: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingTop: 16 },
  dateBlock: {
    width: 56,
    height: 60,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: { fontFamily: fonts.display, fontSize: 22, color: colors.textPrimary, lineHeight: 26 },
  dateMonth: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase' },
  timeWrap: { flex: 1 },
  relativeDay: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'capitalize' },
  timeRange: { fontFamily: fonts.display, fontSize: 21, color: colors.textPrimary, letterSpacing: -0.3, marginTop: 1 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  metaText: { fontSize: 11.5, fontWeight: '600', color: colors.textSecondary },

  byRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginTop: 14 },
  miniAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniAvatarText: { fontFamily: fonts.displaySemiBold, fontSize: 10, color: colors.primary },
  openSlotIcon: { backgroundColor: colors.accentTint },
  byName: { fontSize: 12.5, color: colors.textSecondary, flexShrink: 1 },
  byNameStrong: { fontWeight: '700', color: colors.textPrimary },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    margin: 16,
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 13,
  },
  ctaPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  ctaText: { color: colors.surface, fontWeight: '700', fontSize: 14.5 },
  ctaDone: { backgroundColor: colors.successTint },
  ctaDoneText: { color: colors.success, fontWeight: '700', fontSize: 14 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 22,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 32,
    elevation: 12,
  },
  modalIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.warningTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: { fontFamily: fonts.displaySemiBold, fontSize: 17, color: colors.textPrimary },
  modalMessage: { fontSize: 13.5, color: colors.textSecondary, lineHeight: 19 },
  modalHint: {
    fontSize: 12.5,
    color: colors.textSecondary,
    lineHeight: 17,
    backgroundColor: colors.background,
    padding: 10,
    borderRadius: 10,
  },
  modalPrimaryBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  modalPrimaryBtnText: { color: colors.surface, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  modalCancelBtn: { alignItems: 'center', paddingVertical: 8 },
  modalCancelBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.textPrimary, marginTop: 16 },
  emptyText: { fontSize: 13.5, color: colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 19 },
});

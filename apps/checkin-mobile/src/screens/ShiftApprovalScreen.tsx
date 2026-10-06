import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '@horaires/ui-tokens';
import type { PendingShiftOffer, Site, User } from '@horaires/shared-types';
import { apiClient, useAuth } from '../services/AuthService';
import { fonts } from '../theme';

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// Toutes les offres encore ouvertes du marché de shifts — y compris celles
// sans aucun candidat, pour que le manager voie ce qui reste sans preneur.
// Plusieurs collègues peuvent candidater sur la même offre : on choisit
// lequel approuver (chips tapables, un seul sélectionné à la fois). Un refus
// remet l'assignation à son propriétaire d'origine (ShiftsService.rejectOffer).
export function ShiftApprovalScreen() {
  const { user, socket } = useAuth();
  const [offers, setOffers] = useState<PendingShiftOffer[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [offerList, userList, siteList] = await Promise.all([
      apiClient.getPendingShiftOffers(),
      apiClient.getUsers(),
      apiClient.getSites(),
    ]);
    setUsers(userList);
    setSites(siteList);
    setOffers(offerList);
    setSelectedCandidate((current) => {
      const next = { ...current };
      for (const offer of offerList) {
        if (!next[offer.id] && offer.candidates.length > 0) {
          next[offer.id] = offer.candidates[0].userId;
        }
      }
      return next;
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

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

  const approve = async (offerId: string) => {
    const candidateId = selectedCandidate[offerId];
    if (!candidateId) return;
    setBusyId(offerId);
    try {
      await apiClient.approveShiftOffer(offerId, candidateId);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (offerId: string) => {
    setBusyId(offerId);
    try {
      await apiClient.rejectShiftOffer(offerId);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const siteName = (siteId: string) => sites.find((s) => s.id === siteId)?.name ?? siteId;
  const userName = (userId: string) => {
    const u = users.find((candidate) => candidate.id === userId);
    return u ? `${u.firstName} ${u.lastName}` : userId;
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>Validations</Text>
          {offers.length > 0 ? (
            <View style={styles.countChip}>
              <Text style={styles.countChipText}>{offers.length} en attente</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {`${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase()}
          </Text>
        </View>
      </View>
      <Text style={styles.subtitle}>Offres du marché de shifts</Text>

      <FlatList
        data={offers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        ListEmptyComponent={<Text style={styles.empty}>Aucune offre ouverte sur le marché de shifts.</Text>}
        renderItem={({ item }) => {
          const fromName = userName(item.offeredBy);
          const busy = busyId === item.id;
          const hasCandidates = item.candidates.length > 0;
          return (
            <View style={styles.card}>
              <View style={styles.swapRow}>
                <View style={styles.swapAvatar}>
                  <Text style={styles.swapAvatarText}>{initials(fromName)}</Text>
                </View>
                <Text style={styles.swapNames} numberOfLines={1}>
                  <Text style={styles.swapNamesBold}>{fromName}</Text> propose ce shift
                </Text>
              </View>

              <View style={styles.details}>
                <View>
                  <Text style={styles.detailsTime}>
                    {new Date(item.shift.startsAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
                    {' – '}
                    {new Date(item.shift.endsAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={styles.detailsSite}>{siteName(item.shift.siteId)}</Text>
                </View>
                <Text style={styles.detailsDate}>
                  {new Date(item.shift.startsAt).toLocaleDateString('fr-BE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                </Text>
              </View>

              {hasCandidates ? (
                <View style={styles.candidatesBlock}>
                  <Text style={styles.candidatesLabel}>Candidats</Text>
                  <View style={styles.candidatesRow}>
                    {item.candidates.map((candidate) => {
                      const selected = selectedCandidate[item.id] === candidate.userId;
                      return (
                        <Pressable
                          key={candidate.id}
                          style={[styles.candidateChip, selected && styles.candidateChipSelected]}
                          onPress={() => setSelectedCandidate((prev) => ({ ...prev, [item.id]: candidate.userId }))}
                        >
                          <Text style={[styles.candidateChipText, selected && styles.candidateChipTextSelected]}>
                            {userName(candidate.userId)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : (
                <Text style={styles.noCandidate}>Aucun candidat pour l'instant</Text>
              )}

              <View style={styles.actionsRow}>
                <Pressable style={styles.rejectBtn} disabled={busy} onPress={() => reject(item.id)}>
                  <Ionicons name="close" size={16} color={colors.textPrimary} />
                  <Text style={styles.rejectBtnText}>Retirer</Text>
                </Pressable>
                <Pressable
                  style={[styles.approveBtn, !hasCandidates && styles.approveBtnDisabled]}
                  disabled={busy || !hasCandidates}
                  onPress={() => approve(item.id)}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.surface} size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={16} color={colors.surface} />
                      <Text style={styles.approveBtnText}>Approuver</Text>
                    </>
                  )}
                </Pressable>
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
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.textPrimary, letterSpacing: -0.2 },
  countChip: { backgroundColor: colors.warningTint, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  countChipText: { fontSize: 12, fontWeight: '800', color: colors.textPrimary },
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
  subtitle: { fontSize: 13.5, color: colors.textSecondary, marginTop: 6 },

  listContent: { paddingTop: 22, paddingBottom: 110, gap: 12 },
  empty: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.md,
    gap: 12,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  swapRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swapAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapAvatarText: { fontFamily: fonts.displaySemiBold, fontSize: 12, color: colors.primary },
  swapNames: { flex: 1, fontSize: 13, color: colors.textPrimary },
  swapNamesBold: { fontWeight: '700' },

  details: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  detailsTime: { fontFamily: fonts.displaySemiBold, fontSize: 15.5, color: colors.textPrimary },
  detailsSite: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  detailsDate: { fontSize: 11.5, fontWeight: '700', color: colors.textSecondary, textTransform: 'capitalize' },

  candidatesBlock: { gap: 6 },
  candidatesLabel: { fontSize: 11.5, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase' },
  candidatesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  candidateChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  candidateChipSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  candidateChipText: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
  candidateChipTextSelected: { color: colors.primary },
  noCandidate: { fontSize: 12.5, color: colors.textSecondary, fontStyle: 'italic' },

  actionsRow: { flexDirection: 'row', gap: 10 },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 13,
    paddingVertical: 11,
  },
  approveBtnDisabled: { backgroundColor: colors.border },
  approveBtnText: { color: colors.surface, fontWeight: '700', fontSize: 13.5 },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 13,
    paddingVertical: 11,
  },
  rejectBtnText: { color: colors.textPrimary, fontWeight: '700', fontSize: 13.5 },
});

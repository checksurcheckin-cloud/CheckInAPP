import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { AppNotification, NotificationType } from '@horaires/shared-types';
import { colors } from '@horaires/ui-tokens';
import { fonts } from '../theme';
import { useNotifications } from '../services/Notifications';
import { withPressedFeedback } from '../lib/pressedStyle';
import { notificationRoute } from '../lib/notificationTargets';

// Une couleur par type, reprise des codes de l'app : bleu = planning, vert =
// réussite, turquoise = marché (pastille « Libre » du marché).
const TYPE_STYLES: Record<
  NotificationType,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; tint: string; cta: string }
> = {
  shift_assigned: {
    label: 'Planning',
    icon: 'calendar',
    color: colors.primary,
    tint: colors.primaryTint,
    cta: 'Voir mon planning',
  },
  application_accepted: {
    label: 'Candidature',
    icon: 'checkmark-circle',
    color: colors.success,
    tint: colors.successTint,
    cta: 'Voir mon planning',
  },
  shift_available: {
    label: 'Marché',
    icon: 'flash',
    color: colors.accent,
    tint: colors.accentTint,
    cta: 'Voir le marché',
  },
};

type Filter = 'all' | 'unread';
type Section = { title: string; data: AppNotification[] };

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// Sections dans l'ordre chronologique inverse (la liste arrive déjà triée,
// plus récente d'abord).
function sectionTitle(iso: string): string {
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / DAY_MS);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 7) return 'Cette semaine';
  return 'Plus ancien';
}

function groupByDay(items: AppNotification[]): Section[] {
  const sections: Section[] = [];
  for (const item of items) {
    const title = sectionTitle(item.createdAt);
    const last = sections[sections.length - 1];
    if (last?.title === title) last.data.push(item);
    else sections.push({ title, data: [item] });
  }
  return sections;
}

// Heure pour aujourd'hui, sinon durée écoulée ou date.
function timeLabel(iso: string): string {
  const date = new Date(iso);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `${minutes} min`;
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY_MS);
  if (days <= 0) return date.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Hier';
  if (days < 7) return date.toLocaleDateString('fr-BE', { weekday: 'long' });
  return date.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' });
}

// Le backend rédige « lun. 16 nov. · 09:00–17:00 · Site » (avec parfois une
// phrase autour) : on en tire jour, horaire et magasin pour les afficher en
// pastilles. Texte inattendu -> affiché tel quel.
function shiftDetails(body: string): { day: string; time: string; site: string } | null {
  const core = body.replace(/^Le shift est à vous : /, '').replace(/ — à prendre dans le marché$/, '');
  const parts = core.split(' · ');
  if (parts.length !== 3) return null;
  const [day, time, site] = parts;
  return { day, time, site };
}

export function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const { items, unreadCount, isLoading, refresh, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState<Filter>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const sections = useMemo(
    () => groupByDay(filter === 'unread' ? items.filter((n) => !n.readAt) : items),
    [items, filter],
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  };

  const open = (notification: AppNotification) => {
    markRead(notification.id);
    navigation.navigate('Main', notificationRoute(notification.type, notification.shiftId));
  };

  const renderItem = ({ item }: { item: AppNotification }) => {
    const unread = !item.readAt;
    const type = TYPE_STYLES[item.type];
    const details = shiftDetails(item.body);
    return (
      <Pressable
        onPress={() => open(item)}
        style={withPressedFeedback(styles.card, !unread && styles.cardRead)}
        accessibilityRole="button"
        accessibilityLabel={`${unread ? 'Non lue. ' : ''}${item.title}. ${item.body}`}
      >
        {unread ? <View style={[styles.accentBar, { backgroundColor: type.color }]} /> : null}
        <View style={styles.cardTop}>
          <View style={[styles.typeIcon, { backgroundColor: unread ? type.color : type.tint }]}>
            <Ionicons name={type.icon} size={18} color={unread ? colors.surface : type.color} />
          </View>
          <View style={styles.cardHeading}>
            <View style={styles.cardMetaRow}>
              <View style={[styles.typePill, { backgroundColor: type.tint }]}>
                <Text style={[styles.typePillText, { color: type.color }]}>{type.label}</Text>
              </View>
              <Text style={styles.time}>{timeLabel(item.createdAt)}</Text>
              {unread ? <View style={[styles.unreadDot, { backgroundColor: type.color }]} /> : null}
            </View>
            <Text style={[styles.title, !unread && styles.titleRead]} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
        </View>

        {details ? (
          <View style={styles.chips}>
            <View style={styles.chip}>
              <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
              <Text style={styles.chipText}>{details.day}</Text>
            </View>
            <View style={styles.chip}>
              <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
              <Text style={styles.chipText}>{details.time}</Text>
            </View>
            <View style={[styles.chip, styles.chipSite]}>
              <Ionicons name="storefront-outline" size={12} color={colors.textSecondary} />
              <Text style={styles.chipText} numberOfLines={1}>
                {details.site}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.body}>{item.body}</Text>
        )}

        <View style={styles.ctaRow}>
          <Text style={[styles.ctaText, { color: type.color }]}>{type.cta}</Text>
          <Ionicons name="arrow-forward" size={14} color={type.color} />
        </View>
      </Pressable>
    );
  };

  const header = (
    <View>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name={unreadCount > 0 ? 'notifications' : 'checkmark-done'} size={20} color={colors.surface} />
        </View>
        <View style={styles.heroText}>
          <Text style={styles.heroTitle}>
            {unreadCount === 0
              ? 'Vous êtes à jour'
              : `${unreadCount} nouvelle${unreadCount > 1 ? 's' : ''} notification${unreadCount > 1 ? 's' : ''}`}
          </Text>
          <Text style={styles.heroSubtitle}>
            {unreadCount === 0 ? 'Rien de nouveau depuis votre dernière visite' : 'Touchez une notification pour l’ouvrir'}
          </Text>
        </View>
        {unreadCount > 0 ? (
          <Pressable
            onPress={markAllRead}
            style={withPressedFeedback(styles.heroButton)}
            accessibilityRole="button"
            accessibilityLabel="Tout marquer comme lu"
            hitSlop={6}
          >
            <Ionicons name="checkmark-done" size={18} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.segmented}>
        <Pressable style={[styles.seg, filter === 'all' && styles.segActive]} onPress={() => setFilter('all')}>
          <Text style={[styles.segText, filter === 'all' && styles.segTextActive]}>Toutes</Text>
        </Pressable>
        <Pressable style={[styles.seg, filter === 'unread' && styles.segActive]} onPress={() => setFilter('unread')}>
          <Text style={[styles.segText, filter === 'unread' && styles.segTextActive]}>
            Non lues{unreadCount > 0 ? ` · ${unreadCount}` : ''}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const empty = (
    <View style={styles.emptyState}>
      <View style={styles.emptyHalo}>
        <View style={styles.emptyIcon}>
          <Ionicons name={filter === 'unread' ? 'checkmark-done' : 'notifications-outline'} size={30} color={colors.primary} />
        </View>
      </View>
      <Text style={styles.emptyTitle}>{filter === 'unread' ? 'Tout est lu' : 'Tout est calme'}</Text>
      <Text style={styles.emptyText}>
        {filter === 'unread'
          ? 'Vous avez pris connaissance de toutes vos notifications.'
          : 'Vous serez prévenu ici quand un shift vous est attribué, quand votre candidature est acceptée ou quand un nouveau shift est disponible.'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={withPressedFeedback(styles.backButton)}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={6}
        >
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.screenTitle}>Notifications</Text>
      </View>

      {isLoading && items.length === 0 ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 28, paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  screenTitle: { flex: 1, fontFamily: fonts.display, fontSize: 24, color: colors.textPrimary, letterSpacing: -0.2 },
  loader: { marginTop: 48 },
  listContent: { paddingBottom: 48 },

  // Même bloc d'accueil que le marché : bleu, halo de couleur.
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
  heroText: { flex: 1 },
  heroTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.surface },
  heroSubtitle: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  heroButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Même sélecteur que le marché (actif en noir).
  segmented: {
    flexDirection: 'row',
    marginTop: 16,
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

  sectionTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 11.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    marginTop: 24,
    marginBottom: 10,
    marginLeft: 4,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#D9DEE7',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  cardRead: { borderColor: colors.border, shadowOpacity: 0, elevation: 0 },
  // Arrondie elle-même plutôt que découpée par la carte : un overflow
  // 'hidden' sur la carte couperait son ombre sur iOS.
  accentBar: {
    position: 'absolute',
    left: -1.5,
    top: -1.5,
    bottom: -1.5,
    width: 5,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  cardTop: { flexDirection: 'row', gap: 12 },
  typeIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardHeading: { flex: 1, gap: 4 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  typePillText: { fontSize: 11, fontWeight: '700' },
  time: { flex: 1, fontSize: 12, color: colors.textSecondary },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  title: { fontFamily: fonts.display, fontSize: 16, color: colors.textPrimary, letterSpacing: -0.1 },
  titleRead: { fontFamily: fonts.displaySemiBold, color: colors.textSecondary },
  body: { fontSize: 13.5, color: colors.textSecondary, lineHeight: 19, marginTop: 10, marginLeft: 52 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, marginLeft: 52 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  chipSite: { flexShrink: 1 },
  chipText: { fontSize: 11.5, fontWeight: '600', color: colors.textSecondary, flexShrink: 1 },

  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12, marginLeft: 52 },
  ctaText: { fontSize: 13, fontWeight: '700' },

  emptyState: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 24 },
  emptyHalo: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.textPrimary, marginTop: 18 },
  emptyText: { fontSize: 13.5, color: colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 19 },
});

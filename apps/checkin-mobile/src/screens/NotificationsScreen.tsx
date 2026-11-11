import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { AppNotification, NotificationType } from '@horaires/shared-types';
import { colors } from '@horaires/ui-tokens';
import { fonts } from '../theme';
import { useNotifications } from '../services/Notifications';
import { withPressedFeedback } from '../lib/pressedStyle';

const TYPE_ICONS: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  shift_assigned: 'calendar',
  application_accepted: 'checkmark-circle',
  shift_available: 'flash',
};

// Où mène une notification : son planning pour un shift qui lui est
// attribué, le marché pour un shift à prendre.
const TARGET_TAB: Record<NotificationType, string> = {
  shift_assigned: 'Planning',
  application_accepted: 'Planning',
  shift_available: 'ShiftMarketplace',
};

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Hier';
  if (days < 7) return `Il y a ${days} jours`;
  return new Date(iso).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' });
}

export function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const { items, unreadCount, isLoading, refresh, markRead, markAllRead } = useNotifications();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  };

  const open = (notification: AppNotification) => {
    markRead(notification.id);
    navigation.navigate('Main', { screen: TARGET_TAB[notification.type] });
  };

  const renderItem = ({ item }: { item: AppNotification }) => {
    const unread = !item.readAt;
    return (
      <Pressable
        onPress={() => open(item)}
        style={withPressedFeedback(styles.item, unread && styles.itemUnread)}
        accessibilityRole="button"
        accessibilityLabel={`${unread ? 'Non lue. ' : ''}${item.title}. ${item.body}`}
      >
        <View style={[styles.icon, unread && styles.iconUnread]}>
          <Ionicons name={TYPE_ICONS[item.type]} size={18} color={unread ? colors.surface : colors.primary} />
        </View>
        <View style={styles.itemText}>
          <View style={styles.itemTitleRow}>
            <Text style={[styles.itemTitle, unread && styles.itemTitleUnread]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.itemTime}>{timeAgo(item.createdAt)}</Text>
          </View>
          <Text style={styles.itemBody}>{item.body}</Text>
        </View>
        {unread ? <View style={styles.unreadDot} /> : null}
      </Pressable>
    );
  };

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
        <Text style={styles.title}>Notifications</Text>
        {unreadCount > 0 ? (
          <Pressable onPress={markAllRead} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.markAll}>Tout lire</Text>
          </Pressable>
        ) : (
          <View style={styles.markAllPlaceholder} />
        )}
      </View>

      {isLoading && items.length === 0 ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="notifications-outline" size={28} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Aucune notification</Text>
              <Text style={styles.emptyText}>
                Vous serez prévenu ici quand un shift vous est attribué, quand votre candidature est acceptée ou
                quand un nouveau shift est disponible.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 28, paddingHorizontal: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
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
  title: { flex: 1, fontFamily: fonts.display, fontSize: 24, color: colors.textPrimary, letterSpacing: -0.2 },
  markAll: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.primary },
  markAllPlaceholder: { width: 1 },
  loader: { marginTop: 48 },

  listContent: { paddingTop: 20, paddingBottom: 40, gap: 10 },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  itemUnread: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnread: { backgroundColor: colors.primary },
  itemText: { flex: 1, gap: 3 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemTitle: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 14.5, color: colors.textPrimary },
  itemTitleUnread: { fontFamily: fonts.bodyBold },
  itemTime: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
  itemBody: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textSecondary, lineHeight: 19 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },

  emptyContainer: { flexGrow: 1 },
  emptyState: { alignItems: 'center', paddingVertical: 64, paddingHorizontal: 24 },
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

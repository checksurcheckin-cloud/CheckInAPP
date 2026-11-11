import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '@horaires/ui-tokens';
import { fonts } from '../theme';
import { useNotifications } from '../services/Notifications';
import { withPressedFeedback } from '../lib/pressedStyle';

// Cloche des en-têtes d'écran, à côté de l'avatar — même gabarit (cercle de
// 40) pour que les deux s'alignent. La pastille compte les non-lues.
export function NotificationBell() {
  const navigation = useNavigation<any>();
  const { unreadCount } = useNotifications();
  const label = unreadCount > 0 ? `Notifications, ${unreadCount} non lues` : 'Notifications';

  return (
    <Pressable
      onPress={() => navigation.navigate('Notifications')}
      style={withPressedFeedback(styles.bell)}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      <Ionicons name={unreadCount > 0 ? 'notifications' : 'notifications-outline'} size={20} color={colors.primary} />
      {unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.surface },
});

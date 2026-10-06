import React from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import { useAuth } from '../services/AuthService';
import { fonts } from '../theme';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  manager: 'Manager',
  employee: 'Employé',
};

function initials(firstName?: string, lastName?: string) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
}

export function ProfileScreen() {
  const { user, logout } = useAuth();

  const confirmLogout = () => {
    Alert.alert('Se déconnecter', 'Voulez-vous vraiment vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profil</Text>

      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(user?.firstName, user?.lastName)}</Text>
        </View>
        <Text style={styles.name}>
          {user?.firstName} {user?.lastName}
        </Text>
        <Text style={styles.email}>{user?.email}</Text>
        {user?.role ? (
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>{ROLE_LABELS[user.role] ?? user.role}</Text>
          </View>
        ) : null}
      </View>

      <Pressable style={styles.logoutBtn} onPress={confirmLogout}>
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Text style={styles.logoutBtnText}>Se déconnecter</Text>
      </Pressable>

      <View style={styles.navSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 28, paddingHorizontal: 24 },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.textPrimary, letterSpacing: -0.2 },

  card: {
    marginTop: 24,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingVertical: 32,
    alignItems: 'center',
    ...nativeShadow.sm,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  avatarText: { fontFamily: fonts.display, fontSize: 26, color: colors.primary },
  name: { fontFamily: fonts.displaySemiBold, fontSize: typography.sizes.lg, color: colors.textPrimary, marginTop: spacing.md },
  email: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: 2 },
  roleBadge: {
    marginTop: spacing.md,
    backgroundColor: colors.primaryTint,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  logoutBtn: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  logoutBtnText: { color: colors.danger, fontWeight: '700', fontSize: typography.sizes.md },

  navSpacer: { height: 90 },
});

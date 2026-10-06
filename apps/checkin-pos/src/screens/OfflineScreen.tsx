import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import { useDeviceAuth } from '../services/DeviceAuthService';
import { withPressedFeedback } from '../lib/pressedStyle';

// Le kiosk est appairé mais le dernier rafraîchissement du token a échoué
// pour une raison réseau/serveur (pas un rejet d'identifiants — voir
// DeviceAuthService.refreshOrHandleFailure). On garde les identifiants et on
// laisse retenter, plutôt que de forcer un ré-appairage.
export function OfflineScreen() {
  const { retry } = useDeviceAuth();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Connexion au serveur impossible</Text>
        <Text style={styles.subtitle}>Vérifiez le réseau du terminal, puis réessayez.</Text>
        <Pressable style={withPressedFeedback(styles.button)} onPress={() => void retry()}>
          <Text style={styles.buttonText}>Réessayer</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    ...nativeShadow.md,
  },
  title: { fontSize: typography.sizes.xl, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  subtitle: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    ...nativeShadow.sm,
  },
  buttonText: { color: colors.surface, fontWeight: '600', fontSize: typography.sizes.md },
});

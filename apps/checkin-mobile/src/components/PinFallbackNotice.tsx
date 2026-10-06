import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '@horaires/ui-tokens';

type Props = { onClose: () => void };

// Le pointage par PIN/badge est toujours géré par le terminal du site
// (SiteDevice, authentifié en tant qu'appareil — voir CLAUDE.md), jamais
// par le téléphone : ce panneau est donc informatif, pas un vrai clavier
// PIN fonctionnel — il n'y a rien à envoyer depuis un téléphone qui n'a
// pas de réseau.
export function PinFallbackNotice({ onClose }: Props) {
  return (
    <View style={styles.banner}>
      <View style={styles.iconWrap}>
        <Ionicons name="wifi-outline" size={18} color={colors.textPrimary} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>Connexion indisponible</Text>
        <Text style={styles.text}>
          Identifiez-vous directement sur la tablette du site avec votre badge ou votre code PIN.
        </Text>
      </View>
      <Pressable onPress={onClose} hitSlop={8}>
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warningTint,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.sm + 4,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: { fontSize: typography.sizes.sm, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  text: { fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 },
});

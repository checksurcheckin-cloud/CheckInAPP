import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@horaires/ui-tokens';

type Props = { kind: 'success' | 'error'; message: string };

export function ConfirmationBanner({ kind, message }: Props) {
  return (
    <View style={[styles.container, kind === 'success' ? styles.success : styles.error]}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  success: { backgroundColor: colors.success },
  error: { backgroundColor: colors.danger },
  text: { color: colors.surface, fontWeight: '600', fontSize: typography.sizes.md, textAlign: 'center' },
});

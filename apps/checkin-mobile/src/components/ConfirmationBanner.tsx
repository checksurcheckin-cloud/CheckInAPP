import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@horaires/ui-tokens';

// Durée d'affichage d'un message de confirmation ou d'erreur avant qu'il ne
// disparaisse de lui-même.
const AUTO_HIDE_MS = 5000;

type Props = { kind: 'success' | 'error'; message: string; onHide: () => void };

// Le parent garde la main sur le contenu ; la bannière lui demande seulement
// de la retirer au bout de 5 s. Un nouveau message relance le délai.
export function ConfirmationBanner({ kind, message, onHide }: Props) {
  useEffect(() => {
    const timer = setTimeout(onHide, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
    // onHide est souvent une fonction recréée à chaque rendu : seul un
    // nouveau message doit relancer le délai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, message]);

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

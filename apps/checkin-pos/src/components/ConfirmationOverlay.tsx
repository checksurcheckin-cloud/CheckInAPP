import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { colors, spacing, typography, radius, nativeShadow } from '@horaires/ui-tokens';

type Props =
  | { kind: 'clock'; type: 'clock_in' | 'clock_out'; name: string; time: string; style?: StyleProp<ViewStyle> }
  | { kind: 'error'; message: string; style?: StyleProp<ViewStyle> };

// Feedback plein écran après un scan/PIN — jamais un simple changement de
// texte brutal (cahier des charges) : léger zoom + fondu à l'arrivée. Pas de
// react-native-reanimated ici (a déjà cassé Expo Go ailleurs dans ce
// monorepo) — l'API Animated du cœur de React Native suffit pour ce geste.
export function ConfirmationOverlay(props: Props) {
  const scale = useRef(new Animated.Value(0.88)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 90 }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [scale, opacity]);

  const isError = props.kind === 'error';

  return (
    <Animated.View
      style={[
        styles.container,
        isError ? styles.error : styles.success,
        { opacity, transform: [{ scale }] },
        props.style,
      ]}
    >
      <View style={styles.badge}>
        <Text style={[styles.badgeIcon, { color: isError ? colors.danger : colors.success }]}>
          {isError ? '✕' : '✓'}
        </Text>
      </View>

      {props.kind === 'clock' ? (
        <>
          <Text style={styles.title}>{props.type === 'clock_in' ? 'Bienvenue' : 'Au revoir'}</Text>
          <Text style={styles.subtitle}>{props.name}</Text>
          <Text style={styles.time}>
            {props.type === 'clock_in' ? 'Arrivée enregistrée à ' : 'Départ enregistré à '}
            {props.time}
          </Text>
        </>
      ) : (
        <Text style={styles.title}>{props.message}</Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: radius.lg,
  },
  success: { backgroundColor: colors.success },
  error: { backgroundColor: colors.danger },
  badge: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...nativeShadow.lg,
  },
  badgeIcon: { fontSize: 44, fontWeight: '700' },
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.surface,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.sizes.xl,
    fontWeight: '600',
    color: colors.surface,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  time: {
    fontSize: typography.sizes.md,
    color: colors.surface,
    opacity: 0.9,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});

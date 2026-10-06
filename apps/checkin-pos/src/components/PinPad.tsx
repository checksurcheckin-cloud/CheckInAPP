import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import { withPressedFeedback } from '../lib/pressedStyle';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

type Props = {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
};

export function PinPad({ value, onChange, maxLength = 6, disabled = false }: Props) {
  const handleKey = (key: string) => {
    if (disabled) return;
    if (key === '⌫') {
      onChange(value.slice(0, -1));
    } else if (key && value.length < maxLength) {
      onChange(value + key);
    }
  };

  return (
    <View>
      <View style={styles.dots}>
        {Array.from({ length: maxLength }).map((_, i) => (
          <View key={i} style={[styles.dot, i < value.length && styles.dotFilled]} />
        ))}
      </View>
      <View style={styles.keypad}>
        {KEYS.map((key, i) => (
          <Pressable
            key={i}
            style={withPressedFeedback(styles.key, !key && styles.keyEmpty)}
            disabled={!key || disabled}
            onPress={() => handleKey(key)}
          >
            <Text style={styles.keyText}>{key}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.border,
  },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 280,
    alignSelf: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  key: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    ...nativeShadow.sm,
  },
  keyEmpty: { backgroundColor: 'transparent', borderWidth: 0, elevation: 0, shadowOpacity: 0 },
  keyText: { fontSize: typography.sizes.xl, color: colors.textPrimary, fontWeight: '600' },
});

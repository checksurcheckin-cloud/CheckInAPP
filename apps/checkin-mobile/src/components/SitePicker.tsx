import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@horaires/ui-tokens';
import type { Site } from '@horaires/shared-types';
import { withPressedFeedback } from '../lib/pressedStyle';

type Props = {
  sites: Site[];
  selectedSiteId: string | null;
  onSelect: (siteId: string) => void;
};

export function SitePicker({ sites, selectedSiteId, onSelect }: Props) {
  if (sites.length <= 1) return null;

  return (
    <View style={styles.row}>
      {sites.map((site) => (
        <Pressable
          key={site.id}
          style={withPressedFeedback(styles.chip, selectedSiteId === site.id && styles.chipSelected)}
          onPress={() => onSelect(site.id)}
        >
          <Text style={[styles.chipText, selectedSiteId === site.id && styles.chipTextSelected]}>
            {site.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textPrimary, fontSize: typography.sizes.sm },
  chipTextSelected: { color: colors.surface, fontWeight: '600' },
});

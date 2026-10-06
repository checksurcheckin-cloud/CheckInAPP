import React from 'react';
import { colors, spacing, radius, typography } from '@horaires/ui-tokens';
import type { Site } from '@horaires/shared-types';

type Props = {
  sites: Site[];
  value: string | null;
  onChange: (siteId: string) => void;
};

export function SiteSelect({ sites, value, onChange }: Props) {
  return (
    <select style={styles.select} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {sites.map((site) => (
        <option key={site.id} value={site.id}>
          {site.name}
        </option>
      ))}
    </select>
  );
}

const styles: Record<string, React.CSSProperties> = {
  select: {
    padding: spacing.sm,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    fontSize: typography.sizes.md,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
};

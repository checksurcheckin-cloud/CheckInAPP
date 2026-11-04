import React from 'react';
import { colors, spacing, radius, typography } from '@horaires/ui-tokens';
import type { Site } from '@horaires/shared-types';

type Props = {
  sites: Site[];
  value: string | null;
  onChange: (siteId: string) => void;
  // Option en tête de liste (valeur ''), ex. « Tous les magasins ».
  allOptionLabel?: string;
  // Options en fin de liste, ex. { value: 'none', label: 'Sans magasin' }.
  extraOptions?: { value: string; label: string }[];
};

export function SiteSelect({ sites, value, onChange, allOptionLabel, extraOptions }: Props) {
  return (
    <select style={styles.select} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {allOptionLabel ? <option value="">{allOptionLabel}</option> : null}
      {sites.map((site) => (
        <option key={site.id} value={site.id}>
          {site.name}
        </option>
      ))}
      {extraOptions?.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
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

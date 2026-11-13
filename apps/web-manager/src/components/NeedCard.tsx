import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { colors, spacing, radius, typography, shadows, shiftPalette } from '@horaires/ui-tokens';
import type { StaffingNeedLine } from '@horaires/shared-types';
import { DRAG_CURSOR, DRAG_CURSOR_ACTIVE } from '../lib/cursors';
import { durationMinutesFromTimeRange, formatDurationLabel } from '../lib/date';

type Props = {
  // Date du besoin (YYYY-MM-DD) : la carte ne se dépose que dans cette colonne.
  date: string;
  index: number;
  need: StaffingNeedLine;
  // Shifts déjà planifiés sur ce besoin ce jour-là.
  taken: number;
};

// Mode « selon les besoins » (décision #40) : un besoin du jour défini par
// l'admin, à glisser sur un employé (ou sur « Shifts disponibles »). Même
// glisser-déposer qu'un modèle de shift ; plus déplaçable une fois complet.
export function NeedCard({ date, index, need, taken }: Props) {
  const [isPressed, setIsPressed] = useState(false);
  const remaining = Math.max(0, need.count - taken);
  const full = remaining === 0;
  const palette = shiftPalette[index % shiftPalette.length];
  const minutes = durationMinutesFromTimeRange(need.startTime, need.endTime);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `need-${date}-${index}`,
    data: {
      type: 'template',
      templateId: `need-${date}-${index}`,
      startTime: need.startTime,
      endTime: need.endTime,
      roleNeeded: need.roleNeeded ?? undefined,
      needDate: date,
    },
    disabled: full,
  });

  const squeezed = isPressed || isDragging;
  const translate = transform ? CSS.Translate.toString(transform) : '';

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onPointerDown={(e) => {
        setIsPressed(true);
        listeners?.onPointerDown?.(e);
      }}
      onPointerUp={() => setIsPressed(false)}
      onPointerCancel={() => setIsPressed(false)}
      title={full ? 'Besoin couvert' : 'Glisser sur un employé de cette date pour planifier ce besoin'}
      style={{
        ...styles.card,
        backgroundColor: full ? colors.background : palette.bg,
        border: full ? `1px dashed ${colors.border}` : '1px solid transparent',
        transform: `${translate} scale(${squeezed ? 0.96 : 1})`.trim(),
        transition: isDragging ? undefined : 'transform 0.15s ease',
        opacity: isDragging ? 0.4 : full ? 0.6 : 1,
        boxShadow: isDragging ? shadows.md : 'none',
        zIndex: isDragging ? 10 : undefined,
        cursor: full ? 'default' : squeezed ? DRAG_CURSOR_ACTIVE : DRAG_CURSOR,
      }}
    >
      <span style={{ ...styles.time, color: full ? colors.textSecondary : palette.text }}>
        {need.startTime} - {need.endTime}
      </span>
      <span style={{ ...styles.duration, color: full ? colors.textSecondary : palette.text }}>
        {formatDurationLabel(minutes)}
        {need.roleNeeded ? ` · ${need.roleNeeded}` : ''}
      </span>
      <span style={{ ...styles.count, color: full ? colors.success : palette.text }}>
        {full ? `Complet (${need.count}/${need.count})` : `${remaining} restant${remaining > 1 ? 's' : ''} sur ${need.count}`}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    touchAction: 'none',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: radius.md,
    padding: spacing.sm,
    width: 150,
    flexShrink: 0,
  },
  time: { fontSize: typography.sizes.sm, fontWeight: 700, lineHeight: 1.3 },
  duration: { fontSize: typography.sizes.xs, fontWeight: 600, opacity: 0.85 },
  count: { fontSize: 11, fontWeight: 700, marginTop: 4 },
};

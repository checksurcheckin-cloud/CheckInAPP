import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { X } from 'lucide-react';
import { colors, spacing, radius, typography, shadows, shiftPalette } from '@horaires/ui-tokens';
import { DRAG_CURSOR, DRAG_CURSOR_ACTIVE } from '../lib/cursors';
import { durationMinutesFromTimeRange, formatDurationLabel } from '../lib/date';
import type { ShiftTemplate } from '../lib/shiftTemplates';

type Props = { template: ShiftTemplate; onDelete: (id: string) => void };

// Carte "sans date" glissée depuis la bibliothèque de modèles vers une
// cellule de la grille (PlanningPage) pour y créer un vrai shift daté.
export function ShiftTemplateCard({ template, onDelete }: Props) {
  const [isPressed, setIsPressed] = useState(false);
  // Couleur attribuée une fois à la création du modèle (voir
  // nextAvailablePaletteIndex) — jamais dérivée d'un hash de l'id, pour
  // garantir l'absence de collision avec un autre modèle existant tant qu'il
  // reste une teinte libre.
  const palette = shiftPalette[template.paletteIndex % shiftPalette.length];
  const minutes = durationMinutesFromTimeRange(template.startTime, template.endTime);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `template-${template.id}`,
    data: {
      type: 'template',
      templateId: template.id,
      startTime: template.startTime,
      endTime: template.endTime,
      roleNeeded: template.roleNeeded,
    },
  });

  const squeezed = isPressed || isDragging;
  const translate = transform ? CSS.Translate.toString(transform) : '';

  return (
    <div
      ref={setNodeRef}
      style={{
        ...styles.card,
        backgroundColor: palette.bg,
        transform: `${translate} scale(${squeezed ? 0.96 : 1})`.trim(),
        transition: isDragging ? undefined : 'transform 0.15s ease',
        opacity: isDragging ? 0.4 : 1,
        boxShadow: isDragging ? shadows.md : 'none',
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      <div
        {...listeners}
        {...attributes}
        onPointerDown={(e) => {
          setIsPressed(true);
          listeners?.onPointerDown?.(e);
        }}
        onPointerUp={() => setIsPressed(false)}
        onPointerCancel={() => setIsPressed(false)}
        style={{ ...styles.dragHandle, cursor: squeezed ? DRAG_CURSOR_ACTIVE : DRAG_CURSOR }}
        title="Glisser sur le planning pour créer ce shift à une date"
      >
        <span style={{ ...styles.time, color: palette.text }}>
          {template.startTime} - {template.endTime}
        </span>
        <span style={{ ...styles.duration, color: palette.text }}>{formatDurationLabel(minutes)}</span>
        {template.roleNeeded ? <span style={{ ...styles.role, color: palette.text }}>{template.roleNeeded}</span> : null}
      </div>

      <button
        className="btn btn-icon"
        style={styles.deleteButton}
        onClick={() => onDelete(template.id)}
        title="Retirer ce modèle"
      >
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    position: 'relative',
    borderRadius: radius.md,
    padding: `${spacing.sm}px ${spacing.sm}px`,
    width: 132,
    flexShrink: 0,
  },
  dragHandle: { touchAction: 'none', paddingRight: spacing.lg, display: 'flex', flexDirection: 'column' },
  time: { fontSize: typography.sizes.sm, fontWeight: 700, display: 'block', lineHeight: 1.3 },
  duration: { fontSize: typography.sizes.xs, fontWeight: 600, opacity: 0.85 },
  role: { fontSize: 11, opacity: 0.75, marginTop: 2 },
  deleteButton: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 18,
    height: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    borderRadius: radius.full,
    border: 'none',
    backgroundColor: 'transparent',
    color: colors.textSecondary,
    cursor: 'pointer',
  },
};

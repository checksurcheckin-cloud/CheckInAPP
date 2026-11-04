import React, { useEffect, useRef, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Copy, Lock, Megaphone, Send, X } from 'lucide-react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { Shift } from '@horaires/shared-types';
import { DRAG_CURSOR, DRAG_CURSOR_ACTIVE } from '../lib/cursors';
import { durationMinutes, formatDurationLabel, isEnded } from '../lib/date';
import { marketScopeLabel } from './MarketProposalDialog';

type Props = {
  shift: Shift;
  // Couleur résolue par PlanningPage (voir lib/shiftColor.ts,
  // resolveShiftColors) — mémorisée par shift id, pas recalculée ici, pour
  // qu'un shift garde toujours la même couleur au lieu d'un hash qui pouvait
  // coïncider avec un autre shift du même jour.
  palette: { bg: string; text: string };
  onDelete: (id: string) => void;
  onDuplicate: (shift: Shift) => void;
  // Ligne « Shifts disponibles » : choisir à qui le créneau est proposé sur
  // le marché (décision #33). L'assignation directe se fait par
  // glisser-déposer sur la ligne d'un employé.
  onProposeOnMarket: (shift: Shift) => void;
  // Magasin consulté hors périmètre du manager (décision #36) : carte
  // visible mais figée, comme un shift terminé.
  readOnly?: boolean;
  onEdit: (shift: Shift) => void;
  onPublish: (shiftId: string) => void;
  busy: boolean;
};

// Toute la carte est la poignée de glisser-déposer : on la lâche sur une
// cellule (employé x jour) de PlanningGrid pour l'assigner et/ou la
// déplacer de jour. La carte n'est plus elle-même une zone de dépôt — ça,
// c'est le rôle des cellules (voir PlanningGridCell).
//
// Un shift créé (voir PlanningPage.placeTemplate) démarre en brouillon —
// visible et modifiable par le manager, invisible pour l'employé assigné
// tant qu'il n'est pas publié (voir ShiftsService.findAll côté backend).
// Bordure en tirets + étiquette "Brouillon" tant qu'il n'est pas publié.
export function ShiftCard({
  shift,
  palette,
  onDelete,
  onDuplicate,
  onProposeOnMarket,
  readOnly = false,
  onEdit,
  onPublish,
  busy,
}: Props) {
  const hasAssignment = (shift.assignments ?? []).length > 0;
  const isDraft = shift.status === 'draft';
  // Shift terminé = historique figé (décision #32) : plus déplaçable,
  // assignable, publiable ni supprimable — le backend le refuserait en 409.
  const ended = isEnded(shift.endsAt);
  const locked = ended || readOnly;
  const [isPressed, setIsPressed] = useState(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `shift-${shift.id}`,
    data: { type: 'shift', shiftId: shift.id, startsAt: shift.startsAt, endsAt: shift.endsAt },
    disabled: locked,
  });

  // Un clic ouvre l'édition, mais seulement s'il n'y a pas eu de glisser
  // entre-temps (pas de conflit entre les deux gestes).
  const draggedRef = useRef(false);
  useEffect(() => {
    if (isDragging) draggedRef.current = true;
  }, [isDragging]);

  const squeezed = isPressed || isDragging;
  const translate = transform ? CSS.Translate.toString(transform) : '';
  const minutes = durationMinutes(shift.startsAt, shift.endsAt);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...styles.card,
        backgroundColor: palette.bg,
        border: isDraft ? `1.5px dashed ${colors.textSecondary}` : 'none',
        transform: `${translate} scale(${squeezed ? 0.96 : 1})`.trim(),
        transition: isDragging ? undefined : 'transform 0.15s ease',
        opacity: isDragging ? 0.4 : ended ? 0.6 : 1,
        boxShadow: isDragging ? shadows.md : 'none',
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      <div
        {...listeners}
        {...attributes}
        onPointerDown={(e) => {
          setIsPressed(true);
          draggedRef.current = false;
          listeners?.onPointerDown?.(e);
        }}
        onPointerUp={() => {
          setIsPressed(false);
          if (!locked && !draggedRef.current) {
            onEdit(shift);
          }
        }}
        onPointerCancel={() => setIsPressed(false)}
        style={{ ...styles.dragHandle, cursor: locked ? 'default' : squeezed ? DRAG_CURSOR_ACTIVE : DRAG_CURSOR }}
        title={
          ended
            ? 'Shift terminé : il ne peut plus être modifié'
            : readOnly
              ? "Lecture seule : ce magasin ne fait pas partie des vôtres"
              : 'Cliquer pour modifier, glisser pour déplacer/assigner'
        }
      >
        {ended ? (
          <span style={styles.draftTag}>
            <Lock size={9} strokeWidth={2.5} style={{ marginRight: 3, verticalAlign: -1 }} />
            Terminé
          </span>
        ) : isDraft ? (
          <span style={styles.draftTag}>Brouillon</span>
        ) : null}
        <span style={{ ...styles.time, color: palette.text }}>
          {new Date(shift.startsAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
          {' - '}
          {new Date(shift.endsAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span style={{ ...styles.duration, color: palette.text }}>{formatDurationLabel(minutes)}</span>
        {shift.roleNeeded ? <span style={{ ...styles.role, color: palette.text }}>{shift.roleNeeded}</span> : null}
      </div>

      {!locked && !hasAssignment ? (
        <button
          type="button"
          className="btn"
          style={styles.marketButton}
          disabled={busy}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onProposeOnMarket(shift)}
          title={
            isDraft
              ? 'Choisir à qui proposer ce créneau (le publie)'
              : 'Choisir à qui ce créneau est proposé sur le marché'
          }
        >
          <Megaphone size={11} strokeWidth={2.25} />
          <span style={styles.marketButtonText}>{isDraft ? 'Proposer' : `Marché : ${marketScopeLabel(shift)}`}</span>
        </button>
      ) : null}

      {locked ? null : (
      <div style={styles.cardActions}>
        {isDraft ? (
          <button
            className="btn btn-icon"
            style={styles.iconButton}
            disabled={busy}
            onClick={() => onPublish(shift.id)}
            title="Publier ce shift (visible par l'employé assigné)"
          >
            <Send size={12} strokeWidth={2} />
          </button>
        ) : null}
        <button
          className="btn btn-icon"
          style={styles.iconButton}
          disabled={busy}
          onClick={() => onDuplicate(shift)}
          title="Dupliquer ce shift"
        >
          <Copy size={12} strokeWidth={2} />
        </button>
        <button
          className="btn btn-icon"
          style={styles.iconButton}
          disabled={busy}
          onClick={() => onDelete(shift.id)}
          title="Supprimer ce shift"
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    position: 'relative',
    borderRadius: radius.md,
    padding: `${spacing.sm}px ${spacing.sm}px`,
    marginBottom: spacing.xs,
  },
  dragHandle: { touchAction: 'none', paddingRight: spacing.lg, display: 'flex', flexDirection: 'column' },
  draftTag: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  time: { fontSize: typography.sizes.sm, fontWeight: 700, display: 'block', lineHeight: 1.3 },
  duration: { fontSize: typography.sizes.xs, fontWeight: 600, opacity: 0.85 },
  role: { fontSize: 11, opacity: 0.75, marginTop: 2 },
  marketButton: {
    marginTop: spacing.xs,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 6px',
    borderRadius: radius.sm,
    border: 'none',
    color: colors.textSecondary,
    backgroundColor: colors.surface,
    cursor: 'pointer',
  },
  marketButtonText: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardActions: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    display: 'flex',
    gap: 2,
  },
  iconButton: {
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
    fontSize: typography.sizes.xs,
  },
};

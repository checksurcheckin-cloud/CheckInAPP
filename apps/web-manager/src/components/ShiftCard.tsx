import React, { useEffect, useRef, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Copy, Send, X } from 'lucide-react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { Availability, Shift, User } from '@horaires/shared-types';
import { DRAG_CURSOR, DRAG_CURSOR_ACTIVE } from '../lib/cursors';
import { durationMinutes, formatDurationLabel } from '../lib/date';
import { isEmployeeAvailableForShift } from '../lib/availability';

type Props = {
  shift: Shift;
  // Couleur résolue par PlanningPage (voir lib/shiftColor.ts,
  // resolveShiftColors) — mémorisée par shift id, pas recalculée ici, pour
  // qu'un shift garde toujours la même couleur au lieu d'un hash qui pouvait
  // coïncider avec un autre shift du même jour.
  palette: { bg: string; text: string };
  employees: User[];
  availabilities: Availability[];
  // Tous les shifts de ce jour, n'importe quel employé, assignés ou non —
  // sert à exclure du sélecteur un employé déjà occupé ce jour-là (voir
  // assignableEmployees), pas seulement en cas de chevauchement horaire.
  dayShifts: Shift[];
  onDelete: (id: string) => void;
  onDuplicate: (shift: Shift) => void;
  onAssign: (shiftId: string, userId: string) => void;
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
  employees,
  availabilities,
  dayShifts,
  onDelete,
  onDuplicate,
  onAssign,
  onEdit,
  onPublish,
  busy,
}: Props) {
  const hasAssignment = (shift.assignments ?? []).length > 0;
  const isDraft = shift.status === 'draft';
  const [isPressed, setIsPressed] = useState(false);

  // Employés déjà occupés ce jour-là (n'importe quel autre shift, assigné
  // n'importe quand dans la journée — pas seulement un chevauchement
  // horaire) : on ne les propose pas dans le sélecteur, pour ne pas
  // encourager à leur ajouter un second shift le même jour.
  const employeeIdsBusyToday = new Set(
    dayShifts
      .filter((s) => s.id !== shift.id)
      .flatMap((s) => (s.assignments ?? []).filter((a) => a.status !== 'cancelled').map((a) => a.userId)),
  );

  // Ne propose que les employés réellement disponibles sur CE créneau (pas
  // juste "quelque part ce jour-là") — sinon le sélecteur laisse choisir un
  // employé que ShiftsService.assign refuserait de toute façon en 409.
  const assignableEmployees = employees.filter(
    (e) =>
      !employeeIdsBusyToday.has(e.id) &&
      isEmployeeAvailableForShift(availabilities, e.id, new Date(shift.startsAt), new Date(shift.endsAt)),
  );

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `shift-${shift.id}`,
    data: { type: 'shift', shiftId: shift.id, startsAt: shift.startsAt, endsAt: shift.endsAt },
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
          draggedRef.current = false;
          listeners?.onPointerDown?.(e);
        }}
        onPointerUp={() => {
          setIsPressed(false);
          if (!draggedRef.current) {
            onEdit(shift);
          }
        }}
        onPointerCancel={() => setIsPressed(false)}
        style={{ ...styles.dragHandle, cursor: squeezed ? DRAG_CURSOR_ACTIVE : DRAG_CURSOR }}
        title="Cliquer pour modifier, glisser pour déplacer/assigner"
      >
        {isDraft ? <span style={styles.draftTag}>Brouillon</span> : null}
        <span style={{ ...styles.time, color: palette.text }}>
          {new Date(shift.startsAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
          {' - '}
          {new Date(shift.endsAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span style={{ ...styles.duration, color: palette.text }}>{formatDurationLabel(minutes)}</span>
        {shift.roleNeeded ? <span style={{ ...styles.role, color: palette.text }}>{shift.roleNeeded}</span> : null}
      </div>

      {!hasAssignment && assignableEmployees.length > 0 ? (
        <select
          style={styles.assignSelect}
          disabled={busy}
          value=""
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => e.target.value && onAssign(shift.id, e.target.value)}
        >
          <option value="">+ Assigner…</option>
          {assignableEmployees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.firstName} {e.lastName}
            </option>
          ))}
        </select>
      ) : null}

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
  assignSelect: {
    marginTop: spacing.xs,
    width: '100%',
    fontSize: 11,
    padding: 3,
    borderRadius: radius.sm,
    border: `1px solid ${colors.surface}`,
    color: colors.textSecondary,
    backgroundColor: colors.surface,
  },
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

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Ban } from 'lucide-react';
import { colors, spacing, radius, typography } from '@horaires/ui-tokens';
import type { Availability, Shift, User } from '@horaires/shared-types';
import { combineDateAndTime, durationMinutesFromTimeRange, fractionOfDay } from '../lib/date';
import { isEmployeeAvailableForShift, type UnavailabilityInfo } from '../lib/availability';
import { ShiftCard } from './ShiftCard';

type Props = {
  date: Date;
  employeeId: string | null; // null = ligne "Shifts disponibles" (pool non assigné)
  shifts: Shift[];
  // Tous les shifts de ce jour (assignés ou non, n'importe quel employé) —
  // sert uniquement à filtrer le sélecteur d'assignation des cartes de cette
  // cellule (voir ShiftCard : un employé déjà occupé ce jour-là n'y apparaît
  // pas), sans rapport avec `shifts` qui ne contient que le contenu affiché.
  dayShifts: Shift[];
  employees: User[];
  availabilities: Availability[];
  // Résolu par PlanningPage (lib/shiftColor.ts, resolveShiftColors) — un
  // shift garde toujours la même couleur, jamais recalculée ici.
  getShiftPalette: (shiftId: string) => { bg: string; text: string };
  onDeleteShift: (id: string) => void;
  onDuplicateShift: (shift: Shift) => void;
  onAssign: (shiftId: string, userId: string) => void;
  onEditShift: (shift: Shift) => void;
  onPublishShift: (shiftId: string) => void;
  busyId: string | null;
  // Non-null seulement quand on glisse un shift qui a déjà un titulaire —
  // ce titulaire est alors le seul employé sur lequel la dépose reste
  // valide (pas de ré-assignation, le backend ne l'expose pas). Un modèle
  // ou un shift encore non assigné n'a pas cette contrainte.
  blockedAssigneeId: string | null;
  // Horaire (HH:mm) de l'élément en cours de glisser-déposer, indépendant de
  // sa date d'origine — recombiné avec la date de CETTE cellule pour savoir
  // si l'employé de la ligne est réellement disponible pour CE créneau précis
  // ce jour-là (une indisponibilité partielle ne bloque pas toute la
  // journée, voir lib/availability.ts).
  draggedTimeRange: { startTime: string; endTime: string } | null;
  // Indisponibilité déclarée de l'employé de cette ligne pour ce jour —
  // uniquement pour l'affichage (fond + étiquette), voir lib/availability.ts.
  unavailabilityInfo?: UnavailabilityInfo;
  mint?: boolean;
};

// Cellule (employé x jour), ou (pool x jour) sur la ligne "Shifts
// disponibles". Zone de dépôt pour un shift ou un modèle glissé — voir
// PlanningPage.moveShift / placeTemplate pour la sémantique exacte.
export function PlanningGridCell({
  date,
  employeeId,
  shifts,
  dayShifts,
  employees,
  availabilities,
  getShiftPalette,
  onDeleteShift,
  onDuplicateShift,
  onAssign,
  onEditShift,
  onPublishShift,
  busyId,
  blockedAssigneeId,
  draggedTimeRange,
  unavailabilityInfo = { kind: 'none' },
  mint,
}: Props) {
  // Contrairement à l'étiquette affichée (qui reflète l'indisponibilité
  // déclarée telle quelle), la dépose n'est bloquée que si l'élément
  // effectivement glissé chevauche cette indisponibilité CE jour-là — une
  // indisponibilité partielle ("à partir de 18h") n'empêche pas de déposer
  // un shift du matin. Voir isEmployeeAvailableForShift, le même calcul que
  // ShiftCard utilise pour son sélecteur d'assignation.
  const draggedOverlapsUnavailability =
    employeeId !== null &&
    draggedTimeRange !== null &&
    (() => {
      const startsAt = combineDateAndTime(date, draggedTimeRange.startTime);
      const minutes = durationMinutesFromTimeRange(draggedTimeRange.startTime, draggedTimeRange.endTime);
      const endsAt = new Date(startsAt.getTime() + minutes * 60000);
      return !isEmployeeAvailableForShift(availabilities, employeeId, startsAt, endsAt);
    })();

  const disabled = Boolean(
    (blockedAssigneeId !== null && blockedAssigneeId !== employeeId) || draggedOverlapsUnavailability,
  );

  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${employeeId ?? 'pool'}-${date.toISOString()}`,
    data: { type: 'cell', date: date.toISOString(), employeeId },
    disabled,
  });

  const showHoverTint = isOver && !disabled;
  const backgroundColor =
    showHoverTint ? colors.primaryTint : unavailabilityInfo.kind === 'full' ? UNAVAILABLE_BG : mint ? colors.accentTint : colors.surface;
  const backgroundImage = showHoverTint ? undefined : partialGradient(unavailabilityInfo);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...styles.cell,
        backgroundColor,
        backgroundImage,
      }}
    >
      {unavailabilityInfo.kind !== 'none' ? (
        <span style={styles.unavailableTag} title={unavailabilityLabel(unavailabilityInfo)}>
          <Ban size={11} strokeWidth={2.5} />
          {unavailabilityLabel(unavailabilityInfo)}
        </span>
      ) : null}
      {shifts.map((shift) => (
        <ShiftCard
          key={shift.id}
          shift={shift}
          palette={getShiftPalette(shift.id)}
          employees={employees}
          availabilities={availabilities}
          dayShifts={dayShifts}
          onDelete={onDeleteShift}
          onDuplicate={onDuplicateShift}
          onAssign={onAssign}
          onEdit={onEditShift}
          onPublish={onPublishShift}
          busy={busyId === shift.id}
        />
      ))}
    </div>
  );
}

const UNAVAILABLE_BG = '#FEF2F2';

function unavailabilityLabel(info: UnavailabilityInfo): string {
  switch (info.kind) {
    case 'full':
      return 'Indisponible';
    case 'from':
      return `Indisponible dès ${info.time}`;
    case 'until':
      return `Indisponible jusqu'à ${info.time}`;
    default:
      return '';
  }
}

// Teinte proportionnelle à la portion de journée bloquée, en dégradé
// horizontal (gauche = 00:00, droite = 24:00) — une "mini timeline" dans la
// cellule plutôt qu'un simple label, pour qu'une indisponibilité partielle
// se distingue visuellement d'un blocage toute la journée (fond plein).
function partialGradient(info: UnavailabilityInfo): string | undefined {
  if (info.kind === 'from') {
    const pct = fractionOfDay(info.time) * 100;
    return `linear-gradient(to right, transparent 0%, transparent ${pct}%, ${UNAVAILABLE_BG} ${pct}%, ${UNAVAILABLE_BG} 100%)`;
  }
  if (info.kind === 'until') {
    const pct = fractionOfDay(info.time) * 100;
    return `linear-gradient(to right, ${UNAVAILABLE_BG} 0%, ${UNAVAILABLE_BG} ${pct}%, transparent ${pct}%, transparent 100%)`;
  }
  return undefined;
}

const styles: Record<string, React.CSSProperties> = {
  cell: {
    padding: spacing.xs,
    minHeight: 64,
    borderRight: `1px solid ${colors.border}`,
    borderBottom: `1px solid ${colors.border}`,
    transition: 'background-color 0.15s ease',
  },
  unavailableTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 11,
    fontWeight: 600,
    color: colors.danger,
    marginBottom: spacing.xs,
  },
};

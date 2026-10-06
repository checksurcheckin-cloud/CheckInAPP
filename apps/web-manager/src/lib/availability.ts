import type { Availability } from '@horaires/shared-types';

// Sentinelle "toute la journée" — voir AvailabilitiesScreen (checkin-mobile) :
// une indisponibilité déclarée sans plage précisée est stockée avec ces
// bornes plutôt qu'un champ nullable, pour rester compatible avec le schema
// existant (startTime/endTime non nullables). Toute autre valeur veut dire
// que l'employé a volontairement restreint son indisponibilité à une plage
// ("Préciser une plage horaire"), et reste disponible en dehors.
const FULL_DAY_START = '00:00';
const FULL_DAY_END = '23:59';

// Même précédence que ShiftsService.ensureAvailable côté backend : une
// disponibilité ponctuelle (specificDate) pour le jour exact prime sur une
// disponibilité récurrente (dayOfWeek, lundi = 0) du même jour.
export function resolveAvailability(availabilities: Availability[], userId: string, date: Date): Availability | undefined {
  const specific = availabilities.find(
    (a) => a.userId === userId && a.specificDate && new Date(a.specificDate).toDateString() === date.toDateString(),
  );
  if (specific) return specific;

  const dayOfWeek = (date.getDay() + 6) % 7;
  return availabilities.find((a) => a.userId === userId && !a.specificDate && a.dayOfWeek === dayOfWeek);
}

// Détail d'une indisponibilité déclarée, pour l'affichage dans la grille :
// - 'none'  : disponible, ou rien de déclaré (voir plus bas pourquoi ce
//             second cas n'est PAS traité comme une indisponibilité ici).
// - 'full'  : toute la journée (sentinelle FULL_DAY_START/END).
// - 'from'  : indisponible à partir de `time` jusqu'à la fin de journée.
// - 'until' : indisponible depuis le début de journée jusqu'à `time`.
export type UnavailabilityInfo =
  | { kind: 'none' }
  | { kind: 'full' }
  | { kind: 'from'; time: string }
  | { kind: 'until'; time: string };

// Un employé n'est marqué indisponible dans la grille que s'il l'a déclaré
// explicitement (isAvailable: false). L'absence totale de déclaration bloque
// aussi l'assignation côté backend (voir ShiftsService.ensureAvailable), mais
// ne veut pas dire la même chose — "pas encore renseigné" plutôt que
// "refusé" — et l'afficher pareil noierait la grille de marquages sur des
// cases sans réelle information (beaucoup de créneaux ne sont jamais
// déclarés) : ce cas retombe donc sur 'none', comme s'il était disponible.
export function getUnavailabilityInfo(availabilities: Availability[], userId: string, date: Date): UnavailabilityInfo {
  const resolved = resolveAvailability(availabilities, userId, date);
  if (!resolved || resolved.isAvailable) return { kind: 'none' };

  const { startTime, endTime } = resolved;
  if (startTime === FULL_DAY_START && endTime === FULL_DAY_END) return { kind: 'full' };
  if (startTime === FULL_DAY_START) return { kind: 'until', time: endTime };
  // endTime === FULL_DAY_END dans le cas normal (produit par l'écran
  // Disponibilités) ; un ancien enregistrement avec les deux bords
  // personnalisés (avant la simplification à un seul bord) retombe ici
  // aussi, sur son bord de début — même convention que côté mobile
  // (describeUnavailableRange).
  return { kind: 'from', time: startTime };
}

function timeOnDate(date: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

// Miroir exact de ShiftsService.ensureAvailable — sert à ne pas proposer,
// dans le sélecteur d'assignation d'une carte de shift, un employé que le
// backend refuserait de toute façon pour CE créneau précis (contrairement à
// isDeclaredUnavailable, qui ne regarde que le jour, pas l'heure du shift).
export function isEmployeeAvailableForShift(
  availabilities: Availability[],
  userId: string,
  startsAt: Date,
  endsAt: Date,
): boolean {
  const dayStart = new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate());
  const resolved = resolveAvailability(availabilities, userId, dayStart);
  // Aucune déclaration == disponible par défaut, voir ShiftsService.ensureAvailable.
  if (!resolved) return true;

  if (resolved.isAvailable) {
    const availStart = timeOnDate(dayStart, resolved.startTime);
    const availEnd = timeOnDate(dayStart, resolved.endTime);
    return startsAt >= availStart && endsAt <= availEnd;
  }

  const isFullDayBlock = resolved.startTime === FULL_DAY_START && resolved.endTime === FULL_DAY_END;
  if (isFullDayBlock) return false;

  const blockStart = timeOnDate(dayStart, resolved.startTime);
  const blockEnd = timeOnDate(dayStart, resolved.endTime);
  const overlapsBlock = startsAt < blockEnd && endsAt > blockStart;
  return !overlapsBlock;
}

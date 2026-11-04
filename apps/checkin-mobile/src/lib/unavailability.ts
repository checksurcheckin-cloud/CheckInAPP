import type { Availability } from '@horaires/shared-types';

// "YYYY-MM-DD" en heure locale — même format que l'écran Disponibilités
// (CreateAvailabilityDto.specificDate).
export function toDateOnlyString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseHhmm(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export type BlockingUnavailability = {
  record: Availability;
  // true = vient de l'indisponibilité récurrente (dayOfWeek), pas d'une
  // exception posée sur ce jour précis.
  isRecurring: boolean;
};

// Indisponibilité déclarée qui empêcherait de prendre ce shift — même règle
// que ShiftsService.ensureAvailable (décision #8) : l'exception du jour
// (specificDate) prime sur la récurrence (dayOfWeek, lundi = 0), et seule une
// ligne `isAvailable: false` qui chevauche l'horaire du shift bloque.
// Calculé en heure locale de l'appareil (employé sur place, même fuseau que
// le site).
export function findBlockingUnavailability(
  availabilities: Availability[],
  startsAtIso: string,
  endsAtIso: string,
): BlockingUnavailability | null {
  const start = new Date(startsAtIso);
  const end = new Date(endsAtIso);
  const dayKey = start.toDateString();
  const weekday = (start.getDay() + 6) % 7;

  const override = availabilities.find((a) => a.specificDate && new Date(a.specificDate).toDateString() === dayKey);
  const recurring = availabilities.find(
    (a) => !a.specificDate && a.dayOfWeek !== undefined && a.dayOfWeek !== null && a.dayOfWeek === weekday,
  );
  const record = override ?? recurring;
  if (!record || record.isAvailable) return null;

  const blockStart = parseHhmm(record.startTime);
  const blockEnd = record.endTime === '23:59' ? 1440 : parseHhmm(record.endTime);
  const startOfDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const shiftStart = start.getHours() * 60 + start.getMinutes();
  // Un shift de nuit garde une fin > 24h plutôt que rembobinée à minuit.
  const shiftEnd = Math.round((end.getTime() - startOfDay) / 60000);

  const overlaps = shiftStart < blockEnd && shiftEnd > blockStart;
  return overlaps ? { record, isRecurring: !override } : null;
}

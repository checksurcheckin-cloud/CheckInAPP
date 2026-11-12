import type { TimeEntry } from '@horaires/shared-types';

export type HistoryDay = {
  key: string; // toDateString() du jour
  date: Date;
  entries: TimeEntry[]; // chronologiques
  workedMs: number;
  // Arrivée sans départ : encore au travail (aujourd'hui) ou départ oublié.
  ongoing: boolean;
  missingClockOut: boolean;
};

// Regroupe les pointages par journée de travail et calcule le temps
// travaillé : de l'arrivée au départ, pauses déduites. Une journée qui passe
// minuit (shift de nuit) reste rattachée au jour de son arrivée.
export function buildHistory(entries: TimeEntry[], now = new Date()): HistoryDay[] {
  const sorted = entries.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const days = new Map<string, HistoryDay>();
  // Session en cours : jour d'arrivée, et reprise du travail (null en pause).
  let session: { day: HistoryDay; resumedAt: number | null } | null = null;

  const dayFor = (date: Date) => {
    const key = date.toDateString();
    let day = days.get(key);
    if (!day) {
      day = {
        key,
        date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        entries: [],
        workedMs: 0,
        ongoing: false,
        missingClockOut: false,
      };
      days.set(key, day);
    }
    return day;
  };

  const closeSession = (at: number | null) => {
    if (!session) return;
    if (at !== null && session.resumedAt !== null) session.day.workedMs += at - session.resumedAt;
    session = null;
  };

  for (const entry of sorted) {
    const at = new Date(entry.timestamp).getTime();
    if (entry.type === 'clock_in') {
      // Arrivée sans départ avant : la session précédente reste incomplète.
      if (session) {
        session.day.missingClockOut = true;
        closeSession(null);
      }
      const day = dayFor(new Date(at));
      day.entries.push(entry);
      session = { day, resumedAt: at };
      continue;
    }

    const day = session?.day ?? dayFor(new Date(at));
    day.entries.push(entry);
    if (!session) continue; // pointage isolé (arrivée le mois précédent…)
    if (entry.type === 'break_start') {
      if (session.resumedAt !== null) session.day.workedMs += at - session.resumedAt;
      session.resumedAt = null;
    } else if (entry.type === 'break_end') {
      session.resumedAt = at;
    } else {
      closeSession(at);
    }
  }

  if (session) {
    const open: { day: HistoryDay; resumedAt: number | null } = session;
    if (open.day.key === now.toDateString()) {
      open.day.ongoing = true;
      if (open.resumedAt !== null) open.day.workedMs += now.getTime() - open.resumedAt;
    } else {
      open.day.missingClockOut = true;
    }
  }

  // Plus récent en premier, comme un relevé.
  return [...days.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
}

// « 7 h 32 », « 45 min ».
export function formatWorked(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${String(minutes).padStart(2, '0')}`;
}

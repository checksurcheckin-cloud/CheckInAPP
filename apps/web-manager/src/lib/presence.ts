import type { PresenceTimeEntry, PresentEmployee, TimeEntryType } from '@horaires/shared-types';

export const ENTRY_LABELS: Record<TimeEntryType, string> = {
  clock_in: 'Arrivée',
  break_start: 'Pause',
  break_end: 'Fin de pause',
  clock_out: 'Départ',
};

export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
}

// Chrono "HH:MM:SS" — affiché en direct sur les cartes (rafraîchi chaque seconde).
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

// Durée lisible "7h05" / "42min" pour les totaux (pas de secondes).
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
}

// Temps de présence (arrivée -> départ, ou -> maintenant si encore là) et
// temps de pause sur les pointages de la journée. Travaillé = présence - pauses.
export function computeDayTotals(entries: PresenceTimeEntry[], now: number): { workedMs: number; breakMs: number } {
  let presenceMs = 0;
  let breakMs = 0;
  let inStart: number | null = null;
  let breakStart: number | null = null;

  for (const entry of entries) {
    const t = new Date(entry.timestamp).getTime();
    switch (entry.type) {
      case 'clock_in':
        inStart = t;
        break;
      case 'clock_out':
        if (inStart !== null) presenceMs += t - inStart;
        if (breakStart !== null) breakMs += t - breakStart;
        inStart = null;
        breakStart = null;
        break;
      case 'break_start':
        breakStart = t;
        break;
      case 'break_end':
        if (breakStart !== null) breakMs += t - breakStart;
        breakStart = null;
        break;
    }
  }
  if (inStart !== null) presenceMs += now - inStart;
  if (breakStart !== null) breakMs += now - breakStart;

  return { workedMs: Math.max(0, presenceMs - breakMs), breakMs };
}

export function lastDeparture(employee: PresentEmployee): string | null {
  const departure = [...employee.entries].reverse().find((e) => e.type === 'clock_out');
  return departure?.timestamp ?? null;
}

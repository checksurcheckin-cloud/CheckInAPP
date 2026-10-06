export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // lundi = premier jour
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Lundi -> Dimanche, dans cet ordre pour matcher startOfWeek (lundi = premier
// jour) — pas l'ordre "Dim..Sam" de Date.getDay().
export const WEEKDAY_LABELS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export function durationMinutes(startsAt: string, endsAt: string): number {
  return Math.max(0, Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000));
}

// "8h" pile, "4h30" sinon — jamais de décimales, ce n'est pas de la
// comptabilité, juste un repère visuel rapide sur la carte/la ligne employé.
export function formatDurationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, '0')}`;
}

// Durée d'un modèle de shift défini seulement par ses heures ("16:00" ->
// "20:00"), sans date. Un écart négatif ou nul signifie un shift de nuit
// qui traverse minuit (ex: 22:00 -> 06:00) — jamais une erreur de saisie,
// on ne valide que l'égalité stricte début/fin ailleurs.
export function durationMinutesFromTimeRange(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : diff + 24 * 60;
}

// Pose une heure "HH:mm" sur un jour donné du calendrier (garde l'année/mois/
// jour de `date`, remplace juste l'heure) — utilisé pour transformer un
// modèle de shift sans date en un vrai `Shift` daté au moment du dépose.
export function combineDateAndTime(date: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

// Inverse de combineDateAndTime : extrait juste l'heure locale "HH:mm" d'un
// ISO daté — utilisé pour ré-associer un shift glissé (qui a déjà une date)
// au jour d'une cellule cible sans perdre son horaire d'origine.
export function toHHmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Position d'une heure "HH:mm" dans la journée, en fraction [0, 1] — sert à
// positionner proportionnellement une plage d'indisponibilité partielle sur
// la largeur d'une cellule de la grille planning (00:00 = 0, 24:00 = 1).
export function fractionOfDay(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h * 60 + m) / (24 * 60);
}

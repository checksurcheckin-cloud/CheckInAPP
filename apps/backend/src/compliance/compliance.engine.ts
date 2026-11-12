import { MINOR_RULES, RuleParams, rulePackFor } from './rule-packs';

// Moteur de conformité du planning : fonctions pures, sans base de données
// (ComplianceService charge les données). Toutes les règles de jour, de
// semaine et de nuit s'évaluent à l'heure LOCALE du site (même principe que
// décision #21), jamais sur l'UTC brut.

export type Severity = 'error' | 'warning' | 'info';

export type ContractKind = 'full_time' | 'part_time' | 'student' | 'flexi_job';

export interface ComplianceEmployee {
  id: string;
  contractType: ContractKind | null;
  weeklyContractHours: number | null;
  birthDate: Date | null;
}

export interface ComplianceShift {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: 'draft' | 'published' | 'cancelled' | string;
  timezone: string;
  jointCommittee: string | null;
}

export interface Violation {
  ruleId: string;
  severity: Severity;
  userId: string;
  shiftIds: string[];
  // Jour local concerné (YYYY-MM-DD) ou lundi de la semaine pour les règles
  // hebdomadaires.
  date: string;
  message: string;
  legalRef: string;
  // La valeur sectorielle utilisée reste à confirmer (rule-packs.ts).
  toValidate?: boolean;
}

export interface CheckInput {
  employee: ComplianceEmployee;
  // Ses shifts actifs (assignations non annulées) sur la période ET une marge
  // autour (repos, semaines entamées) ; toute l'année pour un étudiant.
  shifts: ComplianceShift[];
  // Seules les infractions qui touchent un shift de cette période sont
  // renvoyées.
  window: { from: Date; to: Date };
  now: Date;
}

const HOUR = 3_600_000;
const DAY_MINUTES = 1440;

interface Local {
  shift: ComplianceShift;
  day: string; // YYYY-MM-DD local du début
  weekday: number; // lundi = 0
  startMinutes: number; // minutes depuis minuit local du jour de début
  durationMinutes: number;
  week: string; // lundi de la semaine, YYYY-MM-DD
  params: RuleParams;
  toValidate: (keyof RuleParams)[];
}

function localParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(instant)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

// Date locale "YYYY-MM-DD" -> jour UTC à midi : calculs de calendrier sans fuseau.
function dayToUtcNoon(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function utcNoonToDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  return utcNoonToDay(new Date(dayToUtcNoon(day).getTime() + n * 24 * HOUR));
}

function toLocal(shift: ComplianceShift): Local {
  const p = localParts(shift.startsAt, shift.timezone);
  const day = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  const weekday = (dayToUtcNoon(day).getUTCDay() + 6) % 7;
  const pack = rulePackFor(shift.jointCommittee);
  return {
    shift,
    day,
    weekday,
    startMinutes: p.minutes,
    durationMinutes: Math.round((shift.endsAt.getTime() - shift.startsAt.getTime()) / 60000),
    week: addDays(day, -weekday),
    params: pack.params,
    toValidate: pack.toValidate,
  };
}

function hours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

function frenchDay(day: string): string {
  return new Intl.DateTimeFormat('fr-BE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(
    dayToUtcNoon(day),
  );
}

// Chevauchement (en minutes) d'un shift avec les plages [début, fin) de
// chaque jour, exprimées en minutes depuis minuit (fin > 1440 = lendemain).
function overlapsDailyWindow(l: Local, windowStart: number, windowEnd: number): boolean {
  const start = l.startMinutes;
  const end = l.startMinutes + l.durationMinutes;
  for (let k = -1; k <= Math.ceil(end / DAY_MINUTES); k++) {
    const ws = windowStart + k * DAY_MINUTES;
    const we = windowEnd + k * DAY_MINUTES;
    if (start < we && end > ws) return true;
  }
  return false;
}

function ageAt(birthDate: Date, day: string): number {
  const d = dayToUtcNoon(day);
  let age = d.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    d.getUTCMonth() < birthDate.getUTCMonth() ||
    (d.getUTCMonth() === birthDate.getUTCMonth() && d.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

// Jours ouvrables (tous sauf le dimanche ; jours fériés non pris en compte)
// strictement entre aujourd'hui et le jour du shift.
function workingDaysBetween(today: string, day: string): number {
  let count = 0;
  for (let d = addDays(today, 1); d < day; d = addDays(d, 1)) {
    if (dayToUtcNoon(d).getUTCDay() !== 0) count++;
  }
  return count;
}

export function checkEmployee(input: CheckInput): Violation[] {
  const { employee, window, now } = input;
  const all = input.shifts
    .filter((s) => s.status !== 'cancelled')
    .slice()
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map(toLocal);
  const inWindow = (l: Local) => l.shift.endsAt > window.from && l.shift.startsAt < window.to;
  const violations: Violation[] = [];

  const push = (v: Omit<Violation, 'userId'>, involved: Local[]) => {
    if (!involved.some(inWindow)) return;
    violations.push({ ...v, userId: employee.id });
  };

  const isMinorOn = (day: string) => (employee.birthDate ? ageAt(employee.birthDate, day) < 18 : false);
  const isPartTime = employee.contractType === 'part_time';

  // ---- Par shift ----
  for (const l of all) {
    const minor = isMinorOn(l.day);
    const ids = [l.shift.id];

    const minShift = isPartTime ? l.params.minShiftHoursPartTime : l.params.minShiftHours;
    if (l.durationMinutes < minShift * 60) {
      push(
        {
          ruleId: 'min_shift',
          severity: 'warning',
          shiftIds: ids,
          date: l.day,
          message: `Prestation de ${hours(l.durationMinutes)} : le minimum est de ${minShift} h.`,
          legalRef: 'Durée minimale de prestation (3 h, ou moins si la CP le prévoit)',
          toValidate: isPartTime && l.toValidate.includes('minShiftHoursPartTime'),
        },
        [l],
      );
    }

    const breakAfter = minor ? MINOR_RULES.breakAfterHours : l.params.breakAfterHours;
    if (l.durationMinutes > breakAfter * 60) {
      push(
        {
          ruleId: 'break',
          severity: 'info',
          shiftIds: ids,
          date: l.day,
          message: minor
            ? 'Mineur : pause de 30 min au-delà de 4 h 30, 1 h au-delà de 6 h.'
            : `Plus de ${breakAfter} h : prévoir une pause d'au moins ${l.params.breakMinutes} min.`,
          legalRef: minor ? 'Jeunes travailleurs (SPF Emploi)' : 'Loi sur le travail, art. 38quater',
        },
        [l],
      );
    }

    if (minor) {
      if (overlapsDailyWindow(l, MINOR_RULES.nightStartMinutes, DAY_MINUTES + MINOR_RULES.nightEndMinutes)) {
        push(
          {
            ruleId: 'minor_night',
            severity: 'error',
            shiftIds: ids,
            date: l.day,
            message: 'Mineur : travail de nuit interdit (20 h – 6 h ; minuit – 4 h sans exception).',
            legalRef: 'Jeunes travailleurs (SPF Emploi)',
          },
          [l],
        );
      }
      if (l.weekday === 6) {
        push(
          {
            ruleId: 'minor_sunday',
            severity: 'error',
            shiftIds: ids,
            date: l.day,
            message: 'Mineur : le travail du dimanche est en principe interdit.',
            legalRef: 'Jeunes travailleurs (SPF Emploi)',
          },
          [l],
        );
      }
    } else if (!l.params.nightWorkAllowed && overlapsDailyWindow(l, 20 * 60, DAY_MINUTES + 6 * 60)) {
      push(
        {
          ruleId: 'night',
          severity: 'warning',
          shiftIds: ids,
          date: l.day,
          message: 'Travail entre 20 h et 6 h : interdit sauf dérogation pour ce secteur.',
          legalRef: 'Loi sur le travail, art. 35-36',
          toValidate: l.toValidate.includes('nightWorkAllowed'),
        },
        [l],
      );
    }

    if (!minor && l.weekday === 6 && l.params.sunday === 'morning_only') {
      const ends = l.startMinutes + l.durationMinutes;
      if (l.startMinutes < 8 * 60 || ends > 12 * 60) {
        push(
          {
            ruleId: 'sunday',
            severity: 'warning',
            shiftIds: ids,
            date: l.day,
            message:
              'Dimanche : dans le commerce, seulement de 8 h à midi, sauf dérogation (dimanches autorisés, commerces visés par AR).',
            legalRef: 'Loi sur le travail, art. 14 ; AR du 3 décembre 1987',
            toValidate: l.toValidate.includes('sunday'),
          },
          [l],
        );
      }
    }

    if (
      isPartTime &&
      l.shift.status === 'draft' &&
      workingDaysBetween(localDay(now, l.shift.timezone), l.day) < l.params.partTimeNoticeWorkingDays
    ) {
      push(
        {
          ruleId: 'part_time_notice',
          severity: 'warning',
          shiftIds: ids,
          date: l.day,
          message: `Temps partiel : l'horaire doit être communiqué au moins ${l.params.partTimeNoticeWorkingDays} jours ouvrables à l'avance — publié aujourd'hui, ce serait trop tard.`,
          legalRef: "Loi du 3 octobre 2022 (deal pour l'emploi) — horaires variables",
        },
        [l],
      );
    }
  }

  // ---- Par jour ----
  const byDay = groupBy(all, (l) => l.day);
  for (const [day, list] of byDay) {
    const total = list.reduce((sum, l) => sum + l.durationMinutes, 0);
    const p = list[0].params;
    const ids = list.map((l) => l.shift.id);
    if (isMinorOn(day)) {
      if (total > MINOR_RULES.dailyMaxHours * 60) {
        push(
          {
            ruleId: 'minor_daily',
            severity: 'error',
            shiftIds: ids,
            date: day,
            message: `Mineur : ${hours(total)} le ${frenchDay(day)}, maximum ${MINOR_RULES.dailyMaxHours} h.`,
            legalRef: 'Jeunes travailleurs (SPF Emploi)',
          },
          list,
        );
      }
    } else if (total > p.dailyAbsoluteMaxHours * 60) {
      push(
        {
          ruleId: 'daily_absolute',
          severity: 'error',
          shiftIds: ids,
          date: day,
          message: `${hours(total)} le ${frenchDay(day)} : au-delà du maximum absolu de ${p.dailyAbsoluteMaxHours} h.`,
          legalRef: 'Loi sur le travail, art. 22-26',
          toValidate: list[0].toValidate.includes('dailyAbsoluteMaxHours'),
        },
        list,
      );
    } else if (total > p.dailyNormalMaxHours * 60) {
      push(
        {
          ruleId: 'daily_normal',
          severity: 'warning',
          shiftIds: ids,
          date: day,
          message: `${hours(total)} le ${frenchDay(day)} : au-delà de ${p.dailyNormalMaxHours} h, seulement si le règlement de travail prévoit un régime flexible (heures supplémentaires sinon).`,
          legalRef: 'Loi sur le travail, art. 19-20bis',
        },
        list,
      );
    }
  }

  // ---- Repos entre deux journées ----
  for (let i = 1; i < all.length; i++) {
    const prev = all[i - 1];
    const next = all[i];
    if (prev.day === next.day) continue; // coupure dans la même journée
    const restHours = (next.shift.startsAt.getTime() - prev.shift.endsAt.getTime()) / HOUR;
    const minor = isMinorOn(next.day);
    const minRest = minor ? MINOR_RULES.minDailyRestHours : next.params.minDailyRestHours;
    if (restHours < minRest) {
      push(
        {
          ruleId: minor ? 'minor_daily_rest' : 'daily_rest',
          severity: 'error',
          shiftIds: [prev.shift.id, next.shift.id],
          date: next.day,
          message: `Seulement ${hours(Math.max(0, restHours) * 60)} de repos avant le ${frenchDay(next.day)} : minimum ${minRest} h consécutives.`,
          legalRef: minor ? 'Jeunes travailleurs (SPF Emploi)' : 'Loi sur le travail, art. 38ter',
        },
        [prev, next],
      );
    }
  }

  // ---- Par semaine (lundi -> dimanche, heure locale) ----
  const byWeek = groupBy(all, (l) => l.week);
  for (const [week, list] of byWeek) {
    const total = list.reduce((sum, l) => sum + l.durationMinutes, 0);
    const p = list[0].params;
    const ids = list.map((l) => l.shift.id);
    const minor = isMinorOn(week);
    if (minor && total > MINOR_RULES.weeklyMaxHours * 60) {
      push(
        {
          ruleId: 'minor_weekly',
          severity: 'error',
          shiftIds: ids,
          date: week,
          message: `Mineur : ${hours(total)} cette semaine, maximum ${MINOR_RULES.weeklyMaxHours} h.`,
          legalRef: 'Jeunes travailleurs (SPF Emploi)',
        },
        list,
      );
    } else if (!minor && total > p.weeklyAbsoluteMaxHours * 60) {
      push(
        {
          ruleId: 'weekly_absolute',
          severity: 'error',
          shiftIds: ids,
          date: week,
          message: `${hours(total)} cette semaine : au-delà du maximum absolu de ${p.weeklyAbsoluteMaxHours} h.`,
          legalRef: 'Loi sur le travail, art. 22-26',
        },
        list,
      );
    } else if (!minor && total > p.weeklyNormalMaxHours * 60) {
      push(
        {
          ruleId: 'weekly_normal',
          severity: 'warning',
          shiftIds: ids,
          date: week,
          message: `${hours(total)} cette semaine : au-delà de ${p.weeklyNormalMaxHours} h, à compenser (moyenne de 38 h sur la période de référence) ou heures supplémentaires.`,
          legalRef: 'Loi sur le travail, art. 19 et 26bis',
        },
        list,
      );
    }

    if (isPartTime && employee.weeklyContractHours && total > employee.weeklyContractHours * 60) {
      push(
        {
          ruleId: 'part_time_extra',
          severity: 'info',
          shiftIds: ids,
          date: week,
          message: `${hours(total)} planifiées pour un contrat de ${employee.weeklyContractHours} h : heures complémentaires.`,
          legalRef: 'Travail à temps partiel — heures complémentaires',
        },
        list,
      );
    }

    // Repos hebdomadaire : au moins une interruption de 35 h qui touche la
    // semaine. Un shift voisin connu (semaine adjacente) prolonge le repos au-
    // delà de la semaine ; sans shift connu avant / après, le repos est compté
    // jusqu'au début / à la fin de la semaine seulement.
    const weekStart = localMidnight(week, list[0].shift.timezone);
    const weekEnd = localMidnight(addDays(week, 7), list[0].shift.timezone);
    let longestRest = 0;
    let previousEnd = weekStart;
    let first = true;
    for (const l of all) {
      const start = l.shift.startsAt.getTime();
      const end = l.shift.endsAt.getTime();
      if (end <= weekStart && first) {
        previousEnd = end;
        continue;
      }
      first = false;
      if (start >= weekEnd) {
        longestRest = Math.max(longestRest, start - previousEnd);
        previousEnd = Infinity;
        break;
      }
      longestRest = Math.max(longestRest, start - previousEnd);
      previousEnd = Math.max(previousEnd, end);
    }
    if (previousEnd !== Infinity) longestRest = Math.max(longestRest, weekEnd - previousEnd);
    if (longestRest < p.minWeeklyRestHours * HOUR) {
      push(
        {
          ruleId: 'weekly_rest',
          severity: 'warning',
          shiftIds: ids,
          date: week,
          message: `Aucun repos de ${p.minWeeklyRestHours} h consécutives cette semaine (le plus long : ${hours((longestRest / HOUR) * 60)}).`,
          legalRef: 'Repos hebdomadaire (dimanche + 11 h)',
        },
        list,
      );
    }
  }

  // ---- Repos compensatoire du dimanche (secteurs où il est autorisé) ----
  for (const [day, list] of byDay) {
    if (list[0].weekday !== 6 || list[0].params.sunday !== 'allowed' || isMinorOn(day)) continue;
    const sundayMinutes = list.reduce((sum, l) => sum + l.durationMinutes, 0);
    const following = Array.from({ length: 6 }, (_, i) => addDays(day, i + 1));
    const followingShifts = following.flatMap((d) => byDay.get(d) ?? []);
    const ok = following.some((d) => {
      const worked = byDay.get(d) ?? [];
      if (worked.length === 0) return true;
      if (sundayMinutes > 4 * 60) return false;
      // Demi-jour suffit : libre avant ou après 13 h.
      const morningFree = worked.every((l) => l.startMinutes >= 13 * 60);
      const afternoonFree = worked.every((l) => l.startMinutes + l.durationMinutes <= 13 * 60);
      return morningFree || afternoonFree;
    });
    if (!ok) {
      push(
        {
          ruleId: 'sunday_rest',
          severity: 'warning',
          shiftIds: list.map((l) => l.shift.id),
          date: day,
          message:
            sundayMinutes > 4 * 60
              ? 'Travail du dimanche de plus de 4 h : un jour de repos compensatoire doit suivre dans les 6 jours.'
              : 'Travail du dimanche : une demi-journée de repos compensatoire doit suivre dans les 6 jours.',
          legalRef: 'Loi sur le travail, art. 16',
        },
        [...list, ...followingShifts],
      );
    }
  }

  // ---- Étudiant : contingent annuel ----
  if (employee.contractType === 'student') {
    const byYear = groupBy(all, (l) => l.day.slice(0, 4));
    for (const [year, list] of byYear) {
      const limit = list[0].params.studentYearlyHours;
      let cumulative = 0;
      const over: Local[] = [];
      for (const l of list) {
        cumulative += l.durationMinutes;
        if (cumulative > limit * 60) over.push(l);
      }
      if (over.length > 0) {
        push(
          {
            ruleId: 'student_quota',
            severity: 'warning',
            shiftIds: over.map((l) => l.shift.id),
            date: over[0].day,
            message: `Étudiant : ${hours(cumulative)} planifiées en ${year}, au-delà du contingent de ${limit} h (cotisations réduites).`,
            legalRef: 'Travail étudiant — contingent annuel',
            toValidate: true,
          },
          over,
        );
      }
    }
  }

  return violations;
}

function localDay(instant: Date, timeZone: string): string {
  const p = localParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

// Instant UTC du minuit local de ce jour (heure d'été/hiver comprise).
function localMidnight(day: string, timeZone: string): number {
  const noon = dayToUtcNoon(day);
  const p = localParts(noon, timeZone);
  return noon.getTime() - p.minutes * 60000;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

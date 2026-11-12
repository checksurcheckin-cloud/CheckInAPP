import { ComplianceEmployee, ComplianceShift, checkEmployee } from './compliance.engine';

// Novembre 2026 : Bruxelles en heure d'hiver (UTC+1). Lundi 16 -> dimanche 22.
const TZ = 'Europe/Brussels';
const adult: ComplianceEmployee = {
  id: 'u1',
  contractType: 'full_time',
  weeklyContractHours: 38,
  birthDate: new Date('1990-01-01'),
};

let seq = 0;
// Heures locales de Bruxelles.
function shift(day: string, start: string, end: string, extra: Partial<ComplianceShift> = {}): ComplianceShift {
  const startsAt = new Date(`${day}T${start}:00+01:00`);
  let endsAt = new Date(`${day}T${end}:00+01:00`);
  if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * 3_600_000);
  seq += 1;
  return {
    id: `s${seq}`,
    startsAt,
    endsAt,
    status: 'published',
    timezone: TZ,
    jointCommittee: '302',
    ...extra,
  };
}

const window = { from: new Date('2026-11-16T00:00:00+01:00'), to: new Date('2026-11-23T00:00:00+01:00') };
const now = new Date('2026-11-01T10:00:00+01:00');

function rules(shifts: ComplianceShift[], employee = adult) {
  return checkEmployee({ employee, shifts, window, now }).map((v) => v.ruleId);
}

describe('checkEmployee', () => {
  it('accepts a normal 5 x 7.6 h week', () => {
    const week = ['16', '17', '18', '19', '20'].map((d) => shift(`2026-11-${d}`, '09:00', '16:36'));
    expect(rules(week).filter((r) => r !== 'break')).toEqual([]);
  });

  it('warns above 8 h a day and flags above 11 h', () => {
    expect(rules([shift('2026-11-16', '08:00', '17:30')])).toContain('daily_normal');
    expect(rules([shift('2026-11-16', '08:00', '20:00')])).toContain('daily_absolute');
  });

  it('adds up split shifts of the same day', () => {
    const result = rules([shift('2026-11-16', '07:00', '12:00'), shift('2026-11-16', '17:00', '22:00')]);
    expect(result).toContain('daily_normal');
    // Une coupure dans la même journée n'est pas un « repos entre deux journées ».
    expect(result).not.toContain('daily_rest');
  });

  it('requires 11 h of rest between two days, closing-then-opening included', () => {
    const result = rules([shift('2026-11-16', '16:00', '23:30'), shift('2026-11-17', '07:00', '12:00')]);
    expect(result).toContain('daily_rest');
  });

  it('counts the week in local time and warns above 40 h, flags above 50 h', () => {
    const fortyFive = ['16', '17', '18', '19', '20'].map((d) => shift(`2026-11-${d}`, '08:00', '17:00'));
    expect(rules(fortyFive)).toContain('weekly_normal');
    const fiftyFive = ['16', '17', '18', '19', '20'].map((d) => shift(`2026-11-${d}`, '08:00', '19:00'));
    expect(rules(fiftyFive)).toContain('weekly_absolute');
  });

  it('warns when no 35 h rest is left in the week', () => {
    const everyDay = ['16', '17', '18', '19', '20', '21', '22'].map((d) => shift(`2026-11-${d}`, '10:00', '14:00'));
    expect(rules(everyDay)).toContain('weekly_rest');
  });

  it('flags a shift shorter than the minimum, with the CP 302 part-time exception', () => {
    expect(rules([shift('2026-11-16', '12:00', '14:00')])).toContain('min_shift');
    const partTime = { ...adult, contractType: 'part_time' as const, weeklyContractHours: 20 };
    expect(rules([shift('2026-11-16', '12:00', '14:00')], partTime)).not.toContain('min_shift');
    expect(rules([shift('2026-11-16', '12:00', '14:00', { jointCommittee: '201' })], partTime)).toContain('min_shift');
  });

  it('allows Sunday and night work in horeca but not in retail', () => {
    const sundayEvening = shift('2026-11-22', '18:00', '23:00');
    expect(rules([sundayEvening])).not.toContain('sunday');
    expect(rules([sundayEvening])).not.toContain('night');
    const retail = shift('2026-11-22', '13:00', '21:00', { jointCommittee: '201' });
    expect(rules([retail])).toEqual(expect.arrayContaining(['sunday', 'night']));
    // Commerce le dimanche matin (8 h – midi) : permis.
    expect(rules([shift('2026-11-22', '08:00', '12:00', { jointCommittee: '201' })])).not.toContain('sunday');
  });

  it('requires compensatory rest within 6 days after a Sunday worked', () => {
    const sunday = shift('2026-11-15', '10:00', '18:00');
    const nextSixDays = ['16', '17', '18', '19', '20', '21'].map((d) => shift(`2026-11-${d}`, '10:00', '14:00'));
    expect(rules([sunday, ...nextSixDays])).toContain('sunday_rest');
    expect(rules([sunday, ...nextSixDays.slice(0, 5)])).not.toContain('sunday_rest');
  });

  it('applies the minor rules', () => {
    const minor = { ...adult, birthDate: new Date('2010-03-01') };
    const result = rules([shift('2026-11-22', '17:00', '22:00'), shift('2026-11-16', '08:00', '17:00')], minor);
    expect(result).toEqual(expect.arrayContaining(['minor_night', 'minor_sunday', 'minor_daily']));
    // 18 ans le 16 novembre : plus mineur ce jour-là.
    const justAdult = { ...adult, birthDate: new Date('2008-11-16') };
    expect(rules([shift('2026-11-16', '17:00', '22:00')], justAdult)).not.toContain('minor_night');
  });

  it('warns when a part-time draft would be published too late', () => {
    const partTime = { ...adult, contractType: 'part_time' as const, weeklyContractHours: 20 };
    const lateNow = new Date('2026-11-13T10:00:00+01:00'); // vendredi
    const check = (s: ComplianceShift) =>
      checkEmployee({ employee: partTime, shifts: [s], window, now: lateNow }).map((v) => v.ruleId);
    // CP 302 : 3 jours ouvrables (le samedi en est un, pas le dimanche).
    // Entre vendredi 13 et mardi 17 : sam 14, lun 16 = 2 -> trop tard.
    expect(check(shift('2026-11-17', '10:00', '14:00', { status: 'draft' }))).toContain('part_time_notice');
    expect(check(shift('2026-11-18', '10:00', '14:00', { status: 'draft' }))).not.toContain('part_time_notice');
    // Déjà publié : rien à communiquer.
    expect(check(shift('2026-11-17', '10:00', '14:00'))).not.toContain('part_time_notice');
  });

  it("flags a student's hours beyond the yearly quota", () => {
    const student = { ...adult, contractType: 'student' as const };
    const before = Array.from({ length: 81 }, (_, i) =>
      shift(new Date(Date.UTC(2026, 0, 2 + i)).toISOString().slice(0, 10), '09:00', '17:00'),
    ); // 648 h
    const result = checkEmployee({
      employee: student,
      shifts: [...before, shift('2026-11-16', '09:00', '13:00')],
      window,
      now,
    });
    expect(result.find((v) => v.ruleId === 'student_quota')?.shiftIds).toEqual([`s${seq}`]);
  });

  it('only reports violations touching the requested window', () => {
    const lastWeek = [shift('2026-11-09', '08:00', '20:00')];
    expect(rules(lastWeek)).toEqual([]);
  });
});

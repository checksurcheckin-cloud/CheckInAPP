import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NeedLineDto } from './dto/need-line.dto';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 24 * 3_600_000;
// Exceptions passées gardées à l'affichage de la page Besoins.
const PAST_DATES_SHOWN = 31 * DAY;
const MAX_RESOLVE_DAYS = 62;

export interface NeedLine {
  startTime: string;
  endTime: string;
  roleNeeded: string | null;
  count: number;
}

export interface ResolvedDay {
  date: string; // YYYY-MM-DD
  // 'date' = exception posée pour cette date (éventuellement vide : fermé).
  source: 'weekly' | 'date';
  needs: NeedLine[];
}

// Date locale "YYYY-MM-DD" -> jour de la semaine, lundi = 0.
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() + 6) % 7;
}

// Créneau local (date de début, heures de début/fin) d'un shift, dans le
// fuseau du site — c'est ce que la page Besoins décrit.
export function localSlot(startsAt: Date, endsAt: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = (d: Date) =>
    fmt.formatToParts(d).reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const s = parts(startsAt);
  const e = parts(endsAt);
  return {
    date: `${s.year}-${s.month}-${s.day}`,
    startTime: `${s.hour}:${s.minute}`,
    endTime: `${e.hour}:${e.minute}`,
  };
}

export function sameNeed(
  line: { startTime: string; endTime: string; roleNeeded: string | null },
  slot: { startTime: string; endTime: string; roleNeeded: string | null },
) {
  return (
    line.startTime === slot.startTime &&
    line.endTime === slot.endTime &&
    (line.roleNeeded || null) === (slot.roleNeeded || null)
  );
}

function toLine(n: { startTime: string; endTime: string; roleNeeded: string | null; count: number }): NeedLine {
  return { startTime: n.startTime, endTime: n.endTime, roleNeeded: n.roleNeeded, count: n.count };
}

function dateOnly(date: string): Date {
  if (!DATE.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
    throw new BadRequestException('Date invalide (YYYY-MM-DD)');
  }
  return new Date(`${date}T00:00:00Z`);
}

function cleanLines(lines: NeedLineDto[]) {
  return lines.map((l) => {
    if (l.startTime === l.endTime) throw new BadRequestException('Début et fin identiques');
    return { startTime: l.startTime, endTime: l.endTime, roleNeeded: l.roleNeeded?.trim() || null, count: l.count };
  });
}

// Besoins journaliers en personnel (page Besoins, admin) et contrôle des
// shifts quand l'entreprise planifie « selon les besoins » (décision #40).
@Injectable()
export class StaffingNeedsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private async ensureSite(companyId: string, siteId: string) {
    const site = await this.prisma.site.findFirst({ where: { id: siteId, companyId } });
    if (!site) throw new NotFoundException('Site introuvable');
    return site;
  }

  // Semaine type + exceptions (récentes et à venir) d'un site.
  async getForSite(companyId: string, siteId: string) {
    await this.ensureSite(companyId, siteId);
    const since = new Date(Date.now() - PAST_DATES_SHOWN);
    const [weekly, dates, dated] = await Promise.all([
      this.prisma.staffingNeed.findMany({
        where: { siteId, dayOfWeek: { not: null } },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.staffingNeedDate.findMany({ where: { siteId, date: { gte: since } }, orderBy: { date: 'asc' } }),
      this.prisma.staffingNeed.findMany({
        where: { siteId, specificDate: { gte: since } },
        orderBy: { startTime: 'asc' },
      }),
    ]);
    return {
      weekly: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek,
        needs: weekly.filter((n) => n.dayOfWeek === dayOfWeek).map(toLine),
      })),
      dates: dates.map((d) => {
        const key = d.date.toISOString().slice(0, 10);
        return {
          date: key,
          needs: dated.filter((n) => n.specificDate?.toISOString().slice(0, 10) === key).map(toLine),
        };
      }),
    };
  }

  async setWeekly(companyId: string, siteId: string, dayOfWeek: number, lines: NeedLineDto[]) {
    await this.ensureSite(companyId, siteId);
    const data = cleanLines(lines);
    await this.prisma.$transaction([
      this.prisma.staffingNeed.deleteMany({ where: { siteId, dayOfWeek } }),
      this.prisma.staffingNeed.createMany({ data: data.map((l) => ({ ...l, siteId, dayOfWeek })) }),
    ]);
    this.realtime.emitToCompany(companyId, 'staffing-needs:changed');
  }

  async setDate(companyId: string, siteId: string, date: string, lines: NeedLineDto[]) {
    await this.ensureSite(companyId, siteId);
    const day = dateOnly(date);
    const data = cleanLines(lines);
    await this.prisma.$transaction([
      this.prisma.staffingNeedDate.upsert({
        where: { siteId_date: { siteId, date: day } },
        create: { siteId, date: day },
        update: {},
      }),
      this.prisma.staffingNeed.deleteMany({ where: { siteId, specificDate: day } }),
      this.prisma.staffingNeed.createMany({ data: data.map((l) => ({ ...l, siteId, specificDate: day })) }),
    ]);
    this.realtime.emitToCompany(companyId, 'staffing-needs:changed');
  }

  // Retire l'exception : la date suit de nouveau la semaine type.
  async clearDate(companyId: string, siteId: string, date: string) {
    await this.ensureSite(companyId, siteId);
    const day = dateOnly(date);
    await this.prisma.$transaction([
      this.prisma.staffingNeed.deleteMany({ where: { siteId, specificDate: day } }),
      this.prisma.staffingNeedDate.deleteMany({ where: { siteId, date: day } }),
    ]);
    this.realtime.emitToCompany(companyId, 'staffing-needs:changed');
  }

  // Besoins effectifs jour par jour : l'exception de la date prime sur la
  // semaine type.
  async resolve(companyId: string, siteId: string, from: string, to: string): Promise<ResolvedDay[]> {
    await this.ensureSite(companyId, siteId);
    return this.resolveUnchecked(siteId, from, to);
  }

  private async resolveUnchecked(siteId: string, from: string, to: string): Promise<ResolvedDay[]> {
    const start = dateOnly(from);
    const end = dateOnly(to);
    const days = Math.round((end.getTime() - start.getTime()) / DAY) + 1;
    if (days < 1 || days > MAX_RESOLVE_DAYS) throw new BadRequestException(`Période invalide (${MAX_RESOLVE_DAYS} jours max)`);

    const [weekly, dates, dated] = await Promise.all([
      this.prisma.staffingNeed.findMany({ where: { siteId, dayOfWeek: { not: null } }, orderBy: { startTime: 'asc' } }),
      this.prisma.staffingNeedDate.findMany({ where: { siteId, date: { gte: start, lte: end } } }),
      this.prisma.staffingNeed.findMany({
        where: { siteId, specificDate: { gte: start, lte: end } },
        orderBy: { startTime: 'asc' },
      }),
    ]);
    const overridden = new Set(dates.map((d) => d.date.toISOString().slice(0, 10)));

    return Array.from({ length: days }, (_, i) => {
      const date = new Date(start.getTime() + i * DAY).toISOString().slice(0, 10);
      if (overridden.has(date)) {
        return {
          date,
          source: 'date' as const,
          needs: dated.filter((n) => n.specificDate?.toISOString().slice(0, 10) === date).map(toLine),
        };
      }
      const weekday = weekdayOf(date);
      return { date, source: 'weekly' as const, needs: weekly.filter((n) => n.dayOfWeek === weekday).map(toLine) };
    });
  }

  // Mode « selon les besoins » : un shift (créé, déplacé ou modifié) doit
  // correspondre à une ligne de besoin de son jour — même horaire local et
  // même rôle — sans dépasser le nombre de personnes demandé. Ne fait rien
  // en mode libre.
  async ensureShiftMatchesNeed(
    companyId: string,
    shift: { siteId: string; startsAt: Date; endsAt: Date; roleNeeded: string | null; excludeShiftId?: string },
  ) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { planningMode: true } });
    if (company?.planningMode !== 'needs') return;

    const site = await this.ensureSite(companyId, shift.siteId);
    const timeZone = site.timezone ?? 'Europe/Brussels';
    const slot = { ...localSlot(shift.startsAt, shift.endsAt, timeZone), roleNeeded: shift.roleNeeded || null };
    const [day] = await this.resolveUnchecked(shift.siteId, slot.date, slot.date);
    const wanted = day.needs.filter((n) => sameNeed(n, slot)).reduce((sum, n) => sum + n.count, 0);
    const label = `${slot.startTime}–${slot.endTime}${slot.roleNeeded ? ` (${slot.roleNeeded})` : ''}`;
    if (wanted === 0) {
      throw new ConflictException(
        `Hors besoins : aucun besoin ${label} le ${slot.date}. L'entreprise planifie selon les besoins définis par l'admin.`,
      );
    }

    // Shifts déjà planifiés sur ce même besoin (marge d'un jour : fuseaux).
    const around = await this.prisma.shift.findMany({
      where: {
        siteId: shift.siteId,
        status: { not: 'cancelled' },
        startsAt: { gte: new Date(dateOnly(slot.date).getTime() - DAY), lt: new Date(dateOnly(slot.date).getTime() + 2 * DAY) },
        ...(shift.excludeShiftId ? { id: { not: shift.excludeShiftId } } : {}),
      },
      select: { startsAt: true, endsAt: true, roleNeeded: true },
    });
    const taken = around.filter((s) => {
      const other = { ...localSlot(s.startsAt, s.endsAt, timeZone), roleNeeded: s.roleNeeded || null };
      return other.date === slot.date && sameNeed(other, slot);
    }).length;
    if (taken >= wanted) {
      throw new ConflictException(`Besoin déjà couvert : ${taken}/${wanted} shifts ${label} le ${slot.date}.`);
    }
  }
}

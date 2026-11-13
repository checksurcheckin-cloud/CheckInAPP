import { ConflictException, NotFoundException } from '@nestjs/common';
import { StaffingNeedsService, localSlot } from './staffing-needs.service';

const D = (date: string) => new Date(`${date}T00:00:00Z`);

describe('StaffingNeedsService', () => {
  let prisma: {
    site: { findFirst: jest.Mock };
    company: { findUnique: jest.Mock };
    staffingNeed: { findMany: jest.Mock; deleteMany: jest.Mock; createMany: jest.Mock };
    staffingNeedDate: { findMany: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock };
    shift: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let realtime: { emitToCompany: jest.Mock };
  let service: StaffingNeedsService;

  // Lundi 16 novembre 2026 ; Bruxelles = UTC+1.
  const weeklyMonday = { dayOfWeek: 0, specificDate: null, startTime: '09:00', endTime: '17:00', roleNeeded: 'Caisse', count: 2 };

  beforeEach(() => {
    prisma = {
      site: { findFirst: jest.fn().mockResolvedValue({ id: 'site-1', timezone: 'Europe/Brussels' }) },
      company: { findUnique: jest.fn().mockResolvedValue({ planningMode: 'needs' }) },
      staffingNeed: {
        findMany: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve(where.dayOfWeek ? [weeklyMonday] : []),
        ),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      staffingNeedDate: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn(), deleteMany: jest.fn() },
      shift: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    realtime = { emitToCompany: jest.fn() };
    service = new StaffingNeedsService(prisma as never, realtime as never);
  });

  const shift = (start: string, end: string, roleNeeded: string | null = 'Caisse') => ({
    siteId: 'site-1',
    startsAt: new Date(start),
    endsAt: new Date(end),
    roleNeeded,
  });

  it('reads the slot in the site timezone', () => {
    expect(
      localSlot(new Date('2026-11-16T08:00:00Z'), new Date('2026-11-16T16:00:00Z'), 'Europe/Brussels'),
    ).toEqual({ date: '2026-11-16', startTime: '09:00', endTime: '17:00' });
  });

  it('does nothing in free planning mode', async () => {
    prisma.company.findUnique.mockResolvedValue({ planningMode: 'free' });
    await expect(
      service.ensureShiftMatchesNeed('company-a', shift('2026-11-16T10:00:00Z', '2026-11-16T12:00:00Z', null)),
    ).resolves.toBeUndefined();
    expect(prisma.site.findFirst).not.toHaveBeenCalled();
  });

  it('accepts a shift matching a weekly need, until the requested count is reached', async () => {
    const monday = shift('2026-11-16T08:00:00Z', '2026-11-16T16:00:00Z');
    await expect(service.ensureShiftMatchesNeed('company-a', monday)).resolves.toBeUndefined();

    prisma.shift.findMany.mockResolvedValue([
      { startsAt: monday.startsAt, endsAt: monday.endsAt, roleNeeded: 'Caisse' },
      { startsAt: monday.startsAt, endsAt: monday.endsAt, roleNeeded: 'Caisse' },
    ]);
    await expect(service.ensureShiftMatchesNeed('company-a', monday)).rejects.toThrow('Besoin déjà couvert : 2/2');
  });

  it('rejects a shift outside the needs (other hours, other role, other day)', async () => {
    await expect(
      service.ensureShiftMatchesNeed('company-a', shift('2026-11-16T09:00:00Z', '2026-11-16T16:00:00Z')),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.ensureShiftMatchesNeed('company-a', shift('2026-11-16T08:00:00Z', '2026-11-16T16:00:00Z', 'Réserve')),
    ).rejects.toThrow('Hors besoins');
    await expect(
      service.ensureShiftMatchesNeed('company-a', shift('2026-11-17T08:00:00Z', '2026-11-17T16:00:00Z')),
    ).rejects.toThrow('Hors besoins');
  });

  it('lets a date exception replace the weekly needs, an empty one closing the day', async () => {
    prisma.staffingNeedDate.findMany.mockResolvedValue([{ siteId: 'site-1', date: D('2026-11-16') }]);
    await expect(
      service.ensureShiftMatchesNeed('company-a', shift('2026-11-16T08:00:00Z', '2026-11-16T16:00:00Z')),
    ).rejects.toThrow('Hors besoins');

    const days = await service.resolve('company-a', 'site-1', '2026-11-16', '2026-11-17');
    expect(days).toEqual([
      { date: '2026-11-16', source: 'date', needs: [] },
      { date: '2026-11-17', source: 'weekly', needs: [] },
    ]);
  });

  it('only touches sites of the caller company', async () => {
    prisma.site.findFirst.mockResolvedValue(null);
    await expect(service.setWeekly('company-a', 'site-of-b', 0, [])).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.site.findFirst).toHaveBeenCalledWith({ where: { id: 'site-of-b', companyId: 'company-a' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('replaces a weekday list and tells connected clients', async () => {
    await service.setWeekly('company-a', 'site-1', 0, [
      { startTime: '09:00', endTime: '17:00', roleNeeded: '  ', count: 2 },
    ]);
    expect(prisma.staffingNeed.deleteMany).toHaveBeenCalledWith({ where: { siteId: 'site-1', dayOfWeek: 0 } });
    expect(prisma.staffingNeed.createMany).toHaveBeenCalledWith({
      data: [{ startTime: '09:00', endTime: '17:00', roleNeeded: null, count: 2, siteId: 'site-1', dayOfWeek: 0 }],
    });
    expect(realtime.emitToCompany).toHaveBeenCalledWith('company-a', 'staffing-needs:changed');
  });
});

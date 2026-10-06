import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ShiftsService } from './shifts.service';

describe('ShiftsService', () => {
  let service: ShiftsService;
  let realtime: { emitToCompany: jest.Mock };
  let prisma: {
    site: { findFirst: jest.Mock };
    user: { findFirst: jest.Mock };
    availability: { findFirst: jest.Mock };
    shift: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock; delete: jest.Mock };
    shiftAssignment: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    shiftOffer: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    shiftOfferCandidate: {
      create: jest.Mock;
      findFirst: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      site: { findFirst: jest.fn() },
      user: { findFirst: jest.fn() },
      availability: { findFirst: jest.fn() },
      shift: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      shiftAssignment: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      shiftOffer: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      shiftOfferCandidate: {
        create: jest.fn(),
        findFirst: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    realtime = { emitToCompany: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ShiftsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeGateway, useValue: realtime },
      ],
    }).compile();

    service = module.get(ShiftsService);
  });

  describe('findAll', () => {
    it('scopes an employee to shifts where they have an assignment', async () => {
      prisma.shift.findMany.mockResolvedValue([]);

      await service.findAll({ userId: 'user-1', companyId: 'company-a', role: 'employee' }, {});

      const call = prisma.shift.findMany.mock.calls[0][0];
      expect(call.where.assignments).toEqual({ some: { userId: 'user-1' } });
      expect(call.include.assignments.where).toEqual({ userId: 'user-1' });
    });

    it('hides draft shifts from an employee even if they are already assigned', async () => {
      prisma.shift.findMany.mockResolvedValue([]);

      await service.findAll({ userId: 'user-1', companyId: 'company-a', role: 'employee' }, {});

      const call = prisma.shift.findMany.mock.calls[0][0];
      expect(call.where.status).toBe('published');
    });

    it('lets a manager see every shift in the company, drafts included, with all assignments', async () => {
      prisma.shift.findMany.mockResolvedValue([]);

      await service.findAll({ userId: 'manager-1', companyId: 'company-a', role: 'manager' }, {});

      const call = prisma.shift.findMany.mock.calls[0][0];
      expect(call.where.assignments).toBeUndefined();
      expect(call.where.status).toBeUndefined();
      expect(call.include.assignments.where).toBeUndefined();
      expect(call.where.site).toEqual({ companyId: 'company-a' });
    });
  });

  describe('create', () => {
    it('refuses to create a shift on a site from another company', async () => {
      prisma.site.findFirst.mockResolvedValue(null);

      await expect(
        service.create('company-a', 'manager-1', {
          siteId: 'site-of-company-b',
          startsAt: '2026-09-01T08:00:00.000Z',
          endsAt: '2026-09-01T16:00:00.000Z',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.shift.create).not.toHaveBeenCalled();
    });

    it('rejects a shift whose end is before its start', async () => {
      prisma.site.findFirst.mockResolvedValue({ id: 'site-1', companyId: 'company-a' });

      await expect(
        service.create('company-a', 'manager-1', {
          siteId: 'site-1',
          startsAt: '2026-09-02T04:00:00.000Z',
          endsAt: '2026-09-01T12:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.shift.create).not.toHaveBeenCalled();
    });

    it('rejects a shift whose end equals its start', async () => {
      prisma.site.findFirst.mockResolvedValue({ id: 'site-1', companyId: 'company-a' });

      await expect(
        service.create('company-a', 'manager-1', {
          siteId: 'site-1',
          startsAt: '2026-09-01T08:00:00.000Z',
          endsAt: '2026-09-01T08:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.shift.create).not.toHaveBeenCalled();
    });

    it('does not emit a realtime event — creating a draft is planning prep, not a publish', async () => {
      prisma.site.findFirst.mockResolvedValue({ id: 'site-1', companyId: 'company-a' });
      prisma.shift.create.mockResolvedValue({ id: 'shift-1' });

      await service.create('company-a', 'manager-1', {
        siteId: 'site-1',
        startsAt: '2026-09-01T08:00:00.000Z',
        endsAt: '2026-09-01T16:00:00.000Z',
      });

      expect(realtime.emitToCompany).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const existingShift = {
      id: 'shift-1',
      startsAt: new Date('2026-09-01T08:00:00.000Z'),
      endsAt: new Date('2026-09-01T16:00:00.000Z'),
      assignments: [],
    };

    it('rejects moving endsAt before the existing startsAt (only endsAt provided)', async () => {
      prisma.shift.findFirst.mockResolvedValue(existingShift);

      await expect(
        service.update('company-a', 'shift-1', { endsAt: '2026-08-31T00:00:00.000Z' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.shift.update).not.toHaveBeenCalled();
    });

    it('rejects moving startsAt past the existing endsAt (only startsAt provided)', async () => {
      prisma.shift.findFirst.mockResolvedValue(existingShift);

      await expect(
        service.update('company-a', 'shift-1', { startsAt: '2026-09-02T00:00:00.000Z' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.shift.update).not.toHaveBeenCalled();
    });

    it('rejects a full reschedule (startsAt + endsAt) landing on an inverted range', async () => {
      prisma.shift.findFirst.mockResolvedValue(existingShift);

      await expect(
        service.update('company-a', 'shift-1', {
          startsAt: '2026-09-02T04:00:00.000Z',
          endsAt: '2026-09-01T12:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.shift.update).not.toHaveBeenCalled();
    });

    it('accepts a valid reschedule that shifts both boundaries by the same amount', async () => {
      prisma.shift.findFirst.mockResolvedValue(existingShift);
      prisma.shift.update.mockResolvedValue({ id: 'shift-1' });

      await service.update('company-a', 'shift-1', {
        startsAt: '2026-09-02T08:00:00.000Z',
        endsAt: '2026-09-02T16:00:00.000Z',
      });

      expect(prisma.shift.update).toHaveBeenCalledWith({
        where: { id: 'shift-1' },
        data: {
          startsAt: new Date('2026-09-02T08:00:00.000Z'),
          endsAt: new Date('2026-09-02T16:00:00.000Z'),
        },
      });
    });

    it('does not emit a realtime event for a plain field edit on a draft', async () => {
      prisma.shift.findFirst.mockResolvedValue(existingShift);
      prisma.shift.update.mockResolvedValue({ id: 'shift-1' });

      await service.update('company-a', 'shift-1', { roleNeeded: 'Serveur' });

      expect(realtime.emitToCompany).not.toHaveBeenCalled();
    });

    it('emits a realtime event only when the shift is explicitly published', async () => {
      prisma.shift.findFirst.mockResolvedValue(existingShift);
      prisma.shift.update.mockResolvedValue({ id: 'shift-1', status: 'published' });

      await service.update('company-a', 'shift-1', { status: 'published' });

      expect(realtime.emitToCompany).toHaveBeenCalledWith('company-a', 'shifts:changed');
    });
  });

  describe('remove', () => {
    it('refuses to delete a shift from another company', async () => {
      prisma.shift.findFirst.mockResolvedValue(null);

      await expect(service.remove('company-a', 'shift-of-company-b')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.shift.delete).not.toHaveBeenCalled();
    });

    it('cascades through offers and assignments before deleting the shift (avoids the FK violation)', async () => {
      prisma.shift.findFirst.mockResolvedValue({ id: 'shift-1', assignments: [] });
      prisma.shiftAssignment.findMany.mockResolvedValue([{ id: 'assignment-1' }, { id: 'assignment-2' }]);
      prisma.shiftOffer.deleteMany.mockResolvedValue({ count: 0 });
      prisma.shiftAssignment.deleteMany.mockResolvedValue({ count: 2 });
      prisma.shift.delete.mockResolvedValue({ id: 'shift-1' });

      await service.remove('company-a', 'shift-1');

      expect(prisma.shiftOffer.deleteMany).toHaveBeenCalledWith({
        where: { shiftAssignmentId: { in: ['assignment-1', 'assignment-2'] } },
      });
      expect(prisma.shiftAssignment.deleteMany).toHaveBeenCalledWith({ where: { shiftId: 'shift-1' } });
      expect(prisma.shift.delete).toHaveBeenCalledWith({ where: { id: 'shift-1' } });
      expect(realtime.emitToCompany).not.toHaveBeenCalled();
    });
  });

  describe('assign', () => {
    const shift1 = {
      id: 'shift-1',
      startsAt: new Date('2026-09-01T08:00:00.000Z'),
      endsAt: new Date('2026-09-01T16:00:00.000Z'),
      assignments: [],
    };

    // Par défaut, l'employé est disponible toute la journée — les tests
    // ciblant une autre règle (chevauchement, entreprise...) n'ont pas à se
    // soucier de la disponibilité ; les tests dédiés ci-dessous l'écrasent.
    // Site en UTC par défaut pour que les heures des mocks se lisent
    // directement ; les tests de fuseau ci-dessous renvoient un autre tz.
    beforeEach(() => {
      prisma.site.findFirst.mockResolvedValue({ timezone: 'UTC' });
      prisma.availability.findFirst.mockResolvedValue({
        isAvailable: true,
        startTime: '00:00',
        endTime: '23:59',
        specificDate: null,
      });
    });

    it('refuses to assign a user from another company', async () => {
      prisma.shift.findFirst.mockResolvedValue(shift1);
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.assign('company-a', 'shift-1', { userId: 'user-of-company-b' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.shiftAssignment.create).not.toHaveBeenCalled();
    });

    it('rejects assigning a second employee to a shift that already has one', async () => {
      prisma.shift.findFirst.mockResolvedValue({
        ...shift1,
        assignments: [{ id: 'assignment-existing', userId: 'user-1', status: 'assigned' }],
      });

      await expect(service.assign('company-a', 'shift-1', { userId: 'user-2' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.shiftAssignment.create).not.toHaveBeenCalled();
    });

    it('allows assigning when the only existing assignment was cancelled', async () => {
      prisma.shift.findFirst.mockResolvedValue({
        ...shift1,
        assignments: [{ id: 'assignment-old', userId: 'user-1', status: 'cancelled' }],
      });
      prisma.user.findFirst.mockResolvedValue({ id: 'user-2' });
      prisma.shiftAssignment.findFirst.mockResolvedValue(null);
      prisma.shiftAssignment.create.mockResolvedValue({ id: 'assignment-new' });

      await service.assign('company-a', 'shift-1', { userId: 'user-2' });

      expect(prisma.shiftAssignment.create).toHaveBeenCalledWith({
        data: { shiftId: 'shift-1', userId: 'user-2', status: 'assigned' },
      });
    });

    it('rejects assigning an employee who already has an overlapping shift', async () => {
      prisma.shift.findFirst.mockResolvedValue(shift1);
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        id: 'assignment-conflict',
        shift: {
          startsAt: new Date('2026-09-01T14:00:00.000Z'),
          endsAt: new Date('2026-09-01T22:00:00.000Z'),
        },
      });

      await expect(service.assign('company-a', 'shift-1', { userId: 'user-1' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.shiftAssignment.create).not.toHaveBeenCalled();
    });

    it('assigns successfully when the employee has no overlapping shift', async () => {
      prisma.shift.findFirst.mockResolvedValue(shift1);
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prisma.shiftAssignment.findFirst.mockResolvedValue(null);
      prisma.shiftAssignment.create.mockResolvedValue({ id: 'assignment-1' });

      await service.assign('company-a', 'shift-1', { userId: 'user-1' });

      expect(prisma.shiftAssignment.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          status: { not: 'cancelled' },
          shiftId: { not: 'shift-1' },
          shift: { startsAt: { lt: shift1.endsAt }, endsAt: { gt: shift1.startsAt } },
        },
        include: { shift: true },
      });
      expect(prisma.shiftAssignment.create).toHaveBeenCalledWith({
        data: { shiftId: 'shift-1', userId: 'user-1', status: 'assigned' },
      });
      expect(realtime.emitToCompany).not.toHaveBeenCalled();
    });

    it('allows assigning when the employee has declared no availability at all for that day (available by default)', async () => {
      prisma.shift.findFirst.mockResolvedValue(shift1);
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prisma.availability.findFirst.mockResolvedValue(null);
      prisma.shiftAssignment.findFirst.mockResolvedValue(null);
      prisma.shiftAssignment.create.mockResolvedValue({ id: 'assignment-1' });

      await service.assign('company-a', 'shift-1', { userId: 'user-1' });

      expect(prisma.shiftAssignment.create).toHaveBeenCalledWith({
        data: { shiftId: 'shift-1', userId: 'user-1', status: 'assigned' },
      });
    });

    it('blocks assigning when the employee marked that day as fully unavailable (no range specified)', async () => {
      prisma.shift.findFirst.mockResolvedValue(shift1);
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prisma.availability.findFirst.mockResolvedValue({
        isAvailable: false,
        startTime: '00:00',
        endTime: '23:59',
        specificDate: null,
      });

      await expect(service.assign('company-a', 'shift-1', { userId: 'user-1' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.shiftAssignment.create).not.toHaveBeenCalled();
    });

    it('blocks assigning when the shift overlaps a narrowed unavailability range', async () => {
      prisma.shift.findFirst.mockResolvedValue(shift1); // 08:00 -> 16:00
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prisma.availability.findFirst.mockResolvedValue({
        isAvailable: false,
        startTime: '09:00',
        endTime: '11:00',
        specificDate: null,
      });

      await expect(service.assign('company-a', 'shift-1', { userId: 'user-1' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.shiftAssignment.create).not.toHaveBeenCalled();
    });

    it('allows assigning when the shift falls outside a narrowed unavailability range', async () => {
      prisma.shift.findFirst.mockResolvedValue(shift1); // 08:00 -> 16:00
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prisma.availability.findFirst.mockResolvedValue({
        isAvailable: false,
        startTime: '17:00',
        endTime: '19:00',
        specificDate: null,
      });
      prisma.shiftAssignment.findFirst.mockResolvedValue(null);
      prisma.shiftAssignment.create.mockResolvedValue({ id: 'assignment-1' });

      await service.assign('company-a', 'shift-1', { userId: 'user-1' });

      expect(prisma.shiftAssignment.create).toHaveBeenCalledWith({
        data: { shiftId: 'shift-1', userId: 'user-1', status: 'assigned' },
      });
    });

    it("blocks assigning when the shift falls outside the employee's declared hours", async () => {
      prisma.shift.findFirst.mockResolvedValue(shift1); // 08:00 -> 16:00
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prisma.availability.findFirst.mockResolvedValue({
        isAvailable: true,
        startTime: '09:00',
        endTime: '12:00',
        specificDate: null,
      });

      await expect(service.assign('company-a', 'shift-1', { userId: 'user-1' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.shiftAssignment.create).not.toHaveBeenCalled();
    });

    it("allows assigning when the shift falls within the employee's declared hours", async () => {
      prisma.shift.findFirst.mockResolvedValue(shift1); // 08:00 -> 16:00
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prisma.availability.findFirst.mockResolvedValue({
        isAvailable: true,
        startTime: '07:00',
        endTime: '17:00',
        specificDate: null,
      });
      prisma.shiftAssignment.findFirst.mockResolvedValue(null);
      prisma.shiftAssignment.create.mockResolvedValue({ id: 'assignment-1' });

      await service.assign('company-a', 'shift-1', { userId: 'user-1' });

      expect(prisma.shiftAssignment.create).toHaveBeenCalledWith({
        data: { shiftId: 'shift-1', userId: 'user-1', status: 'assigned' },
      });
    });

    it('prefers a specific-date availability over a recurring one for the same day, without even checking the recurring one', async () => {
      prisma.shift.findFirst.mockResolvedValue(shift1);
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prisma.availability.findFirst.mockResolvedValueOnce({
        isAvailable: false,
        startTime: '09:00',
        endTime: '17:00',
        specificDate: shift1.startsAt,
      });

      await expect(service.assign('company-a', 'shift-1', { userId: 'user-1' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.availability.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.shiftAssignment.create).not.toHaveBeenCalled();
    });

    // ---- Comparaison disponibilité <-> shift dans le fuseau du site ----
    // Le shift est stocké en UTC, l'Availability déclarée en heure locale.

    it('compares against the site timezone, not UTC, when checking declared hours', async () => {
      // 06:00–14:00 UTC = 08:00–16:00 heure de Bruxelles (CEST, UTC+2).
      prisma.shift.findFirst.mockResolvedValue({
        id: 'shift-tz',
        siteId: 'site-1',
        startsAt: new Date('2026-06-01T06:00:00.000Z'),
        endsAt: new Date('2026-06-01T14:00:00.000Z'),
        assignments: [],
      });
      prisma.site.findFirst.mockResolvedValue({ timezone: 'Europe/Brussels' });
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prisma.availability.findFirst.mockResolvedValue({
        isAvailable: true,
        startTime: '08:00',
        endTime: '16:00',
        specificDate: null,
      });
      prisma.shiftAssignment.findFirst.mockResolvedValue(null);
      prisma.shiftAssignment.create.mockResolvedValue({ id: 'assignment-tz' });

      // Sans conversion de fuseau, 06:00 UTC < 08:00 aurait été rejeté à tort.
      await service.assign('company-a', 'shift-tz', { userId: 'user-1' });

      expect(prisma.shiftAssignment.create).toHaveBeenCalledWith({
        data: { shiftId: 'shift-tz', userId: 'user-1', status: 'assigned' },
      });
    });

    it('still blocks a shift that runs past the declared hours once converted to the site timezone', async () => {
      // 08:00–16:00 UTC = 10:00–18:00 heure de Bruxelles ; dispo jusqu'à 16:00 locale.
      prisma.shift.findFirst.mockResolvedValue({
        id: 'shift-tz',
        siteId: 'site-1',
        startsAt: new Date('2026-06-01T08:00:00.000Z'),
        endsAt: new Date('2026-06-01T16:00:00.000Z'),
        assignments: [],
      });
      prisma.site.findFirst.mockResolvedValue({ timezone: 'Europe/Brussels' });
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prisma.availability.findFirst.mockResolvedValue({
        isAvailable: true,
        startTime: '08:00',
        endTime: '16:00',
        specificDate: null,
      });

      // Sans conversion, 16:00 UTC <= 16:00 aurait été accepté à tort.
      await expect(service.assign('company-a', 'shift-tz', { userId: 'user-1' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.shiftAssignment.create).not.toHaveBeenCalled();
    });

    it('looks up the recurring availability for the site-local weekday of an evening shift', async () => {
      // 23:00 UTC dimanche 7 juin = 01:00 lundi 8 juin heure de Bruxelles.
      prisma.shift.findFirst.mockResolvedValue({
        id: 'shift-night',
        siteId: 'site-1',
        startsAt: new Date('2026-06-07T23:00:00.000Z'),
        endsAt: new Date('2026-06-08T02:00:00.000Z'),
        assignments: [],
      });
      prisma.site.findFirst.mockResolvedValue({ timezone: 'Europe/Brussels' });
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prisma.availability.findFirst.mockResolvedValue(null); // aucune déclaration -> disponible par défaut
      prisma.shiftAssignment.findFirst.mockResolvedValue(null);
      prisma.shiftAssignment.create.mockResolvedValue({ id: 'assignment-1' });

      await service.assign('company-a', 'shift-night', { userId: 'user-1' });

      // lundi = 0 (heure locale), et pas dimanche = 6 (date UTC).
      expect(prisma.availability.findFirst).toHaveBeenLastCalledWith({
        where: { userId: 'user-1', dayOfWeek: 0, specificDate: null },
      });
    });
  });

  describe('listOpenOffers', () => {
    it("returns other colleagues' open offers in the company, mapped for the marketplace, with hasApplied", async () => {
      prisma.shiftOffer.findMany.mockResolvedValue([
        {
          id: 'offer-1',
          offeredBy: 'colleague-2',
          createdAt: new Date('2026-09-01T10:00:00.000Z'),
          shiftAssignment: {
            shiftId: 'shift-9',
            shift: { id: 'shift-9', siteId: 'site-1', startsAt: 'x', endsAt: 'y' },
          },
          candidates: [{ id: 'candidate-1', offerId: 'offer-1', userId: 'user-1' }],
        },
      ]);

      const result = await service.listOpenOffers('company-a', 'user-1');

      expect(prisma.shiftOffer.findMany).toHaveBeenCalledWith({
        where: {
          status: 'open',
          offeredBy: { not: 'user-1' },
          shiftAssignment: { shift: { site: { companyId: 'company-a' } } },
        },
        include: {
          shiftAssignment: { include: { shift: true } },
          candidates: { where: { userId: 'user-1' } },
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual([
        {
          id: 'offer-1',
          shiftId: 'shift-9',
          shift: { id: 'shift-9', siteId: 'site-1', startsAt: 'x', endsAt: 'y' },
          offeredBy: 'colleague-2',
          createdAt: new Date('2026-09-01T10:00:00.000Z'),
          hasApplied: true,
        },
      ]);
    });
  });

  describe('listPendingOffersForManager', () => {
    it('returns every open offer in the company with its candidates, even when empty', async () => {
      prisma.shiftOffer.findMany.mockResolvedValue([
        {
          id: 'offer-1',
          offeredBy: 'colleague-1',
          createdAt: new Date('2026-09-01T10:00:00.000Z'),
          shiftAssignment: {
            shiftId: 'shift-9',
            shift: { id: 'shift-9', siteId: 'site-1', startsAt: 'x', endsAt: 'y' },
          },
          candidates: [],
        },
      ]);

      const result = await service.listPendingOffersForManager('company-a');

      expect(prisma.shiftOffer.findMany).toHaveBeenCalledWith({
        where: {
          status: 'open',
          shiftAssignment: { shift: { site: { companyId: 'company-a' } } },
        },
        include: {
          shiftAssignment: { include: { shift: true } },
          candidates: { orderBy: { createdAt: 'asc' } },
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual([
        {
          id: 'offer-1',
          shiftId: 'shift-9',
          shift: { id: 'shift-9', siteId: 'site-1', startsAt: 'x', endsAt: 'y' },
          offeredBy: 'colleague-1',
          createdAt: new Date('2026-09-01T10:00:00.000Z'),
          candidates: [],
        },
      ]);
    });
  });

  describe('offerAssignment', () => {
    it('rejects an employee offering an assignment that is not theirs', async () => {
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        id: 'assignment-1',
        userId: 'user-1',
        status: 'assigned',
      });

      await expect(
        service.offerAssignment(
          'company-a',
          { userId: 'user-2', companyId: 'company-a', role: 'employee' },
          'assignment-1',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.shiftOffer.create).not.toHaveBeenCalled();
    });

    it('rejects offering an assignment that is not in "assigned" status', async () => {
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        id: 'assignment-1',
        userId: 'user-1',
        status: 'offered',
      });

      await expect(
        service.offerAssignment(
          'company-a',
          { userId: 'user-1', companyId: 'company-a', role: 'employee' },
          'assignment-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates an open offer and flips the assignment to offered', async () => {
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        id: 'assignment-1',
        userId: 'user-1',
        status: 'assigned',
      });
      prisma.shiftOffer.create.mockResolvedValue({ id: 'offer-1', status: 'open' });
      prisma.shiftAssignment.update.mockResolvedValue({ id: 'assignment-1', status: 'offered' });

      const result = await service.offerAssignment(
        'company-a',
        { userId: 'user-1', companyId: 'company-a', role: 'employee' },
        'assignment-1',
      );

      expect(result).toEqual({ id: 'offer-1', status: 'open' });
      expect(prisma.shiftOffer.create).toHaveBeenCalledWith({
        data: { shiftAssignmentId: 'assignment-1', offeredBy: 'user-1', status: 'open' },
      });
      expect(prisma.shiftAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: { status: 'offered' },
      });
    });
  });

  describe('acceptOffer', () => {
    const shiftAssignment1 = {
      shiftId: 'shift-1',
      shift: {
        startsAt: new Date('2026-09-01T08:00:00.000Z'),
        endsAt: new Date('2026-09-01T16:00:00.000Z'),
      },
    };

    it('rejects a colleague accepting their own offer', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        offeredBy: 'user-1',
        status: 'open',
        shiftAssignmentId: 'assignment-1',
        requiresManagerApproval: true,
        shiftAssignment: shiftAssignment1,
      });

      await expect(
        service.acceptOffer(
          'company-a',
          { userId: 'user-1', companyId: 'company-a', role: 'employee' },
          'offer-1',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.shiftOfferCandidate.create).not.toHaveBeenCalled();
    });

    it('rejects accepting an offer that is no longer open', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        offeredBy: 'user-1',
        status: 'approved',
        shiftAssignmentId: 'assignment-1',
        requiresManagerApproval: true,
        shiftAssignment: shiftAssignment1,
      });

      await expect(
        service.acceptOffer(
          'company-a',
          { userId: 'user-2', companyId: 'company-a', role: 'employee' },
          'offer-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a colleague who already candidated for this offer', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        offeredBy: 'user-1',
        status: 'open',
        shiftAssignmentId: 'assignment-1',
        requiresManagerApproval: true,
        shiftAssignment: shiftAssignment1,
      });
      prisma.shiftOfferCandidate.findFirst.mockResolvedValue({ id: 'candidate-1', offerId: 'offer-1', userId: 'user-2' });

      await expect(
        service.acceptOffer(
          'company-a',
          { userId: 'user-2', companyId: 'company-a', role: 'employee' },
          'offer-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.shiftOfferCandidate.create).not.toHaveBeenCalled();
    });

    it('rejects accepting when the colleague already has an overlapping shift', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        offeredBy: 'user-1',
        status: 'open',
        shiftAssignmentId: 'assignment-1',
        requiresManagerApproval: true,
        shiftAssignment: shiftAssignment1,
      });
      prisma.shiftOfferCandidate.findFirst.mockResolvedValue(null);
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        id: 'assignment-conflict',
        shift: {
          startsAt: new Date('2026-09-01T14:00:00.000Z'),
          endsAt: new Date('2026-09-01T22:00:00.000Z'),
        },
      });

      await expect(
        service.acceptOffer(
          'company-a',
          { userId: 'user-2', companyId: 'company-a', role: 'employee' },
          'offer-1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.shiftOfferCandidate.create).not.toHaveBeenCalled();
    });

    it('records a candidacy without changing the offer or the assignment — several colleagues can candidate', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        offeredBy: 'user-1',
        status: 'open',
        shiftAssignmentId: 'assignment-1',
        requiresManagerApproval: true,
        shiftAssignment: shiftAssignment1,
      });
      prisma.shiftOfferCandidate.findFirst.mockResolvedValue(null);
      prisma.shiftAssignment.findFirst.mockResolvedValue(null);
      prisma.shiftOfferCandidate.create.mockResolvedValue({ id: 'candidate-1', offerId: 'offer-1', userId: 'user-2' });

      const result = await service.acceptOffer(
        'company-a',
        { userId: 'user-2', companyId: 'company-a', role: 'employee' },
        'offer-1',
      );

      expect(prisma.shiftOfferCandidate.create).toHaveBeenCalledWith({
        data: { offerId: 'offer-1', userId: 'user-2' },
      });
      expect(prisma.shiftAssignment.update).not.toHaveBeenCalled();
      expect(prisma.shiftOffer.update).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'candidate-1', offerId: 'offer-1', userId: 'user-2' });
    });
  });

  describe('approveOffer', () => {
    const shiftAssignment1 = {
      shiftId: 'shift-1',
      shift: {
        startsAt: new Date('2026-09-01T08:00:00.000Z'),
        endsAt: new Date('2026-09-01T16:00:00.000Z'),
      },
    };

    it('refuses to approve an offer that is not open', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        status: 'approved',
        requiresManagerApproval: true,
        acceptedBy: 'user-2',
        shiftAssignmentId: 'assignment-1',
        shiftAssignment: shiftAssignment1,
      });

      await expect(service.approveOffer('company-a', 'offer-1', { userId: 'user-2' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.shiftAssignment.update).not.toHaveBeenCalled();
    });

    it("refuses to approve a user who hasn't candidated for this offer", async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        status: 'open',
        requiresManagerApproval: true,
        acceptedBy: null,
        shiftAssignmentId: 'assignment-1',
        shiftAssignment: shiftAssignment1,
      });
      prisma.shiftOfferCandidate.findFirst.mockResolvedValue(null);

      await expect(service.approveOffer('company-a', 'offer-1', { userId: 'user-2' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.shiftAssignment.update).not.toHaveBeenCalled();
    });

    it('rejects approving when the chosen candidate now has an overlapping shift', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        status: 'open',
        requiresManagerApproval: true,
        acceptedBy: null,
        shiftAssignmentId: 'assignment-1',
        shiftAssignment: shiftAssignment1,
      });
      prisma.shiftOfferCandidate.findFirst.mockResolvedValue({ id: 'candidate-1', offerId: 'offer-1', userId: 'user-2' });
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        id: 'assignment-conflict',
        shift: {
          startsAt: new Date('2026-09-01T14:00:00.000Z'),
          endsAt: new Date('2026-09-01T22:00:00.000Z'),
        },
      });

      await expect(service.approveOffer('company-a', 'offer-1', { userId: 'user-2' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.shiftAssignment.update).not.toHaveBeenCalled();
    });

    it('reassigns the shift to the chosen candidate, confirms it, and clears the remaining candidacies', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        status: 'open',
        requiresManagerApproval: true,
        acceptedBy: null,
        shiftAssignmentId: 'assignment-1',
        shiftAssignment: shiftAssignment1,
      });
      prisma.shiftOfferCandidate.findFirst.mockResolvedValue({ id: 'candidate-1', offerId: 'offer-1', userId: 'user-2' });
      prisma.shiftAssignment.findFirst.mockResolvedValue(null);
      prisma.shiftOfferCandidate.deleteMany.mockResolvedValue({ count: 2 });
      prisma.shiftAssignment.update.mockResolvedValue({ id: 'assignment-1', status: 'confirmed' });
      prisma.shiftOffer.update.mockResolvedValue({ id: 'offer-1', status: 'approved' });

      await service.approveOffer('company-a', 'offer-1', { userId: 'user-2' });

      expect(prisma.shiftOfferCandidate.deleteMany).toHaveBeenCalledWith({ where: { offerId: 'offer-1' } });
      expect(prisma.shiftAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: { userId: 'user-2', status: 'confirmed' },
      });
      expect(prisma.shiftOffer.update).toHaveBeenCalledWith({
        where: { id: 'offer-1' },
        data: expect.objectContaining({ acceptedBy: 'user-2', status: 'approved' }),
      });
    });

    it('blocks approving an offer from another company', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue(null);

      await expect(
        service.approveOffer('company-a', 'offer-of-company-b', { userId: 'user-2' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rejectOffer', () => {
    const shiftAssignment1 = {
      shiftId: 'shift-1',
      shift: {
        startsAt: new Date('2026-09-01T08:00:00.000Z'),
        endsAt: new Date('2026-09-01T16:00:00.000Z'),
      },
    };

    it('refuses to reject an offer that is not open', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        status: 'approved',
        requiresManagerApproval: true,
        acceptedBy: 'user-2',
        shiftAssignmentId: 'assignment-1',
        shiftAssignment: shiftAssignment1,
      });

      await expect(service.rejectOffer('company-a', 'offer-1')).rejects.toThrow(BadRequestException);
      expect(prisma.shiftAssignment.update).not.toHaveBeenCalled();
    });

    it('reverts the assignment to the original owner, marks the offer rejected, and clears candidacies', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        status: 'open',
        requiresManagerApproval: true,
        acceptedBy: null,
        shiftAssignmentId: 'assignment-1',
        shiftAssignment: shiftAssignment1,
      });
      prisma.shiftOfferCandidate.deleteMany.mockResolvedValue({ count: 1 });
      prisma.shiftAssignment.update.mockResolvedValue({ id: 'assignment-1', status: 'assigned' });
      prisma.shiftOffer.update.mockResolvedValue({ id: 'offer-1', status: 'rejected' });

      await service.rejectOffer('company-a', 'offer-1');

      expect(prisma.shiftOfferCandidate.deleteMany).toHaveBeenCalledWith({ where: { offerId: 'offer-1' } });
      expect(prisma.shiftAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: { status: 'assigned' },
      });
      expect(prisma.shiftOffer.update).toHaveBeenCalledWith({
        where: { id: 'offer-1' },
        data: { status: 'rejected', resolvedAt: expect.any(Date) },
      });
    });

    it('blocks rejecting an offer from another company', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue(null);

      await expect(service.rejectOffer('company-a', 'offer-of-company-b')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

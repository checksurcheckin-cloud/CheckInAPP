import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { RotatingQrService } from '../users/rotating-qr.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { TimeEntriesService } from './time-entries.service';

describe('TimeEntriesService', () => {
  let service: TimeEntriesService;
  let prisma: {
    user: { findFirst: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock };
    site: { findFirst: jest.Mock };
    siteDevice: { findFirst: jest.Mock };
    timeEntry: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };
  let usersService: { resolveByPin: jest.Mock };
  let rotatingQrService: { decodePayload: jest.Mock; verifyCode: jest.Mock };
  let realtime: { emitToCompany: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
      site: { findFirst: jest.fn() },
      siteDevice: { findFirst: jest.fn() },
      timeEntry: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    usersService = { resolveByPin: jest.fn() };
    rotatingQrService = { decodePayload: jest.fn(), verifyCode: jest.fn() };
    realtime = { emitToCompany: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        TimeEntriesService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: usersService },
        { provide: RotatingQrService, useValue: rotatingQrService },
        { provide: RealtimeGateway, useValue: realtime },
      ],
    }).compile();

    service = module.get(TimeEntriesService);
  });

  describe('createFromDevice', () => {
    const device = { deviceId: 'device-1', siteId: 'site-a', companyId: 'company-a' };

    it('resolves the employee by badgeCode, scoped to the device companyId', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', firstName: 'A', lastName: 'B' });
      prisma.timeEntry.findFirst.mockResolvedValue(null);
      prisma.timeEntry.create.mockResolvedValue({ id: 'entry-1' });

      await service.createFromDevice(device, {
        source: 'badge_scan',
        badgeCode: 'BADGE123',
      });

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { badgeCode: 'BADGE123', companyId: 'company-a' },
        select: { id: true, firstName: true, lastName: true },
      });
      expect(prisma.timeEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          siteId: 'site-a',
          deviceId: 'device-1',
          source: 'badge_scan',
        }),
      });
    });

    it('rejects an unknown badge without creating an entry', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.createFromDevice(device, {
          source: 'badge_scan',
          badgeCode: 'UNKNOWN',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.timeEntry.create).not.toHaveBeenCalled();
    });

    it('rejects a wrong/unknown PIN without creating an entry', async () => {
      usersService.resolveByPin.mockResolvedValue(null);

      await expect(
        service.createFromDevice(device, {
          source: 'pin_code',
          pin: '0000',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.timeEntry.create).not.toHaveBeenCalled();
    });

    it('defaults to clock_in when the employee has no prior clock event at this site', async () => {
      usersService.resolveByPin.mockResolvedValue({ id: 'user-1', firstName: 'A', lastName: 'B' });
      prisma.timeEntry.findFirst.mockResolvedValue(null);
      prisma.timeEntry.create.mockResolvedValue({ id: 'entry-1' });

      await service.createFromDevice(device, { source: 'pin_code', pin: '4321' });

      expect(prisma.timeEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: 'clock_in' }),
      });
    });

    it('flips to clock_out when the last event at this site was a clock_in', async () => {
      usersService.resolveByPin.mockResolvedValue({ id: 'user-1', firstName: 'A', lastName: 'B' });
      prisma.timeEntry.findFirst.mockResolvedValue({ type: 'clock_in' });
      prisma.timeEntry.create.mockResolvedValue({ id: 'entry-1' });

      await service.createFromDevice(device, { source: 'pin_code', pin: '4321' });

      expect(prisma.timeEntry.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1', siteId: 'site-a', type: { in: ['clock_in', 'clock_out'] } },
        orderBy: { timestamp: 'desc' },
        select: { type: true },
      });
      expect(prisma.timeEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: 'clock_out' }),
      });
    });

    it('identifies the employee by PIN alone, scoped to the device companyId', async () => {
      usersService.resolveByPin.mockResolvedValue({ id: 'user-1', badgeCode: null });
      prisma.timeEntry.findFirst.mockResolvedValue({ type: 'clock_in' });
      prisma.timeEntry.create.mockResolvedValue({ id: 'entry-1' });

      await service.createFromDevice(device, {
        source: 'pin_code',
        pin: '4321',
      });

      expect(usersService.resolveByPin).toHaveBeenCalledWith('company-a', '4321');
      expect(prisma.timeEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'user-1', source: 'pin_code' }),
      });
    });
  });

  describe('createFromRotatingQr', () => {
    const device = { deviceId: 'device-1', siteId: 'site-a', companyId: 'company-a' };
    const payload = JSON.stringify({ userId: 'user-1', code: '123456' });

    it('rejects a userId scoped to another company, without ever checking the code', async () => {
      rotatingQrService.decodePayload.mockReturnValue({ userId: 'user-of-company-b', code: '123456' });
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.createFromRotatingQr(device, { payload })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-of-company-b', companyId: 'company-a' },
        select: { id: true, firstName: true, lastName: true },
      });
      expect(rotatingQrService.verifyCode).not.toHaveBeenCalled();
      expect(prisma.timeEntry.create).not.toHaveBeenCalled();
    });

    it('rejects an expired/invalid TOTP code without creating an entry', async () => {
      rotatingQrService.decodePayload.mockReturnValue({ userId: 'user-1', code: '000000' });
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', firstName: 'A', lastName: 'B' });
      rotatingQrService.verifyCode.mockResolvedValue(false);

      await expect(service.createFromRotatingQr(device, { payload })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.timeEntry.create).not.toHaveBeenCalled();
    });

    it('creates a qr_scan_own_phone entry once the code is verified, auto-detecting the type', async () => {
      rotatingQrService.decodePayload.mockReturnValue({ userId: 'user-1', code: '123456' });
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', firstName: 'A', lastName: 'B' });
      rotatingQrService.verifyCode.mockResolvedValue(true);
      prisma.timeEntry.findFirst.mockResolvedValue(null);
      prisma.timeEntry.create.mockResolvedValue({ id: 'entry-1' });

      await service.createFromRotatingQr(device, { payload });

      expect(rotatingQrService.verifyCode).toHaveBeenCalledWith('user-1', '123456');
      expect(prisma.timeEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          siteId: 'site-a',
          deviceId: 'device-1',
          type: 'clock_in',
          source: 'qr_scan_own_phone',
        }),
      });
    });
  });

  describe('createSelf', () => {
    const user = { userId: 'user-1', companyId: 'company-a', role: 'employee' };

    it('rejects a gps entry on a site from another company', async () => {
      prisma.site.findFirst.mockResolvedValue(null);

      await expect(
        service.createSelf(user, {
          type: 'clock_in' as any,
          source: 'gps',
          siteId: 'site-of-company-b',
          geoLat: 50.8,
          geoLng: 4.35,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.timeEntry.create).not.toHaveBeenCalled();
    });

    it('blocks a gps entry when the user has an explicit override disabling it', async () => {
      prisma.user.findUnique.mockResolvedValue({ gpsClockInEnabled: false, company: { gpsClockInEnabled: true } });

      await expect(
        service.createSelf(user, { type: 'clock_in' as any, source: 'gps', siteId: 'site-a', geoLat: 50.8, geoLng: 4.35 }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.site.findFirst).not.toHaveBeenCalled();
      expect(prisma.timeEntry.create).not.toHaveBeenCalled();
    });

    it('blocks a gps entry when the user has no override and the company disabled it', async () => {
      prisma.user.findUnique.mockResolvedValue({ gpsClockInEnabled: null, company: { gpsClockInEnabled: false } });

      await expect(
        service.createSelf(user, { type: 'clock_in' as any, source: 'gps', siteId: 'site-a', geoLat: 50.8, geoLng: 4.35 }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.timeEntry.create).not.toHaveBeenCalled();
    });

    it("lets the user's override re-enable gps even though the company disabled it", async () => {
      prisma.user.findUnique.mockResolvedValue({ gpsClockInEnabled: true, company: { gpsClockInEnabled: false } });
      prisma.site.findFirst.mockResolvedValue({ id: 'site-a', companyId: 'company-a' });
      prisma.timeEntry.create.mockResolvedValue({ id: 'entry-1' });

      await service.createSelf(user, {
        type: 'clock_in' as any,
        source: 'gps',
        siteId: 'site-a',
        geoLat: 50.8,
        geoLng: 4.35,
      });

      expect(prisma.timeEntry.create).toHaveBeenCalled();
    });

    it('rejects a qr_scan_own_phone entry on a device from another company', async () => {
      prisma.siteDevice.findFirst.mockResolvedValue(null);

      await expect(
        service.createSelf(user, {
          type: 'clock_in' as any,
          source: 'qr_scan_own_phone',
          deviceId: 'device-of-company-b',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.timeEntry.create).not.toHaveBeenCalled();
    });

    it('creates the entry for the authenticated user, never a userId from the body', async () => {
      prisma.site.findFirst.mockResolvedValue({ id: 'site-a', companyId: 'company-a' });
      prisma.timeEntry.create.mockResolvedValue({ id: 'entry-1' });

      await service.createSelf(user, {
        type: 'clock_in' as any,
        source: 'gps',
        siteId: 'site-a',
        geoLat: 50.8,
        geoLng: 4.35,
      });

      expect(prisma.timeEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'user-1', siteId: 'site-a', source: 'gps' }),
      });
    });
  });

  describe('createManual', () => {
    const manager = { userId: 'manager-1', companyId: 'company-a', role: 'manager' };

    it('refuses to create an entry for a user outside the manager company', async () => {
      prisma.site.findFirst.mockResolvedValue({ id: 'site-a', companyId: 'company-a' });
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.createManual(manager, {
          userId: 'user-of-company-b',
          siteId: 'site-a',
          type: 'clock_in' as any,
          creationReason: 'Badge perdu',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.timeEntry.create).not.toHaveBeenCalled();
    });

    it('stamps the entry with manual_by_manager, createdBy and creationReason', async () => {
      prisma.site.findFirst.mockResolvedValue({ id: 'site-a', companyId: 'company-a' });
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', companyId: 'company-a' });
      prisma.timeEntry.create.mockResolvedValue({ id: 'entry-1' });

      await service.createManual(manager, {
        userId: 'user-1',
        siteId: 'site-a',
        type: 'clock_in' as any,
        creationReason: 'Badge perdu',
      });

      expect(prisma.timeEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          source: 'manual_by_manager',
          createdBy: 'manager-1',
          creationReason: 'Badge perdu',
        }),
      });
    });
  });

  describe('findAll', () => {
    it('forces an employee to only see their own entries, ignoring ?userId=', async () => {
      prisma.timeEntry.findMany.mockResolvedValue([]);

      await service.findAll(
        { userId: 'user-1', companyId: 'company-a', role: 'employee' },
        { userId: 'someone-else' } as any,
      );

      const call = prisma.timeEntry.findMany.mock.calls[0][0];
      expect(call.where.userId).toBe('user-1');
      expect(call.where.site).toEqual({ companyId: 'company-a' });
    });

    it('lets a manager filter by any userId within the company', async () => {
      prisma.timeEntry.findMany.mockResolvedValue([]);

      await service.findAll(
        { userId: 'manager-1', companyId: 'company-a', role: 'manager' },
        { userId: 'user-2' } as any,
      );

      const call = prisma.timeEntry.findMany.mock.calls[0][0];
      expect(call.where.userId).toBe('user-2');
    });
  });

  describe('update', () => {
    it('blocks correcting an entry from another company', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(null);

      await expect(
        service.update('company-a', 'manager-1', 'entry-of-company-b', {
          editReason: 'Oubli de pointage',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.timeEntry.update).not.toHaveBeenCalled();
    });

    it('marks the entry isEdited with editedBy and editReason', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue({ id: 'entry-1' });
      prisma.timeEntry.update.mockResolvedValue({ id: 'entry-1' });

      await service.update('company-a', 'manager-1', 'entry-1', {
        editReason: 'Oubli de pointage',
      });

      expect(prisma.timeEntry.update).toHaveBeenCalledWith({
        where: { id: 'entry-1' },
        data: expect.objectContaining({
          isEdited: true,
          editedBy: 'manager-1',
          editReason: 'Oubli de pointage',
        }),
      });
    });
  });

  describe('getPresence', () => {
    it('rejects a site from another company', async () => {
      prisma.site.findFirst.mockResolvedValue(null);

      await expect(service.getPresence('company-a', 'site-of-company-b')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns only users whose latest clock event is clock_in, with the since timestamp and clock-in method of that event', async () => {
      const lastClockIn = new Date('2026-09-01T13:00:00.000Z');
      prisma.site.findFirst.mockResolvedValue({ id: 'site-a', companyId: 'company-a', geoLat: null, geoLng: null });
      prisma.timeEntry.findMany.mockResolvedValue([
        { userId: 'user-1', type: 'clock_in', timestamp: new Date('2026-09-01T09:00:00.000Z'), source: 'badge_scan', geoLat: null, geoLng: null },
        { userId: 'user-2', type: 'clock_in', timestamp: new Date('2026-09-01T09:00:00.000Z'), source: 'badge_scan', geoLat: null, geoLng: null },
        { userId: 'user-2', type: 'clock_out', timestamp: new Date('2026-09-01T12:00:00.000Z'), source: 'badge_scan', geoLat: null, geoLng: null },
        { userId: 'user-1', type: 'clock_out', timestamp: new Date('2026-09-01T12:30:00.000Z'), source: 'badge_scan', geoLat: null, geoLng: null },
        { userId: 'user-1', type: 'clock_in', timestamp: lastClockIn, source: 'qr_scan_own_phone', geoLat: null, geoLng: null },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1', firstName: 'A', lastName: 'B' }]);

      const result = await service.getPresence('company-a', 'site-a');

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['user-1'] } },
        select: { id: true, firstName: true, lastName: true },
      });
      expect(result).toEqual([
        {
          id: 'user-1',
          firstName: 'A',
          lastName: 'B',
          since: lastClockIn,
          source: 'qr_scan_own_phone',
          geoLat: null,
          geoLng: null,
          distanceFromSiteMeters: null,
        },
      ]);
    });

    it('computes the distance from the site for a gps clock-in when both coordinates are known', async () => {
      // ~111m plein nord du site (0.001° de latitude ≈ 111m).
      prisma.site.findFirst.mockResolvedValue({ id: 'site-a', companyId: 'company-a', geoLat: 50.8467, geoLng: 4.3525 });
      prisma.timeEntry.findMany.mockResolvedValue([
        { userId: 'user-1', type: 'clock_in', timestamp: new Date(), source: 'gps', geoLat: 50.8477, geoLng: 4.3525 },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1', firstName: 'A', lastName: 'B' }]);

      const [result] = await service.getPresence('company-a', 'site-a');

      expect(result.source).toBe('gps');
      expect(result.geoLat).toBe(50.8477);
      expect(result.distanceFromSiteMeters).toBeGreaterThan(90);
      expect(result.distanceFromSiteMeters).toBeLessThan(130);
    });

    it('returns raw gps coordinates without a distance when the site has none declared', async () => {
      prisma.site.findFirst.mockResolvedValue({ id: 'site-a', companyId: 'company-a', geoLat: null, geoLng: null });
      prisma.timeEntry.findMany.mockResolvedValue([
        { userId: 'user-1', type: 'clock_in', timestamp: new Date(), source: 'gps', geoLat: 50.85, geoLng: 4.35 },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1', firstName: 'A', lastName: 'B' }]);

      const [result] = await service.getPresence('company-a', 'site-a');

      expect(result.geoLat).toBe(50.85);
      expect(result.geoLng).toBe(4.35);
      expect(result.distanceFromSiteMeters).toBeNull();
    });

    it('never computes a distance for a non-gps clock-in even if coordinates happen to be present', async () => {
      prisma.site.findFirst.mockResolvedValue({ id: 'site-a', companyId: 'company-a', geoLat: 50.8467, geoLng: 4.3525 });
      prisma.timeEntry.findMany.mockResolvedValue([
        { userId: 'user-1', type: 'clock_in', timestamp: new Date(), source: 'badge_scan', geoLat: null, geoLng: null },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1', firstName: 'A', lastName: 'B' }]);

      const [result] = await service.getPresence('company-a', 'site-a');

      expect(result.distanceFromSiteMeters).toBeNull();
    });

    it('returns an empty list without querying users when nobody is clocked in', async () => {
      prisma.site.findFirst.mockResolvedValue({ id: 'site-a', companyId: 'company-a' });
      prisma.timeEntry.findMany.mockResolvedValue([]);

      const result = await service.getPresence('company-a', 'site-a');

      expect(result).toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });
});

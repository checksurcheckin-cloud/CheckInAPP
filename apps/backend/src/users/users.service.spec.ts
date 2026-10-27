import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { UsersService } from './users.service';
import { decryptPin, encryptPin } from './pin-cipher';

process.env.PIN_ENCRYPTION_KEY = 'a'.repeat(64);

describe('UsersService', () => {
  let service: UsersService;
  let realtime: { emitToCompany: jest.Mock };
  let prisma: {
    user: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    site: {
      findFirst: jest.Mock;
    };
    shiftAssignment: {
      updateMany: jest.Mock;
    };
    shiftApplication: {
      deleteMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      site: {
        findFirst: jest.fn(),
      },
      shiftAssignment: {
        updateMany: jest.fn(),
      },
      shiftApplication: {
        deleteMany: jest.fn(),
      },
    };
    realtime = { emitToCompany: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeGateway, useValue: realtime },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('scopes findAll() by companyId and never selects passwordHash/pinCodeHash', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await service.findAll('company-a');

    const call = prisma.user.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ companyId: 'company-a' });
    expect(call.select.passwordHash).toBeUndefined();
    expect(call.select.pinCodeHash).toBeUndefined();
  });

  it('filters findAll() to a site (plus unassigned employees and any manager/admin) when siteId is given', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await service.findAll('company-a', 'site-1');

    const call = prisma.user.findMany.mock.calls[0][0];
    expect(call.where).toEqual({
      companyId: 'company-a',
      OR: [{ siteId: 'site-1' }, { siteId: null }, { role: { not: 'employee' } }],
    });
  });

  it('never returns a user belonging to another company', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.findOne('company-a', 'user-of-company-b')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-of-company-b', companyId: 'company-a' } }),
    );
  });

  it('blocks updateRole() on a user from another company before touching prisma.update', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.updateRole('company-a', 'user-of-company-b', { role: 'manager' as any }, 'admin'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('blocks updateStatus() on a user from another company before touching prisma.update', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.updateStatus('company-a', 'user-of-company-b', { status: 'active' as any }, 'admin'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('lets updateStatus() move an invited user to active', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1', companyId: 'company-a' });
    prisma.user.update.mockResolvedValue({ id: 'user-1', status: 'active' });

    await service.updateStatus('company-a', 'user-1', { status: 'active' as any }, 'manager');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { status: 'active' },
      select: expect.any(Object),
    });
  });

  it('blocks updateSettings() on a user from another company before touching prisma.update', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.updateSettings('company-a', 'user-of-company-b', { gpsClockInEnabled: false }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('lets updateSettings() reset the GPS override to null (inherit company default)', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1', companyId: 'company-a' });
    prisma.user.update.mockResolvedValue({ id: 'user-1', gpsClockInEnabled: null });

    await service.updateSettings('company-a', 'user-1', { gpsClockInEnabled: null });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { gpsClockInEnabled: null, siteId: undefined },
      select: expect.any(Object),
    });
  });

  it('rejects updateSettings() assigning a site from another company, before touching prisma.update', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'user-1', companyId: 'company-a' }); // findOne
    prisma.site.findFirst.mockResolvedValue(null); // ensureSiteInCompany

    await expect(
      service.updateSettings('company-a', 'user-1', { siteId: 'site-of-company-b' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.site.findFirst).toHaveBeenCalledWith({
      where: { id: 'site-of-company-b', companyId: 'company-a' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('lets updateSettings() assign an employee to a site of their own company', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'user-1', companyId: 'company-a', siteId: null }); // findOne
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1', companyId: 'company-a' });
    prisma.user.update.mockResolvedValue({ id: 'user-1', siteId: 'site-1' });

    await service.updateSettings('company-a', 'user-1', { siteId: 'site-1' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { gpsClockInEnabled: undefined, siteId: 'site-1' },
      select: expect.any(Object),
    });
  });

  it('lets updateSettings() clear the site (siteId: null) without validating a site', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'user-1', companyId: 'company-a', siteId: 'site-1' }); // findOne
    prisma.user.update.mockResolvedValue({ id: 'user-1', siteId: null });

    await service.updateSettings('company-a', 'user-1', { siteId: null });

    expect(prisma.site.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { gpsClockInEnabled: undefined, siteId: null },
      select: expect.any(Object),
    });
  });

  it('cancels future active shift assignments when updateSettings() actually changes the site', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'user-1', companyId: 'company-a', siteId: 'site-1' }); // findOne
    prisma.site.findFirst.mockResolvedValue({ id: 'site-2', companyId: 'company-a' });
    prisma.user.update.mockResolvedValue({ id: 'user-1', siteId: 'site-2' });

    await service.updateSettings('company-a', 'user-1', { siteId: 'site-2' });

    expect(prisma.shiftAssignment.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: { not: 'cancelled' },
        shift: { startsAt: { gt: expect.any(Date) } },
      },
      data: { status: 'cancelled' },
    });
    expect(prisma.shiftApplication.deleteMany).toHaveBeenCalledWith({
      where: { userId: expect.any(String), shift: { startsAt: { gt: expect.any(Date) } } },
    });
    expect(realtime.emitToCompany).toHaveBeenCalledWith('company-a', 'shifts:changed');
  });

  it('does not touch shift assignments when updateSettings() keeps the same site', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'user-1', companyId: 'company-a', siteId: 'site-1' }); // findOne
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1', companyId: 'company-a' });
    prisma.user.update.mockResolvedValue({ id: 'user-1', siteId: 'site-1' });

    await service.updateSettings('company-a', 'user-1', { siteId: 'site-1' });

    expect(prisma.shiftAssignment.updateMany).not.toHaveBeenCalled();
    expect(realtime.emitToCompany).not.toHaveBeenCalled();
  });

  it('does not touch shift assignments when updateSettings() only changes an unrelated field', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'user-1', companyId: 'company-a', siteId: 'site-1' }); // findOne
    prisma.user.update.mockResolvedValue({ id: 'user-1', gpsClockInEnabled: true });

    await service.updateSettings('company-a', 'user-1', { gpsClockInEnabled: true });

    expect(prisma.shiftAssignment.updateMany).not.toHaveBeenCalled();
    expect(realtime.emitToCompany).not.toHaveBeenCalled();
  });

  it('rejects invite() when the email is already used, even across companies', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

    await expect(
      service.invite('company-a', {
        email: 'taken@example.com',
        firstName: 'A',
        lastName: 'B',
      }, 'manager'),
    ).rejects.toThrow(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates invited users scoped to the caller companyId', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'new-user' });

    await service.invite('company-a', {
      email: 'new@example.com',
      firstName: 'A',
      lastName: 'B',
    }, 'manager');

    const call = prisma.user.create.mock.calls[0][0];
    expect(call.data.companyId).toBe('company-a');
    expect(call.data.status).toBe('invited');
  });

  it('rejects invite() with a site from another company, before touching prisma.create', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.site.findFirst.mockResolvedValue(null);

    await expect(
      service.invite('company-a', {
        email: 'new@example.com',
        firstName: 'A',
        lastName: 'B',
        siteId: 'site-of-company-b',
      }, 'manager'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates an invited user already attached to a site of the caller company', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1', companyId: 'company-a' });
    prisma.user.create.mockResolvedValue({ id: 'new-user' });

    await service.invite('company-a', {
      email: 'new@example.com',
      firstName: 'A',
      lastName: 'B',
      siteId: 'site-1',
    }, 'manager');

    const call = prisma.user.create.mock.calls[0][0];
    expect(call.data.siteId).toBe('site-1');
  });

  describe('admin role protection', () => {
    const admin = { id: 'admin-1', companyId: 'company-a', role: 'admin', status: 'active' };
    const employee = { id: 'user-1', companyId: 'company-a', role: 'employee', status: 'active' };

    it('forbids a manager from inviting an admin', async () => {
      await expect(
        service.invite('company-a', { email: 'x@example.com', firstName: 'A', lastName: 'B', role: 'admin' as any }, 'manager'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('lets an admin invite an admin', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'new-admin' });

      await service.invite('company-a', { email: 'x@example.com', firstName: 'A', lastName: 'B', role: 'admin' as any }, 'admin');

      expect(prisma.user.create.mock.calls[0][0].data.role).toBe('admin');
    });

    it('forbids a manager from promoting someone (including themselves) to admin', async () => {
      prisma.user.findFirst.mockResolvedValue(employee);

      await expect(service.updateRole('company-a', 'user-1', { role: 'admin' as any }, 'manager')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('forbids a manager from demoting an admin', async () => {
      prisma.user.findFirst.mockResolvedValue(admin);

      await expect(service.updateRole('company-a', 'admin-1', { role: 'employee' as any }, 'manager')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('forbids a manager from changing the status of an admin', async () => {
      prisma.user.findFirst.mockResolvedValue(admin);

      await expect(service.updateStatus('company-a', 'admin-1', { status: 'disabled' as any }, 'manager')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('still lets a manager change roles between employee and manager', async () => {
      prisma.user.findFirst.mockResolvedValue(employee);
      prisma.user.update.mockResolvedValue({ ...employee, role: 'manager' });

      await service.updateRole('company-a', 'user-1', { role: 'manager' as any }, 'manager');

      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { role: 'manager' } }));
    });

    it('refuses to demote the last active admin, even for an admin', async () => {
      prisma.user.findFirst.mockResolvedValue(admin);
      prisma.user.count.mockResolvedValue(0);

      await expect(service.updateRole('company-a', 'admin-1', { role: 'manager' as any }, 'admin')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { companyId: 'company-a', role: 'admin', status: 'active', id: { not: 'admin-1' } },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses to disable the last active admin', async () => {
      prisma.user.findFirst.mockResolvedValue(admin);
      prisma.user.count.mockResolvedValue(0);

      await expect(service.updateStatus('company-a', 'admin-1', { status: 'disabled' as any }, 'admin')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('lets an admin demote another admin when one active admin remains', async () => {
      prisma.user.findFirst.mockResolvedValue(admin);
      prisma.user.count.mockResolvedValue(1);
      prisma.user.update.mockResolvedValue({ ...admin, role: 'manager' });

      await service.updateRole('company-a', 'admin-1', { role: 'manager' as any }, 'admin');

      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  describe('kiosk PIN', () => {
    it('generates a 4-digit PIN on invite, stored both hashed and encrypted', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'new-user' });

      await service.invite('company-a', { email: 'n@example.com', firstName: 'A', lastName: 'B' }, 'manager');

      const { data } = prisma.user.create.mock.calls[0][0];
      const pin = decryptPin(data.pinCodeEncrypted);
      expect(pin).toMatch(/^\d{4}$/);
      expect(await bcrypt.compare(pin, data.pinCodeHash)).toBe(true);
    });

    it('never reuses a PIN already given to someone else in the company', async () => {
      // Tous les PIN pris sauf 0042 : la génération ne peut tomber que dessus.
      const taken = Array.from({ length: 10_000 }, (_, i) => String(i).padStart(4, '0')).filter((p) => p !== '0042');
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', companyId: 'company-a' });
      prisma.user.findMany.mockResolvedValue(taken.map((p) => ({ pinCodeEncrypted: encryptPin(p) })));

      const { pin } = await service.regeneratePin('company-a', 'user-1');

      expect(pin).toBe('0042');
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-a', id: { not: 'user-1' } }) }),
      );
    });

    it('rejects a manual PIN already used by another member of the company', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', companyId: 'company-a' });
      prisma.user.findMany.mockResolvedValue([{ pinCodeEncrypted: encryptPin('1234') }]);

      await expect(service.setPin('company-a', 'user-1', { pin: '1234' })).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('returns the readable PIN, scoped to the caller company', async () => {
      prisma.user.findFirst.mockResolvedValue({ pinCodeEncrypted: encryptPin('0815') });

      await expect(service.getPin('company-a', 'user-1')).resolves.toEqual({ pin: '0815' });
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1', companyId: 'company-a' } }),
      );
    });

    it('refuses to reveal the PIN of a user from another company', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.getPin('company-a', 'user-of-company-b')).rejects.toThrow(NotFoundException);
    });

    it('lists kiosk employees of the device company and site (or without site), never disabled ones', async () => {
      await service.listKioskEmployees('company-a', 'site-a');

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          companyId: 'company-a',
          status: { not: 'disabled' },
          pinCodeHash: { not: null },
          OR: [{ siteId: 'site-a' }, { siteId: null }],
        },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      });
    });

    describe('verifyPin', () => {
      let pinCodeHash: string;
      beforeAll(async () => {
        pinCodeHash = await bcrypt.hash('2468', 4);
      });

      it('accepts the right PIN for the chosen employee, scoped to the device company', async () => {
        prisma.user.findFirst.mockResolvedValue({ id: 'user-1', badgeCode: null, firstName: 'A', lastName: 'B', pinCodeHash });

        const user = await service.verifyPin('company-a', 'user-1', '2468');

        expect(user).toEqual({ id: 'user-1', badgeCode: null, firstName: 'A', lastName: 'B' });
        expect(prisma.user.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'user-1', companyId: 'company-a', status: { not: 'disabled' } } }),
        );
      });

      it('returns null for a wrong PIN or an employee outside the company', async () => {
        prisma.user.findFirst.mockResolvedValueOnce({ id: 'user-1', pinCodeHash }).mockResolvedValueOnce(null);

        await expect(service.verifyPin('company-a', 'user-1', '0000')).resolves.toBeNull();
        await expect(service.verifyPin('company-a', 'user-of-company-b', '2468')).resolves.toBeNull();
      });

      it('locks the employee after 5 wrong PINs in a row, even for the right PIN', async () => {
        prisma.user.findFirst.mockResolvedValue({ id: 'user-1', pinCodeHash });

        for (let i = 0; i < 5; i++) {
          await expect(service.verifyPin('company-a', 'user-1', '0000')).resolves.toBeNull();
        }
        await expect(service.verifyPin('company-a', 'user-1', '2468')).rejects.toThrow(ForbiddenException);
      });

      it('resets the failure count after a successful PIN', async () => {
        prisma.user.findFirst.mockResolvedValue({ id: 'user-1', pinCodeHash });

        for (let i = 0; i < 4; i++) await service.verifyPin('company-a', 'user-1', '0000');
        await expect(service.verifyPin('company-a', 'user-1', '2468')).resolves.not.toBeNull();
        await expect(service.verifyPin('company-a', 'user-1', '0000')).resolves.toBeNull();
        await expect(service.verifyPin('company-a', 'user-1', '2468')).resolves.not.toBeNull();
      });
    });

    it('backfills a PIN for every account without an encrypted one', async () => {
      prisma.user.findMany
        .mockResolvedValueOnce([{ id: 'user-1', companyId: 'company-a' }])
        .mockResolvedValueOnce([]);

      await expect(service.backfillMissingPins()).resolves.toBe(1);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { pinCodeHash: expect.any(String), pinCodeEncrypted: expect.any(String) },
      });
    });
  });

  describe('resolveByPin', () => {
    it('scopes candidates to companyId and only considers users with a PIN set', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.resolveByPin('company-a', '1234');

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { companyId: 'company-a', pinCodeHash: { not: null } },
        select: { id: true, badgeCode: true, firstName: true, lastName: true, pinCodeHash: true },
      });
    });

    it('returns null when no candidate matches the PIN', async () => {
      const pinCodeHash = await bcrypt.hash('4321', 4);
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-1', badgeCode: null, firstName: 'A', lastName: 'B', pinCodeHash },
      ]);

      const result = await service.resolveByPin('company-a', '0000');

      expect(result).toBeNull();
    });

    it('identifies the employee by PIN alone, without ever leaking the hash', async () => {
      const pinCodeHash = await bcrypt.hash('4321', 4);
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          badgeCode: null,
          firstName: 'A',
          lastName: 'One',
          pinCodeHash: await bcrypt.hash('9999', 4),
        },
        { id: 'user-2', badgeCode: 'BADGE2', firstName: 'B', lastName: 'Two', pinCodeHash },
      ]);

      const result = await service.resolveByPin('company-a', '4321');

      expect(result).toEqual({ id: 'user-2', badgeCode: 'BADGE2', firstName: 'B', lastName: 'Two' });
    });
  });
});

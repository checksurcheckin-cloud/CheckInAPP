import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { UsersService } from './users.service';

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
    };
    site: {
      findFirst: jest.Mock;
    };
    shiftAssignment: {
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      site: {
        findFirst: jest.fn(),
      },
      shiftAssignment: {
        updateMany: jest.fn(),
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
      service.updateRole('company-a', 'user-of-company-b', { role: 'manager' as any }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('blocks updateStatus() on a user from another company before touching prisma.update', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.updateStatus('company-a', 'user-of-company-b', { status: 'active' as any }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('lets updateStatus() move an invited user to active', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1', companyId: 'company-a' });
    prisma.user.update.mockResolvedValue({ id: 'user-1', status: 'active' });

    await service.updateStatus('company-a', 'user-1', { status: 'active' as any });

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
      }),
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
    });

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
      }),
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
    });

    const call = prisma.user.create.mock.calls[0][0];
    expect(call.data.siteId).toBe('site-1');
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

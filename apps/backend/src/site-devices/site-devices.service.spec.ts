import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SiteDevicesService } from './site-devices.service';

describe('SiteDevicesService', () => {
  let service: SiteDevicesService;
  let prisma: {
    site: { findFirst: jest.Mock };
    siteDevice: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    user: { findUnique: jest.Mock; update: jest.Mock };
  };
  let jwt: { sign: jest.Mock };
  let usersService: { resolveByPin: jest.Mock };

  beforeEach(async () => {
    prisma = {
      site: { findFirst: jest.fn() },
      siteDevice: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: { findUnique: jest.fn(), update: jest.fn() },
    };
    jwt = { sign: jest.fn().mockReturnValue('signed-token') };
    usersService = { resolveByPin: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SiteDevicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get(SiteDevicesService);
  });

  it('refuses to create a device on a site from another company', async () => {
    prisma.site.findFirst.mockResolvedValue(null);

    await expect(
      service.create('company-a', { siteId: 'site-of-company-b', deviceLabel: 'Caisse 1' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.siteDevice.create).not.toHaveBeenCalled();
  });

  it('scopes findAll() through the site companyId', async () => {
    prisma.site.findFirst.mockResolvedValue({ id: 'site-a', companyId: 'company-a' });
    prisma.siteDevice.findMany.mockResolvedValue([]);

    await service.findAll('company-a', 'site-a');

    expect(prisma.site.findFirst).toHaveBeenCalledWith({
      where: { id: 'site-a', companyId: 'company-a' },
    });
    expect(prisma.siteDevice.findMany).toHaveBeenCalledWith({ where: { siteId: 'site-a' } });
  });

  it('blocks rotateSecret() on a device belonging to another company', async () => {
    prisma.siteDevice.findFirst.mockResolvedValue(null);

    await expect(service.rotateSecret('company-a', 'device-of-company-b')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.siteDevice.update).not.toHaveBeenCalled();
  });

  it('rejects authenticate() with a wrong qrSecret', async () => {
    prisma.siteDevice.findUnique.mockResolvedValue({
      id: 'device-1',
      siteId: 'site-a',
      qrSecret: 'correct-secret',
      site: { companyId: 'company-a' },
    });

    await expect(
      service.authenticate({ deviceId: 'device-1', qrSecret: 'wrong-secret' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it('rejects authenticate() for an unknown device', async () => {
    prisma.siteDevice.findUnique.mockResolvedValue(null);

    await expect(
      service.authenticate({ deviceId: 'unknown', qrSecret: 'whatever' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('issues a device-scoped token (with companyId derived from the site) on valid credentials', async () => {
    prisma.siteDevice.findUnique.mockResolvedValue({
      id: 'device-1',
      siteId: 'site-a',
      qrSecret: 'correct-secret',
      site: { companyId: 'company-a' },
    });

    const result = await service.authenticate({
      deviceId: 'device-1',
      qrSecret: 'correct-secret',
    });

    expect(result.deviceToken).toBe('signed-token');
    expect(jwt.sign.mock.calls[0][0]).toEqual({
      deviceId: 'device-1',
      siteId: 'site-a',
      companyId: 'company-a',
      type: 'device',
    });
  });

  describe('enrollBadge', () => {
    it('rejects an invalid PIN', async () => {
      usersService.resolveByPin.mockResolvedValue(null);

      await expect(
        service.enrollBadge('company-a', { pin: '0000', badgeCode: 'NEWBADGE' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses a badgeCode already attributed to a different employee', async () => {
      usersService.resolveByPin.mockResolvedValue({ id: 'user-1', badgeCode: null });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2' });

      await expect(
        service.enrollBadge('company-a', { pin: '1234', badgeCode: 'TAKEN' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('links the badge to the employee identified by PIN', async () => {
      usersService.resolveByPin.mockResolvedValue({ id: 'user-1', badgeCode: null });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue({ id: 'user-1', badgeCode: 'NEWBADGE' });

      await service.enrollBadge('company-a', { pin: '1234', badgeCode: 'NEWBADGE' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { badgeCode: 'NEWBADGE' },
        select: { id: true, firstName: true, lastName: true, badgeCode: true },
      });
    });
  });
});

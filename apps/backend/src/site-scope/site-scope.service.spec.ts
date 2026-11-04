import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SiteScopeService } from './site-scope.service';

describe('SiteScopeService (décision #36)', () => {
  let service: SiteScopeService;
  let prisma: {
    managedSite: { findMany: jest.Mock };
    shift: { findFirst: jest.Mock };
    shiftOffer: { findFirst: jest.Mock };
    user: { findFirst: jest.Mock };
  };

  const admin = { userId: 'admin-1', companyId: 'company-a', role: 'admin' as const };
  const manager = { userId: 'manager-1', companyId: 'company-a', role: 'manager' as const };

  beforeEach(async () => {
    prisma = {
      managedSite: { findMany: jest.fn().mockResolvedValue([]) },
      shift: { findFirst: jest.fn() },
      shiftOffer: { findFirst: jest.fn() },
      user: { findFirst: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [SiteScopeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(SiteScopeService);
  });

  it('gives an admin every site without querying managed sites', async () => {
    await expect(service.managedSiteIds(admin)).resolves.toBeNull();
    expect(prisma.managedSite.findMany).not.toHaveBeenCalled();
  });

  it('gives a manager with no managed site every site (existing accounts keep working)', async () => {
    await expect(service.managedSiteIds(manager)).resolves.toBeNull();
    await expect(service.ensureSite(manager, 'any-site')).resolves.toBeUndefined();
  });

  it('scopes the managed-sites lookup to the caller company', async () => {
    await service.managedSiteIds(manager);
    expect(prisma.managedSite.findMany).toHaveBeenCalledWith({
      where: { userId: 'manager-1', site: { companyId: 'company-a' } },
      select: { siteId: true },
    });
  });

  it('refuses a site outside the managed ones', async () => {
    prisma.managedSite.findMany.mockResolvedValue([{ siteId: 'ixelles' }]);
    await expect(service.ensureSite(manager, 'ixelles')).resolves.toBeUndefined();
    await expect(service.ensureSite(manager, 'bruxelles')).rejects.toThrow(ForbiddenException);
    await expect(service.ensureAllSites(manager)).rejects.toThrow(ForbiddenException);
  });

  it("checks a shift's real site, rescoped by company", async () => {
    prisma.managedSite.findMany.mockResolvedValue([{ siteId: 'ixelles' }]);
    prisma.shift.findFirst.mockResolvedValueOnce({ siteId: 'bruxelles' });
    await expect(service.ensureShift(manager, 'shift-1')).rejects.toThrow(ForbiddenException);
    expect(prisma.shift.findFirst).toHaveBeenCalledWith({
      where: { id: 'shift-1', site: { companyId: 'company-a' } },
      select: { siteId: true },
    });

    prisma.shift.findFirst.mockResolvedValueOnce(null);
    await expect(service.ensureShift(manager, 'shift-of-company-b')).rejects.toThrow(NotFoundException);
  });

  it('lets a scoped manager act on employees of their sites or unassigned ones, never on other managers', async () => {
    prisma.managedSite.findMany.mockResolvedValue([{ siteId: 'ixelles' }]);

    prisma.user.findFirst.mockResolvedValueOnce({ role: 'employee', siteId: 'ixelles' });
    await expect(service.ensureUser(manager, 'u1')).resolves.toBeUndefined();

    prisma.user.findFirst.mockResolvedValueOnce({ role: 'employee', siteId: null });
    await expect(service.ensureUser(manager, 'u2')).resolves.toBeUndefined();

    prisma.user.findFirst.mockResolvedValueOnce({ role: 'employee', siteId: 'bruxelles' });
    await expect(service.ensureUser(manager, 'u3')).rejects.toThrow(ForbiddenException);

    prisma.user.findFirst.mockResolvedValueOnce({ role: 'manager', siteId: null });
    await expect(service.ensureUser(manager, 'u4')).rejects.toThrow(ForbiddenException);
  });
});

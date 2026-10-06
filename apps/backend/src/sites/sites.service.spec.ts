import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SitesService } from './sites.service';

describe('SitesService', () => {
  let service: SitesService;
  let prisma: {
    site: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      site: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [SitesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(SitesService);
  });

  it('scopes create() to the caller companyId regardless of dto content', async () => {
    prisma.site.create.mockResolvedValue({ id: 'site-1' });

    await service.create('company-a', { name: 'Site A' });

    expect(prisma.site.create).toHaveBeenCalledWith({
      data: { name: 'Site A', companyId: 'company-a' },
    });
  });

  it('scopes findAll() by companyId', async () => {
    prisma.site.findMany.mockResolvedValue([]);

    await service.findAll('company-a');

    expect(prisma.site.findMany).toHaveBeenCalledWith({ where: { companyId: 'company-a' } });
  });

  it('never returns a site belonging to another company (findFirst filtered by companyId)', async () => {
    prisma.site.findFirst.mockResolvedValue(null);

    await expect(service.findOne('company-a', 'site-of-company-b')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.site.findFirst).toHaveBeenCalledWith({
      where: { id: 'site-of-company-b', companyId: 'company-a' },
    });
  });

  it('blocks update() on a site from another company before touching prisma.update', async () => {
    prisma.site.findFirst.mockResolvedValue(null);

    await expect(service.update('company-a', 'site-of-company-b', { name: 'x' })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.site.update).not.toHaveBeenCalled();
  });

  it('blocks remove() on a site from another company before touching prisma.delete', async () => {
    prisma.site.findFirst.mockResolvedValue(null);

    await expect(service.remove('company-a', 'site-of-company-b')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.site.delete).not.toHaveBeenCalled();
  });
});

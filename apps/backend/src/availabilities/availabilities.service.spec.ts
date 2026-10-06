import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AvailabilitiesService } from './availabilities.service';

describe('AvailabilitiesService', () => {
  let service: AvailabilitiesService;
  let prisma: {
    availability: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock; delete: jest.Mock };
  };
  let realtime: { emitToCompany: jest.Mock };

  beforeEach(async () => {
    prisma = {
      availability: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    realtime = { emitToCompany: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AvailabilitiesService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeGateway, useValue: realtime },
      ],
    }).compile();

    service = module.get(AvailabilitiesService);
  });

  it('always creates the availability for the authenticated user', async () => {
    prisma.availability.create.mockResolvedValue({ id: 'avail-1' });

    await service.create('company-a', 'user-1', {
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '17:00',
    } as any);

    expect(prisma.availability.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1' }),
    });
    expect(realtime.emitToCompany).toHaveBeenCalledWith('company-a', 'availabilities:changed');
  });

  it('forces an employee to only see their own availabilities, ignoring ?userId=', async () => {
    prisma.availability.findMany.mockResolvedValue([]);

    await service.findAll('company-a', 'user-1', 'employee', 'someone-else');

    const call = prisma.availability.findMany.mock.calls[0][0];
    expect(call.where.userId).toBe('user-1');
    expect(call.where.user).toEqual({ companyId: 'company-a' });
  });

  it('lets a manager filter by any userId within the company', async () => {
    prisma.availability.findMany.mockResolvedValue([]);

    await service.findAll('company-a', 'manager-1', 'manager', 'user-2');

    expect(prisma.availability.findMany.mock.calls[0][0].where.userId).toBe('user-2');
  });

  it('lets a manager list every availability in the company when no userId is given', async () => {
    prisma.availability.findMany.mockResolvedValue([]);

    await service.findAll('company-a', 'manager-1', 'manager', undefined);

    const call = prisma.availability.findMany.mock.calls[0][0];
    expect(call.where.userId).toBeUndefined();
    expect(call.where.user).toEqual({ companyId: 'company-a' });
  });

  describe('update', () => {
    it('blocks editing an availability from another company', async () => {
      prisma.availability.findFirst.mockResolvedValue(null);

      await expect(
        service.update('company-a', 'user-1', 'employee', 'avail-of-company-b', { isAvailable: false }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.availability.update).not.toHaveBeenCalled();
    });

    it("blocks an employee from editing a colleague's availability", async () => {
      prisma.availability.findFirst.mockResolvedValue({ id: 'avail-1', userId: 'user-2' });

      await expect(
        service.update('company-a', 'user-1', 'employee', 'avail-1', { isAvailable: false }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.availability.update).not.toHaveBeenCalled();
    });

    it('lets a manager edit any availability within the company', async () => {
      prisma.availability.findFirst.mockResolvedValue({ id: 'avail-1', userId: 'user-2' });
      prisma.availability.update.mockResolvedValue({ id: 'avail-1', isAvailable: false });

      await service.update('company-a', 'manager-1', 'manager', 'avail-1', { isAvailable: false });

      expect(prisma.availability.update).toHaveBeenCalledWith({
        where: { id: 'avail-1' },
        data: { isAvailable: false },
      });
    });

    it('only patches the fields provided', async () => {
      prisma.availability.findFirst.mockResolvedValue({ id: 'avail-1', userId: 'user-1' });
      prisma.availability.update.mockResolvedValue({ id: 'avail-1' });

      await service.update('company-a', 'user-1', 'employee', 'avail-1', { startTime: '10:00' });

      expect(prisma.availability.update).toHaveBeenCalledWith({
        where: { id: 'avail-1' },
        data: { startTime: '10:00' },
      });
    });
  });

  describe('remove', () => {
    it("blocks an employee from deleting a colleague's availability", async () => {
      prisma.availability.findFirst.mockResolvedValue({ id: 'avail-1', userId: 'user-2' });

      await expect(service.remove('company-a', 'user-1', 'employee', 'avail-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.availability.delete).not.toHaveBeenCalled();
    });

    it('deletes an owned availability', async () => {
      prisma.availability.findFirst.mockResolvedValue({ id: 'avail-1', userId: 'user-1' });
      prisma.availability.delete.mockResolvedValue({ id: 'avail-1' });

      await service.remove('company-a', 'user-1', 'employee', 'avail-1');

      expect(prisma.availability.delete).toHaveBeenCalledWith({ where: { id: 'avail-1' } });
    });
  });
});

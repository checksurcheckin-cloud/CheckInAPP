import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ComplianceService } from './compliance.service';

describe('ComplianceService', () => {
  let prisma: {
    shiftAssignment: { findMany: jest.Mock };
    user: { findMany: jest.Mock; count: jest.Mock };
    shift: { count: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let service: ComplianceService;

  const query = { from: '2026-11-16T00:00:00.000Z', to: '2026-11-23T00:00:00.000Z' };

  beforeEach(() => {
    prisma = {
      shiftAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn() },
      shift: { count: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    service = new ComplianceService(prisma as never);
  });

  it('only looks at shifts and employees of the caller company', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValueOnce([{ userId: 'u1' }]).mockResolvedValueOnce([
      {
        userId: 'u1',
        shift: {
          id: 's1',
          startsAt: new Date('2026-11-16T07:00:00Z'),
          endsAt: new Date('2026-11-16T20:00:00Z'),
          status: 'published',
          site: { timezone: 'Europe/Brussels', jointCommittee: null, company: { jointCommittee: '302' } },
        },
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', contractType: null, weeklyContractHours: null, birthDate: null },
    ]);

    const report = await service.check('company-a', { ...query, siteId: 'site-1' });

    expect(prisma.shiftAssignment.findMany.mock.calls[0][0].where.shift.site).toEqual({
      companyId: 'company-a',
      id: 'site-1',
    });
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['u1'] }, companyId: 'company-a' });
    expect(prisma.shiftAssignment.findMany.mock.calls[1][0].where.shift.site).toEqual({ companyId: 'company-a' });
    expect(report.violations.map((v) => v.ruleId)).toContain('daily_absolute');
    expect(report.missingContract).toEqual(['u1']);
  });

  it('rejects an inverted or oversized range', async () => {
    await expect(service.check('company-a', { from: query.to, to: query.from })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.check('company-a', { from: '2026-01-01T00:00:00Z', to: '2026-06-01T00:00:00Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses to log an acknowledgement for another company's shift", async () => {
    prisma.shift.count.mockResolvedValue(0);

    await expect(
      service.acknowledge('company-a', 'manager-1', { shiftIds: ['shift-of-b'], violations: [] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.shift.count).toHaveBeenCalledWith({
      where: { id: { in: ['shift-of-b'] }, site: { companyId: 'company-a' } },
    });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('logs the acknowledged warnings in the audit log', async () => {
    prisma.shift.count.mockResolvedValue(1);
    prisma.user.count.mockResolvedValue(1);
    const violation = { ruleId: 'daily_rest', severity: 'error' as const, userId: 'u1', shiftIds: ['s1'], message: 'x' };

    await service.acknowledge('company-a', 'manager-1', { shiftIds: ['s1'], violations: [violation] });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company-a',
        actorId: 'manager-1',
        action: 'compliance_warnings_acknowledged',
      }),
    });
  });
});

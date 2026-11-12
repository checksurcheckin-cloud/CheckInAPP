import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ComplianceShift, Violation, checkEmployee } from './compliance.engine';
import { CheckComplianceQueryDto } from './dto/check-compliance-query.dto';
import { AcknowledgeComplianceDto } from './dto/acknowledge-compliance.dto';
import { RULE_PACKS } from './rule-packs';

const DAY = 24 * 3_600_000;
// Marge chargée autour de la période : repos entre deux journées, semaines
// entamées et repos compensatoire du dimanche (6 jours).
const MARGIN = 8 * DAY;
// Mois affiché par le planning + débordement des semaines.
const MAX_RANGE = 45 * DAY;

export interface ComplianceReport {
  violations: Violation[];
  // Employés planifiés dont le contrat n'est pas renseigné : leurs contrôles
  // tournent avec les règles d'un temps plein majeur.
  missingContract: string[];
}

@Injectable()
export class ComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  listRulePacks() {
    return RULE_PACKS.map((p) => ({ code: p.code, label: p.label, toValidate: p.toValidate, sources: p.sources }));
  }

  // Contrôle de tous les employés qui ont un shift sur la période (du site
  // demandé, ou de toute l'entreprise). Chaque employé est contrôlé sur TOUS
  // ses shifts, tous sites confondus : les limites sont personnelles.
  async check(companyId: string, query: CheckComplianceQueryDto, now = new Date()): Promise<ComplianceReport> {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (!(to > from) || to.getTime() - from.getTime() > MAX_RANGE) {
      throw new BadRequestException('Période invalide (45 jours maximum)');
    }

    const scheduled = await this.prisma.shiftAssignment.findMany({
      where: {
        status: { not: 'cancelled' },
        shift: {
          status: { not: 'cancelled' },
          startsAt: { lt: to },
          endsAt: { gt: from },
          site: { companyId, ...(query.siteId ? { id: query.siteId } : {}) },
        },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    const userIds = scheduled.map((a) => a.userId);
    if (userIds.length === 0) return { violations: [], missingContract: [] };

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, companyId },
      select: { id: true, contractType: true, weeklyContractHours: true, birthDate: true },
    });

    // Un étudiant est contrôlé sur son contingent annuel : toute l'année.
    const yearStart = new Date(Date.UTC(from.getUTCFullYear(), 0, 1) - DAY);
    const assignments = await this.prisma.shiftAssignment.findMany({
      where: {
        userId: { in: users.map((u) => u.id) },
        status: { not: 'cancelled' },
        shift: {
          status: { not: 'cancelled' },
          site: { companyId },
          startsAt: { lt: new Date(to.getTime() + MARGIN) },
          endsAt: { gt: users.some((u) => u.contractType === 'student') ? yearStart : new Date(from.getTime() - MARGIN) },
        },
      },
      select: {
        userId: true,
        shift: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            site: { select: { timezone: true, jointCommittee: true, company: { select: { jointCommittee: true } } } },
          },
        },
      },
    });

    const shiftsByUser = new Map<string, ComplianceShift[]>();
    for (const a of assignments) {
      const list = shiftsByUser.get(a.userId) ?? [];
      list.push({
        id: a.shift.id,
        startsAt: a.shift.startsAt,
        endsAt: a.shift.endsAt,
        status: a.shift.status,
        timezone: a.shift.site.timezone ?? 'Europe/Brussels',
        jointCommittee: a.shift.site.jointCommittee ?? a.shift.site.company.jointCommittee,
      });
      shiftsByUser.set(a.userId, list);
    }

    const marginStart = new Date(from.getTime() - MARGIN);
    const violations: Violation[] = [];
    for (const user of users) {
      const all = shiftsByUser.get(user.id) ?? [];
      const shifts = user.contractType === 'student' ? all : all.filter((s) => s.endsAt > marginStart);
      violations.push(
        ...checkEmployee({
          employee: {
            id: user.id,
            contractType: user.contractType,
            weeklyContractHours: user.weeklyContractHours,
            birthDate: user.birthDate,
          },
          shifts,
          window: { from, to },
          now,
        }),
      );
    }

    return {
      violations,
      missingContract: users.filter((u) => !u.contractType).map((u) => u.id),
    };
  }

  // Trace dans l'AuditLog qu'un manager a publié malgré des alertes —
  // l'avertissement n'est pas bloquant, mais il doit être assumé.
  async acknowledge(companyId: string, actorId: string, dto: AcknowledgeComplianceDto) {
    const shiftIds = [...new Set([...dto.shiftIds, ...dto.violations.flatMap((v) => v.shiftIds)])];
    const owned = await this.prisma.shift.count({ where: { id: { in: shiftIds }, site: { companyId } } });
    if (owned !== shiftIds.length) throw new NotFoundException('Shift introuvable');
    const userIds = [...new Set(dto.violations.map((v) => v.userId))];
    const users = await this.prisma.user.count({ where: { id: { in: userIds }, companyId } });
    if (users !== userIds.length) throw new NotFoundException('Employé introuvable');

    await this.prisma.auditLog.create({
      data: {
        companyId,
        actorId,
        action: 'compliance_warnings_acknowledged',
        targetTable: 'shifts',
        payload: {
          shiftIds: dto.shiftIds,
          violations: dto.violations.map((v) => ({ ...v })),
        },
      },
    });
  }
}


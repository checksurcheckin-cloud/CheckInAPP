import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedPlatformAdmin } from './platform-jwt';
import { UpdateSubscriptionDto } from './dto/platform.dto';

// Une tablette est "en ligne" si elle a appelé l'API dans les 10 dernières
// minutes (SiteDevice.lastSeenAt, mis à jour au plus une fois par minute).
const ONLINE_WINDOW_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// RÈGLE DE CE FICHIER : chaque réponse est construite champ par champ (select
// Prisma explicite + fonction de mise en forme), jamais un objet Prisma
// renvoyé tel quel — aucun secret (qrSecret, passwordHash, pinCodeHash,
// pinCodeEncrypted, badgeCode, qrSecret utilisateur) ne doit pouvoir sortir
// de /platform/*, même si un include est ajouté plus tard.
const SUBSCRIPTION_SELECT = {
  plan: true,
  status: true,
  seats: true,
  trialEndsAt: true,
  currentPeriodEnd: true,
  notes: true,
  updatedAt: true,
} satisfies Prisma.SubscriptionSelect;

type SubscriptionRow = Prisma.SubscriptionGetPayload<{ select: typeof SUBSCRIPTION_SELECT }>;

function toSubscription(row: SubscriptionRow | null | undefined) {
  if (!row) return null;
  return {
    plan: row.plan,
    status: row.status,
    seats: row.seats,
    trialEndsAt: row.trialEndsAt,
    currentPeriodEnd: row.currentPeriodEnd,
    notes: row.notes,
    updatedAt: row.updatedAt,
  };
}

function isOnline(lastSeenAt: Date | null, now: number) {
  return lastSeenAt !== null && now - lastSeenAt.getTime() < ONLINE_WINDOW_MS;
}

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS);
    const inAWeek = new Date(now.getTime() + 7 * DAY_MS);

    const [companies, byStatus, activeUsers, employees, sites, devices, onlineDevices, clockInsToday, upcomingShifts, recent] =
      await Promise.all([
        this.prisma.company.count(),
        this.prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.user.count({ where: { status: 'active' } }),
        this.prisma.user.count({ where: { status: 'active', role: 'employee' } }),
        this.prisma.site.count(),
        this.prisma.siteDevice.count(),
        this.prisma.siteDevice.count({ where: { lastSeenAt: { gte: onlineSince } } }),
        this.prisma.timeEntry.count({ where: { type: 'clock_in', timestamp: { gte: startOfDay } } }),
        this.prisma.shift.count({ where: { status: 'published', startsAt: { gte: now, lt: inAWeek } } }),
        this.prisma.company.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, name: true, createdAt: true, subscription: { select: SUBSCRIPTION_SELECT } },
        }),
      ]);

    const statusCounts = Object.fromEntries(Object.values(SubscriptionStatus).map((s) => [s, 0])) as Record<
      SubscriptionStatus,
      number
    >;
    let configured = 0;
    for (const row of byStatus) {
      statusCounts[row.status] = row._count._all;
      configured += row._count._all;
    }

    return {
      companies: { total: companies, bySubscriptionStatus: { ...statusCounts, none: companies - configured } },
      users: { active: activeUsers, activeEmployees: employees },
      sites,
      devices: { total: devices, online: onlineDevices },
      activity: { clockInsToday, publishedShiftsNext7Days: upcomingShifts },
      recentCompanies: recent.map((c) => ({
        id: c.id,
        name: c.name,
        createdAt: c.createdAt,
        subscription: toSubscription(c.subscription),
      })),
    };
  }

  async listCompanies() {
    const [companies, lastEntries] = await Promise.all([
      this.prisma.company.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          createdAt: true,
          jointCommittee: true,
          subscription: { select: SUBSCRIPTION_SELECT },
          _count: { select: { sites: true, users: { where: { status: 'active' } } } },
          sites: { select: { id: true, _count: { select: { devices: true } } } },
        },
      }),
      this.prisma.timeEntry.groupBy({ by: ['siteId'], _max: { timestamp: true } }),
    ]);

    const lastBySite = new Map(lastEntries.map((e) => [e.siteId, e._max.timestamp]));
    return companies.map((c) => {
      let lastActivityAt: Date | null = null;
      for (const site of c.sites) {
        const last = lastBySite.get(site.id);
        if (last && (!lastActivityAt || last > lastActivityAt)) lastActivityAt = last;
      }
      return {
        id: c.id,
        name: c.name,
        createdAt: c.createdAt,
        jointCommittee: c.jointCommittee,
        subscription: toSubscription(c.subscription),
        counts: {
          activeUsers: c._count.users,
          sites: c._count.sites,
          devices: c.sites.reduce((sum, s) => sum + s._count.devices, 0),
        },
        lastActivityAt,
      };
    });
  }

  async getCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        jointCommittee: true,
        planningMode: true,
        gpsClockInEnabled: true,
        mobileClockInEnabled: true,
        subscription: { select: SUBSCRIPTION_SELECT },
        sites: {
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            address: true,
            timezone: true,
            devices: { select: { id: true, deviceLabel: true, lastSeenAt: true, qrRotatedAt: true } },
          },
        },
        // Contacts côté client pour le support : les admins de l'entreprise.
        users: {
          where: { role: 'admin' },
          select: { id: true, firstName: true, lastName: true, email: true, status: true },
        },
      },
    });
    if (!company) {
      throw new NotFoundException('Entreprise introuvable');
    }

    const now = Date.now();
    const [usersByRole, clockIns7d, upcomingShifts, lastEntry, audit] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role', 'status'], where: { companyId }, _count: { _all: true } }),
      this.prisma.timeEntry.count({
        where: { type: 'clock_in', site: { companyId }, timestamp: { gte: new Date(now - 7 * DAY_MS) } },
      }),
      this.prisma.shift.count({
        where: { site: { companyId }, status: 'published', startsAt: { gte: new Date(now), lt: new Date(now + 7 * DAY_MS) } },
      }),
      this.prisma.timeEntry.aggregate({ where: { site: { companyId } }, _max: { timestamp: true } }),
      this.prisma.platformAuditLog.findMany({
        where: { targetType: 'company', targetId: companyId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: AUDIT_SELECT,
      }),
    ]);

    return {
      id: company.id,
      name: company.name,
      createdAt: company.createdAt,
      jointCommittee: company.jointCommittee,
      planningMode: company.planningMode,
      settings: { gpsClockInEnabled: company.gpsClockInEnabled, mobileClockInEnabled: company.mobileClockInEnabled },
      subscription: toSubscription(company.subscription),
      admins: company.users.map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        status: u.status,
      })),
      usersByRole: usersByRole.map((r) => ({ role: r.role, status: r.status, count: r._count._all })),
      sites: company.sites.map((s) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        timezone: s.timezone,
        devices: s.devices.map((d) => ({
          id: d.id,
          label: d.deviceLabel,
          lastSeenAt: d.lastSeenAt,
          online: isOnline(d.lastSeenAt, now),
          qrRotatedAt: d.qrRotatedAt,
        })),
      })),
      activity: {
        clockInsLast7Days: clockIns7d,
        publishedShiftsNext7Days: upcomingShifts,
        lastActivityAt: lastEntry._max.timestamp,
      },
      audit: audit.map(toAudit),
    };
  }

  // Champs absents = inchangés ; null = vidé. Toute modification est tracée
  // (avant/après) dans le journal de la console.
  async updateSubscription(admin: AuthenticatedPlatformAdmin, companyId: string, dto: UpdateSubscriptionDto) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) {
      throw new NotFoundException('Entreprise introuvable');
    }

    const data: Prisma.SubscriptionUncheckedUpdateInput = {};
    if (dto.plan !== undefined) data.plan = dto.plan;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.seats !== undefined) data.seats = dto.seats;
    if (dto.trialEndsAt !== undefined) data.trialEndsAt = dto.trialEndsAt ? new Date(dto.trialEndsAt) : null;
    if (dto.currentPeriodEnd !== undefined) {
      data.currentPeriodEnd = dto.currentPeriodEnd ? new Date(dto.currentPeriodEnd) : null;
    }
    if (dto.notes !== undefined) data.notes = dto.notes;

    const before = await this.prisma.subscription.findUnique({ where: { companyId }, select: SUBSCRIPTION_SELECT });
    const after = await this.prisma.subscription.upsert({
      where: { companyId },
      create: { ...(data as Prisma.SubscriptionUncheckedCreateInput), companyId },
      update: data,
      select: SUBSCRIPTION_SELECT,
    });

    await this.prisma.platformAuditLog.create({
      data: {
        adminId: admin.id,
        action: 'subscription.update',
        targetType: 'company',
        targetId: companyId,
        // Passage par JSON : dates en chaînes ISO, seul format accepté en Json.
        payload: JSON.parse(JSON.stringify({ before: toSubscription(before), after: toSubscription(after) })),
      },
    });
    return toSubscription(after);
  }

  async listDevices() {
    const now = Date.now();
    const devices = await this.prisma.siteDevice.findMany({
      orderBy: [{ lastSeenAt: { sort: 'desc', nulls: 'last' } }],
      select: {
        id: true,
        deviceLabel: true,
        lastSeenAt: true,
        qrRotatedAt: true,
        site: { select: { id: true, name: true, company: { select: { id: true, name: true } } } },
      },
    });
    return devices.map((d) => ({
      id: d.id,
      label: d.deviceLabel,
      lastSeenAt: d.lastSeenAt,
      online: isOnline(d.lastSeenAt, now),
      qrRotatedAt: d.qrRotatedAt,
      site: { id: d.site.id, name: d.site.name },
      company: { id: d.site.company.id, name: d.site.company.name },
    }));
  }

  async health() {
    const database = { ok: false, latencyMs: null as number | null, appliedMigrations: null as number | null, lastMigration: null as string | null };
    try {
      const started = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      database.latencyMs = Date.now() - started;
      database.ok = true;
      const migrations = await this.prisma.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM _prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        ORDER BY finished_at DESC`;
      database.appliedMigrations = migrations.length;
      database.lastMigration = migrations[0]?.migration_name ?? null;
    } catch {
      // Base injoignable : ok reste false, la console l'affiche en rouge.
    }

    const [registeredPhones, notificationsLast24h] = database.ok
      ? await Promise.all([
          this.prisma.pushToken.count(),
          this.prisma.notification.count({ where: { createdAt: { gte: new Date(Date.now() - DAY_MS) } } }),
        ])
      : [null, null];

    return {
      status: database.ok ? 'ok' : 'degraded',
      checkedAt: new Date(),
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      database,
      // Présence seulement, jamais les valeurs.
      config: {
        pinEncryptionKey: Boolean(process.env.PIN_ENCRYPTION_KEY),
        expoAccessToken: Boolean(process.env.EXPO_ACCESS_TOKEN),
      },
      push: { registeredPhones, notificationsLast24h },
    };
  }

  async listAudit() {
    const rows = await this.prisma.platformAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: AUDIT_SELECT,
    });
    return rows.map(toAudit);
  }
}

const AUDIT_SELECT = {
  id: true,
  action: true,
  targetType: true,
  targetId: true,
  payload: true,
  createdAt: true,
  admin: { select: { id: true, name: true, email: true } },
} satisfies Prisma.PlatformAuditLogSelect;

function toAudit(row: Prisma.PlatformAuditLogGetPayload<{ select: typeof AUDIT_SELECT }>) {
  return {
    id: row.id,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    payload: row.payload,
    createdAt: row.createdAt,
    admin: { id: row.admin.id, name: row.admin.name, email: row.admin.email },
  };
}

import { Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { isInMarketAudience } from '../shifts/market-audience';

const LIST_LIMIT = 50;

interface ShiftSummary {
  id: string;
  siteId: string;
  startsAt: Date;
  endsAt: Date;
  marketScope: string;
  marketSiteIds: string[];
  marketUserIds: string[];
  site: { name: string; timezone: string | null };
}

// Notifications de checkin-mobile (cloche). Les méthodes `notify*` sont
// appelées par ShiftsService APRÈS que l'action a réussi ; elles ne lèvent
// jamais d'exception : une notification ratée ne doit pas faire échouer
// l'assignation ou la validation qui l'a déclenchée (même règle que
// RealtimeGateway).
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(companyId: string, userId: string) {
    const where = { userId, user: { companyId } };
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: LIST_LIMIT }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return { items, unreadCount };
  }

  async markRead(companyId: string, userId: string, id: string) {
    // updateMany plutôt qu'update : filtre par destinataire, une notification
    // d'un autre utilisateur n'est jamais touchée (et ne lève pas de 404 qui
    // confirmerait qu'elle existe).
    await this.prisma.notification.updateMany({
      where: { id, userId, user: { companyId }, readAt: null },
      data: { readAt: new Date() },
    });
    this.realtime.emitToUser(userId, 'notifications:changed');
  }

  async markAllRead(companyId: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, user: { companyId }, readAt: null },
      data: { readAt: new Date() },
    });
    this.realtime.emitToUser(userId, 'notifications:changed');
  }

  // Un shift publié vient d'être attribué à cet employé (par le manager, ou
  // publication d'un brouillon déjà assigné).
  async notifyShiftAssigned(companyId: string, shiftId: string, userId: string) {
    await this.safely('shift_assigned', async () => {
      const shift = await this.findShift(companyId, shiftId);
      if (!shift) return;
      await this.send([userId], 'shift_assigned', shift, 'Nouveau shift au planning', describe(shift));
    });
  }

  // Le manager a retenu sa candidature (échange ou créneau libre).
  async notifyApplicationAccepted(companyId: string, shiftId: string, userId: string) {
    await this.safely('application_accepted', async () => {
      const shift = await this.findShift(companyId, shiftId);
      if (!shift) return;
      await this.send([userId], 'application_accepted', shift, 'Candidature acceptée', `Le shift est à vous : ${describe(shift)}`);
    });
  }

  // Créneau libre publié ou reproposé par un manager : prévient exactement
  // ceux qui le voient dans le marché (même public que listOpenOffers).
  // `excludeUserIds` : ceux qui y ont déjà candidaté le savent déjà.
  async notifyOpenShiftAvailable(companyId: string, shiftId: string, excludeUserIds: string[] = []) {
    await this.safely('shift_available', async () => {
      const shift = await this.findShift(companyId, shiftId);
      if (!shift) return;
      const employees = await this.activeEmployees(companyId);
      const audience = employees
        .filter((e) => !excludeUserIds.includes(e.id) && isInMarketAudience(shift, e.id, e.siteId))
        .map((e) => e.id);
      const recipients = await this.withoutBusy(audience, shift);
      await this.send(recipients, 'shift_available', shift, 'Nouveau shift disponible', `${describe(shift)} — à prendre dans le marché`);
    });
  }

  // Un collègue cède son shift : une offre d'échange est visible de toute
  // l'entreprise, sauf de celui qui la propose (voir listOpenOffers).
  async notifySwapAvailable(companyId: string, shiftId: string, offeredBy: string) {
    await this.safely('shift_available', async () => {
      const shift = await this.findShift(companyId, shiftId);
      if (!shift) return;
      const employees = await this.activeEmployees(companyId);
      const audience = employees.filter((e) => e.id !== offeredBy).map((e) => e.id);
      const recipients = await this.withoutBusy(audience, shift);
      await this.send(recipients, 'shift_available', shift, 'Un collègue cède son shift', `${describe(shift)} — à prendre dans le marché`);
    });
  }

  private findShift(companyId: string, shiftId: string): Promise<ShiftSummary | null> {
    return this.prisma.shift.findFirst({
      where: { id: shiftId, site: { companyId } },
      include: { site: { select: { name: true, timezone: true } } },
    });
  }

  // Seulement les employés : un manager publie ou valide ces shifts, il n'a
  // pas à être notifié de chaque créneau qu'il met lui-même sur le marché.
  private activeEmployees(companyId: string) {
    return this.prisma.user.findMany({
      where: { companyId, role: 'employee', status: 'active' },
      select: { id: true, siteId: true },
    });
  }

  // Comme le marché affiché, on ne prévient pas quelqu'un qui travaille déjà
  // à ce moment-là : il ne pourrait pas candidater.
  private async withoutBusy(userIds: string[], shift: ShiftSummary): Promise<string[]> {
    if (userIds.length === 0) return [];
    const busy = await this.prisma.shiftAssignment.findMany({
      where: {
        userId: { in: userIds },
        status: { not: 'cancelled' },
        shiftId: { not: shift.id },
        shift: { startsAt: { lt: shift.endsAt }, endsAt: { gt: shift.startsAt } },
      },
      select: { userId: true },
    });
    const busyIds = new Set(busy.map((b) => b.userId));
    return userIds.filter((id) => !busyIds.has(id));
  }

  private async send(userIds: string[], type: NotificationType, shift: ShiftSummary, title: string, body: string) {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return;
    await this.prisma.notification.createMany({
      data: unique.map((userId) => ({ userId, type, title, body, shiftId: shift.id })),
    });
    for (const userId of unique) {
      this.realtime.emitToUser(userId, 'notifications:changed');
    }
  }

  private async safely(label: string, run: () => Promise<void>) {
    try {
      await run();
    } catch (err) {
      this.logger.warn(`Notification "${label}" non envoyée : ${err}`);
    }
  }
}

// « lun. 16 nov. · 09:00–17:00 · Site Bruxelles Centre », à l'heure du site.
export function describe(shift: Pick<ShiftSummary, 'startsAt' | 'endsAt' | 'site'>): string {
  const timeZone = shift.site.timezone ?? 'Europe/Brussels';
  const day = new Intl.DateTimeFormat('fr-BE', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(
    shift.startsAt,
  );
  const time = new Intl.DateTimeFormat('fr-BE', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${day} · ${time.format(shift.startsAt)}–${time.format(shift.endsAt)} · ${shift.site.name}`;
}

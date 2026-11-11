import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { isInMarketAudience } from '../shifts/market-audience';
import { ExpoPushService } from './expo-push.service';

const LIST_LIMIT = 50;
// Délai avant d'envoyer le push d'un regroupement hebdomadaire : « Publier N
// brouillons » publie les shifts en rafale, un seul push résume le lot.
export const WEEKLY_PUSH_DELAY_MS = 4000;

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
export class NotificationsService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);

  // Par employé et par semaine : file d'attente qui sérialise les mises à
  // jour du regroupement (publications parallèles), et push en attente.
  // En mémoire du process, comme le blocage des PIN : un redémarrage perd au
  // pire un push, la notification de la cloche est déjà enregistrée.
  private readonly weeklyQueues = new Map<string, Promise<void>>();
  private readonly weeklyPushTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly push: ExpoPushService,
  ) {}

  onModuleDestroy() {
    for (const timer of this.weeklyPushTimers.values()) clearTimeout(timer);
    this.weeklyPushTimers.clear();
  }

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
  // publication d'un brouillon déjà assigné). Regroupé par semaine du shift :
  // « Vous avez 3 nouveaux shifts pour la S47 ». Tant qu'elle n'est pas lue,
  // la notification de la semaine est mise à jour (compteur, remontée en
  // tête) au lieu d'en créer une nouvelle ; une fois lue, le shift suivant en
  // ouvre une nouvelle, qui ne compte que les shifts pas encore vus.
  async notifyShiftAssigned(companyId: string, shiftId: string, userId: string) {
    await this.safely('shift_assigned', async () => {
      const shift = await this.findShift(companyId, shiftId);
      if (!shift) return;
      const week = shiftWeek(shift);
      const key = `${userId}:${week.key}`;
      await this.serialized(key, async () => {
        const existing = await this.prisma.notification.findFirst({
          where: { userId, type: 'shift_assigned', groupKey: week.key, readAt: null },
        });
        if (existing) {
          const count = existing.groupCount + 1;
          await this.prisma.notification.update({
            where: { id: existing.id },
            data: { groupCount: count, title: weeklyTitle(count, week.number), body: week.range, createdAt: new Date() },
          });
        } else {
          await this.prisma.notification.create({
            data: {
              userId,
              type: 'shift_assigned',
              title: weeklyTitle(1, week.number),
              body: describe(shift),
              shiftId: shift.id,
              groupKey: week.key,
            },
          });
        }
      });
      this.realtime.emitToUser(userId, 'notifications:changed');
      this.scheduleWeeklyPush(key, userId, week.key);
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
    // Sur l'écran du téléphone, app fermée comprise. `type` dit à l'app où
    // ouvrir quand on touche la notification.
    await this.push.sendToUsers(unique, { title, body, data: { type, shiftId: shift.id } });
  }

  private async serialized(key: string, run: () => Promise<void>) {
    const previous = this.weeklyQueues.get(key) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(run);
    this.weeklyQueues.set(key, current);
    try {
      await current;
    } finally {
      if (this.weeklyQueues.get(key) === current) this.weeklyQueues.delete(key);
    }
  }

  // Un seul push par lot : chaque shift de la même semaine repousse l'envoi,
  // qui reprend le texte final du regroupement.
  private scheduleWeeklyPush(key: string, userId: string, groupKey: string) {
    const pending = this.weeklyPushTimers.get(key);
    if (pending) clearTimeout(pending);
    const timer = setTimeout(() => {
      this.weeklyPushTimers.delete(key);
      void this.safely('shift_assigned push', async () => {
        const notification = await this.prisma.notification.findFirst({
          where: { userId, type: 'shift_assigned', groupKey },
          orderBy: { createdAt: 'desc' },
        });
        // Déjà lue dans l'app entre-temps : inutile de sonner le téléphone.
        if (!notification || notification.readAt) return;
        await this.push.sendToUsers([userId], {
          title: notification.title,
          body: notification.body,
          data: { type: 'shift_assigned', shiftId: notification.shiftId },
        });
      });
    }, WEEKLY_PUSH_DELAY_MS);
    this.weeklyPushTimers.set(key, timer);
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

const SHORT_DATE = { day: 'numeric', month: 'short' } as const;

// Semaine ISO (lundi → dimanche) du début du shift, à l'heure du site.
export function shiftWeek(shift: Pick<ShiftSummary, 'startsAt' | 'site'>) {
  const timeZone = shift.site.timezone ?? 'Europe/Brussels';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(shift.startsAt)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  // Date locale du site représentée à midi UTC : plus aucun fuseau en jeu.
  const local = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12));
  const weekday = (local.getUTCDay() + 6) % 7; // lundi = 0
  const monday = new Date(local.getTime() - weekday * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  // Le jeudi de la semaine donne l'année ISO et le numéro de semaine.
  const thursday = new Date(monday.getTime() + 3 * 86_400_000);
  const isoYear = thursday.getUTCFullYear();
  const number = Math.floor((thursday.getTime() - Date.UTC(isoYear, 0, 1, 12)) / (7 * 86_400_000)) + 1;

  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('fr-BE', { timeZone: 'UTC', ...opts }).format(d);
  const sameMonth = monday.getUTCMonth() === sunday.getUTCMonth();
  const range = sameMonth
    ? `Semaine du ${fmt(monday, { day: 'numeric' })} au ${fmt(sunday, SHORT_DATE)}`
    : `Semaine du ${fmt(monday, SHORT_DATE)} au ${fmt(sunday, SHORT_DATE)}`;

  return { key: `${isoYear}-W${String(number).padStart(2, '0')}`, number, range };
}

export function weeklyTitle(count: number, weekNumber: number): string {
  return count === 1
    ? `Vous avez 1 nouveau shift pour la S${weekNumber}`
    : `Vous avez ${count} nouveaux shifts pour la S${weekNumber}`;
}

import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  NotificationsService,
  WEEKLY_PUSH_DELAY_MS,
  describe as describeShift,
  shiftWeek,
} from './notifications.service';
import { ExpoPushService } from './expo-push.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let realtime: { emitToUser: jest.Mock };
  let push: { sendToUsers: jest.Mock };
  let prisma: {
    shift: { findFirst: jest.Mock };
    user: { findMany: jest.Mock };
    shiftAssignment: { findMany: jest.Mock };
    notification: {
      createMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  // Lundi 16 novembre 2026, 09:00–17:00 à Bruxelles (UTC+1 en hiver).
  const shift = {
    id: 'shift-1',
    siteId: 'site-1',
    startsAt: new Date('2026-11-16T08:00:00.000Z'),
    endsAt: new Date('2026-11-16T16:00:00.000Z'),
    marketScope: 'site',
    marketSiteIds: [] as string[],
    marketUserIds: [] as string[],
    site: { name: 'Site Bruxelles Centre', timezone: 'Europe/Brussels' },
  };

  beforeEach(async () => {
    prisma = {
      shift: { findFirst: jest.fn().mockResolvedValue(shift) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      shiftAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      notification: {
        createMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn(),
      },
    };
    realtime = { emitToUser: jest.fn() };
    push = { sendToUsers: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeGateway, useValue: realtime },
        { provide: ExpoPushService, useValue: push },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  const recipients = () =>
    (prisma.notification.createMany.mock.calls[0]?.[0]?.data ?? []).map((n: { userId: string }) => n.userId);

  it('describes the shift in the site timezone', () => {
    expect(describeShift(shift)).toBe('lun. 16 nov. · 09:00–17:00 · Site Bruxelles Centre');
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('numbers the week in the site timezone, ISO style', () => {
    expect(shiftWeek(shift)).toEqual({ key: '2026-W47', number: 47, range: 'Semaine du 16 au 22 nov.' });
    // Dimanche 22 novembre 23:30 à Bruxelles = déjà lundi 23 en UTC : reste en S47.
    expect(shiftWeek({ ...shift, startsAt: new Date('2026-11-22T22:30:00.000Z') }).number).toBe(47);
    // 31 décembre 2026 (jeudi) : semaine 53 de 2026.
    expect(shiftWeek({ ...shift, startsAt: new Date('2026-12-31T10:00:00.000Z') }).key).toBe('2026-W53');
    expect(shiftWeek({ ...shift, startsAt: new Date('2026-11-30T10:00:00.000Z') }).range).toBe(
      'Semaine du 30 nov. au 6 déc.',
    );
  });

  it("opens the week's notification for the assignee and pings only their own realtime room", async () => {
    jest.useFakeTimers();
    await service.notifyShiftAssigned('company-a', 'shift-1', 'user-1');

    expect(prisma.shift.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'shift-1', site: { companyId: 'company-a' } } }),
    );
    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', type: 'shift_assigned', groupKey: '2026-W47', readAt: null },
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        type: 'shift_assigned',
        title: 'Vous avez 1 nouveau shift pour la S47',
        body: 'lun. 16 nov. · 09:00–17:00 · Site Bruxelles Centre',
        shiftId: 'shift-1',
        groupKey: '2026-W47',
      },
    });
    expect(realtime.emitToUser).toHaveBeenCalledTimes(1);
    expect(realtime.emitToUser).toHaveBeenCalledWith('user-1', 'notifications:changed');
  });

  it('adds later shifts of the same week to the unread notification, with a single push for the batch', async () => {
    jest.useFakeTimers();
    let stored: Record<string, unknown> | null = null;
    prisma.notification.create.mockImplementation(({ data }) => {
      stored = { id: 'notif-1', groupCount: 1, readAt: null, ...data };
    });
    prisma.notification.update.mockImplementation(({ data }) => {
      stored = { ...stored, ...data };
    });
    prisma.notification.findFirst.mockImplementation(() => Promise.resolve(stored));

    await Promise.all([
      service.notifyShiftAssigned('company-a', 'shift-1', 'user-1'),
      service.notifyShiftAssigned('company-a', 'shift-1', 'user-1'),
      service.notifyShiftAssigned('company-a', 'shift-1', 'user-1'),
    ]);

    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.update).toHaveBeenLastCalledWith({
      where: { id: 'notif-1' },
      data: expect.objectContaining({
        groupCount: 3,
        title: 'Vous avez 3 nouveaux shifts pour la S47',
        body: 'Semaine du 16 au 22 nov.',
      }),
    });
    expect(push.sendToUsers).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(WEEKLY_PUSH_DELAY_MS);

    expect(push.sendToUsers).toHaveBeenCalledTimes(1);
    expect(push.sendToUsers).toHaveBeenCalledWith(['user-1'], {
      title: 'Vous avez 3 nouveaux shifts pour la S47',
      body: 'Semaine du 16 au 22 nov.',
      data: { type: 'shift_assigned', shiftId: 'shift-1' },
    });
  });

  it('skips the push when the notification was read in the app meanwhile', async () => {
    jest.useFakeTimers();
    await service.notifyShiftAssigned('company-a', 'shift-1', 'user-1');
    prisma.notification.findFirst.mockResolvedValue({ id: 'notif-1', readAt: new Date() });

    await jest.advanceTimersByTimeAsync(WEEKLY_PUSH_DELAY_MS);

    expect(push.sendToUsers).not.toHaveBeenCalled();
  });

  it('sends nothing for a shift of another company', async () => {
    prisma.shift.findFirst.mockResolvedValue(null);

    await service.notifyApplicationAccepted('company-a', 'shift-of-company-b', 'user-1');

    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it("announces an open shift to its store's employees (and those without a store), minus busy ones and exclusions", async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'same-store', siteId: 'site-1' },
      { id: 'no-store', siteId: null },
      { id: 'other-store', siteId: 'site-2' },
      { id: 'busy', siteId: 'site-1' },
      { id: 'already-applied', siteId: 'site-1' },
    ]);
    prisma.shiftAssignment.findMany.mockResolvedValue([{ userId: 'busy' }]);

    await service.notifyOpenShiftAvailable('company-a', 'shift-1', ['already-applied']);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-a', role: 'employee', status: 'active' },
      select: { id: true, siteId: true },
    });
    expect(recipients()).toEqual(['same-store', 'no-store']);
  });

  it('announces an open shift only to the chosen employees', async () => {
    prisma.shift.findFirst.mockResolvedValue({ ...shift, marketScope: 'employees', marketUserIds: ['chosen'] });
    prisma.user.findMany.mockResolvedValue([
      { id: 'chosen', siteId: 'site-2' },
      { id: 'not-chosen', siteId: 'site-1' },
    ]);

    await service.notifyOpenShiftAvailable('company-a', 'shift-1');

    expect(recipients()).toEqual(['chosen']);
  });

  it('announces a swap to every free colleague except the one handing it over', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'offerer', siteId: 'site-1' },
      { id: 'colleague', siteId: 'site-2' },
    ]);

    await service.notifySwapAvailable('company-a', 'shift-1', 'offerer');

    expect(recipients()).toEqual(['colleague']);
    expect(prisma.notification.createMany.mock.calls[0][0].data[0].title).toBe('Un collègue cède son shift');
  });

  it('never throws: a failing notification must not break the action that triggered it', async () => {
    prisma.notification.create.mockRejectedValue(new Error('db down'));

    await expect(service.notifyShiftAssigned('company-a', 'shift-1', 'user-1')).resolves.toBeUndefined();
  });

  it("only lists and marks the caller's own notifications", async () => {
    await service.list('company-a', 'user-1');
    await service.markRead('company-a', 'user-1', 'notif-of-someone-else');

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', user: { companyId: 'company-a' } } }),
    );
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'notif-of-someone-else', userId: 'user-1', user: { companyId: 'company-a' }, readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});

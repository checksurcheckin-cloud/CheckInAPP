import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ExpoPushService } from './expo-push.service';

describe('ExpoPushService', () => {
  let service: ExpoPushService;
  let prisma: { pushToken: { upsert: jest.Mock; deleteMany: jest.Mock; findMany: jest.Mock } };
  let fetchMock: jest.Mock;
  const realFetch = global.fetch;

  const message = { title: 'Titre', body: 'Texte', data: { type: 'shift_assigned', shiftId: 'shift-1' } };

  beforeEach(async () => {
    prisma = { pushToken: { upsert: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) } };
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const module = await Test.createTestingModule({
      providers: [ExpoPushService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ExpoPushService);
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  const okResponse = (tickets: unknown[]) => ({ ok: true, json: async () => ({ data: tickets }) });

  it('moves a token to the account now signed in on that phone', async () => {
    await service.register('user-2', 'ExponentPushToken[abc]', 'android');

    expect(prisma.pushToken.upsert).toHaveBeenCalledWith({
      where: { token: 'ExponentPushToken[abc]' },
      create: { userId: 'user-2', token: 'ExponentPushToken[abc]', platform: 'android' },
      update: { userId: 'user-2', platform: 'android' },
    });
  });

  it("only unregisters the caller's own token", async () => {
    await service.unregister('user-1', 'ExponentPushToken[abc]');

    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({ where: { token: 'ExponentPushToken[abc]', userId: 'user-1' } });
  });

  it('sends one message per phone of the recipients, in chunks of 100', async () => {
    const tokens = Array.from({ length: 150 }, (_, i) => ({ token: `ExponentPushToken[${i}]` }));
    prisma.pushToken.findMany.mockResolvedValue(tokens);
    fetchMock.mockResolvedValue(okResponse([]));

    await service.sendToUsers(['user-1', 'user-2'], message);

    expect(prisma.pushToken.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ['user-1', 'user-2'] } },
      select: { token: true },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBatch = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(firstBatch).toHaveLength(100);
    expect(firstBatch[0]).toEqual({
      to: 'ExponentPushToken[0]',
      title: 'Titre',
      body: 'Texte',
      data: { type: 'shift_assigned', shiftId: 'shift-1' },
      sound: 'default',
      channelId: 'default',
    });
  });

  it('forgets phones where the app was uninstalled', async () => {
    prisma.pushToken.findMany.mockResolvedValue([{ token: 'ExponentPushToken[ok]' }, { token: 'ExponentPushToken[gone]' }]);
    fetchMock.mockResolvedValue(
      okResponse([{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }]),
    );

    await service.sendToUsers(['user-1'], message);

    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ['ExponentPushToken[gone]'] } } });
  });

  it('does not call Expo when nobody has a registered phone', async () => {
    await service.sendToUsers(['user-1'], message);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws when Expo is unreachable', async () => {
    prisma.pushToken.findMany.mockResolvedValue([{ token: 'ExponentPushToken[ok]' }]);
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(service.sendToUsers(['user-1'], message)).resolves.toBeUndefined();
  });
});

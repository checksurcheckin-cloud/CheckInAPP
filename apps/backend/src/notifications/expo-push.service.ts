import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// Limite de l'API Expo : 100 messages par requête.
const CHUNK_SIZE = 100;

export interface PushMessage {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

// Envoi des notifications push sur l'écran du téléphone, via le service
// d'Expo (qui relaie vers Google FCM / Apple APNs). Les téléphones s'
// enregistrent eux-mêmes (POST /notifications/push-tokens). Ne lève jamais
// d'exception : la notification de la cloche est déjà enregistrée, le push
// n'est qu'un signal en plus.
@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);

  constructor(private readonly prisma: PrismaService) {}

  async register(userId: string, token: string, platform: string) {
    // Un téléphone passé sur un autre compte : le token suit le compte
    // connecté, l'ancien ne reçoit plus rien sur ce téléphone.
    await this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
  }

  async unregister(userId: string, token: string) {
    await this.prisma.pushToken.deleteMany({ where: { token, userId } });
  }

  async sendToUsers(userIds: string[], message: PushMessage) {
    try {
      if (userIds.length === 0) return;
      const tokens = await this.prisma.pushToken.findMany({
        where: { userId: { in: userIds } },
        select: { token: true },
      });
      for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
        await this.sendChunk(tokens.slice(i, i + CHUNK_SIZE).map((t) => t.token), message);
      }
    } catch (err) {
      this.logger.warn(`Push non envoyé : ${err}`);
    }
  }

  private async sendChunk(tokens: string[], message: PushMessage) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    // Facultatif : si "Enhanced Push Security" est activé sur le projet Expo.
    if (process.env.EXPO_ACCESS_TOKEN) {
      headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    }
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(
        tokens.map((to) => ({
          to,
          title: message.title,
          body: message.body,
          data: message.data,
          sound: 'default',
          channelId: 'default',
        })),
      ),
    });
    if (!res.ok) {
      this.logger.warn(`Expo push a répondu ${res.status} : ${await res.text().catch(() => '')}`);
      return;
    }
    // Un ticket par message, dans le même ordre : on oublie les téléphones
    // où l'app a été désinstallée, pour ne plus leur envoyer.
    const { data } = (await res.json()) as { data?: ExpoTicket[] };
    const gone = (data ?? [])
      .map((ticket, i) => (ticket.details?.error === 'DeviceNotRegistered' ? tokens[i] : null))
      .filter((t): t is string => t !== null);
    if (gone.length > 0) {
      await this.prisma.pushToken.deleteMany({ where: { token: { in: gone } } });
    }
  }
}

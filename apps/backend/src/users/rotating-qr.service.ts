import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { authenticator } from 'otplib';
import { PrismaService } from '../prisma/prisma.service';

const STEP_SECONDS = 30;

// TOTP (RFC 6238) — même algorithme que Google Authenticator. Fenêtre de 30s,
// tolérance d'une fenêtre avant/après pour absorber un léger décalage
// d'horloge entre le téléphone (qui génère le code) et le serveur (qui le
// vérifie un peu plus tard, une fois le QR scanné par la tablette).
authenticator.options = { step: STEP_SECONDS, window: 1 };

@Injectable()
export class RotatingQrService {
  constructor(private readonly prisma: PrismaService) {}

  // Le secret n'est jamais transmis sur le réseau : seul le code à 6 chiffres
  // qu'il produit l'est, via generateCode/verifyCode.
  async generateCode(userId: string): Promise<{ code: string; validUntil: Date }> {
    const secret = await this.ensureSecret(userId);
    const code = authenticator.generate(secret);

    const epochSeconds = Math.floor(Date.now() / 1000);
    const secondsIntoStep = epochSeconds % STEP_SECONDS;
    const validUntil = new Date(Date.now() + (STEP_SECONDS - secondsIntoStep) * 1000);

    return { code, validUntil };
  }

  async verifyCode(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { qrSecret: true },
    });
    if (!user?.qrSecret) {
      return false;
    }
    return authenticator.verify({ token: code, secret: user.qrSecret });
  }

  // Ce que contient le QR affiché par le téléphone — décodé côté tablette
  // (checkin-pos) puis renvoyé tel quel au serveur pour vérification.
  decodePayload(payload: string): { userId: string; code: string } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new BadRequestException('Code QR invalide');
    }
    const { userId, code } = (parsed ?? {}) as { userId?: unknown; code?: unknown };
    if (typeof userId !== 'string' || typeof code !== 'string') {
      throw new BadRequestException('Code QR invalide');
    }
    return { userId, code };
  }

  // Générée une seule fois, à la première activation du pointage QR
  // (premier appel à generateCode pour cet utilisateur).
  private async ensureSecret(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { qrSecret: true },
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    if (user.qrSecret) {
      return user.qrSecret;
    }

    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { qrSecret: secret } });
    return secret;
  }
}

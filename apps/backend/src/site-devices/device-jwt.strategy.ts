import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

interface DeviceJwtPayload {
  deviceId: string;
  siteId: string;
  companyId: string;
  type: 'device';
}

// Une tablette interroge l'API en continu : on ne note sa présence qu'une
// fois par minute au plus.
const LAST_SEEN_THROTTLE_MS = 60_000;

// Stratégie séparée de JwtStrategy (users) — un SiteDevice n'est pas un
// utilisateur, il n'a pas de rôle ni de session au sens classique.
@Injectable()
export class DeviceJwtStrategy extends PassportStrategy(Strategy, 'device-jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_DEVICE_SECRET,
    });
  }

  async validate(payload: DeviceJwtPayload) {
    this.touchLastSeen(payload.deviceId);
    return { deviceId: payload.deviceId, siteId: payload.siteId, companyId: payload.companyId };
  }

  // Dernière activité de la tablette, pour la console plateforme (en ligne /
  // hors ligne). Sans attendre et sans jamais faire échouer la requête.
  private touchLastSeen(deviceId: string) {
    const threshold = new Date(Date.now() - LAST_SEEN_THROTTLE_MS);
    this.prisma.siteDevice
      .updateMany({
        where: { id: deviceId, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: threshold } }] },
        data: { lastSeenAt: new Date() },
      })
      .catch(() => {});
  }
}

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface DeviceJwtPayload {
  deviceId: string;
  siteId: string;
  companyId: string;
  type: 'device';
}

// Stratégie séparée de JwtStrategy (users) — un SiteDevice n'est pas un
// utilisateur, il n'a pas de rôle ni de session au sens classique.
@Injectable()
export class DeviceJwtStrategy extends PassportStrategy(Strategy, 'device-jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_DEVICE_SECRET,
    });
  }

  async validate(payload: DeviceJwtPayload) {
    return { deviceId: payload.deviceId, siteId: payload.siteId, companyId: payload.companyId };
  }
}

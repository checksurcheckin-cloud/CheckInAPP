import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { PLATFORM_AUDIENCE, PlatformJwtPayload, platformSecret } from './platform-jwt';

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
// Hash bcrypt d'un mot de passe jetable : comparé quand l'email n'existe pas,
// pour que la réponse prenne le même temps (pas d'indice sur les comptes).
const DUMMY_HASH = bcrypt.hashSync('checkinapp-platform-dummy', 12);

@Injectable()
export class PlatformAuthService {
  // email -> échecs consécutifs (même principe que le PIN des tablettes).
  private readonly failures = new Map<string, { count: number; lockedUntil: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const secret = platformSecret();
    const key = email.trim().toLowerCase();
    const state = this.failures.get(key);
    if (state && state.lockedUntil > Date.now()) {
      throw new HttpException('Trop de tentatives, réessayez dans 15 minutes', HttpStatus.TOO_MANY_REQUESTS);
    }

    const admin = await this.prisma.platformAdmin.findUnique({ where: { email: key } });
    const valid = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);
    if (!admin || !admin.active || !valid) {
      const count = (state?.count ?? 0) + 1;
      this.failures.set(key, { count, lockedUntil: count >= MAX_FAILURES ? Date.now() + LOCK_MS : 0 });
      throw new UnauthorizedException('Identifiants invalides');
    }
    this.failures.delete(key);

    await this.prisma.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });

    const payload: PlatformJwtPayload = { sub: admin.id, typ: 'platform' };
    const accessToken = this.jwt.sign(payload, {
      secret,
      audience: PLATFORM_AUDIENCE,
      algorithm: 'HS256',
      expiresIn: process.env.JWT_PLATFORM_EXPIRES_IN ?? '8h',
    });
    return {
      accessToken,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    };
  }
}

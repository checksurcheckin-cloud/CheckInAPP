import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { PlatformRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedPlatformAdmin, PLATFORM_AUDIENCE, PlatformJwtPayload, platformSecret } from './platform-jwt';

const PLATFORM_PUBLIC_KEY = 'platformPublic';
const PLATFORM_ROLES_KEY = 'platformRoles';

// Route /platform/* accessible sans session (seulement la connexion).
export const PlatformPublic = () => SetMetadata(PLATFORM_PUBLIC_KEY, true);

// Restreint une route à certains rôles plateforme ; sans ce décorateur, tout
// admin plateforme actif (readonly compris) y a accès.
export const PlatformRoles = (...roles: PlatformRole[]) => SetMetadata(PLATFORM_ROLES_KEY, roles);

export const CurrentPlatformAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedPlatformAdmin => ctx.switchToHttp().getRequest().platformAdmin,
);

// Seul garde des routes /platform/* — jamais JwtAuthGuard ni TenantScopeGuard :
// la console voit toutes les entreprises, c'est la seule exception au
// cloisonnement multi-tenant (CLAUDE.md, décision #1), d'où une
// authentification entièrement séparée de celle des entreprises.
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PLATFORM_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      throw new UnauthorizedException('Session plateforme requise');
    }

    const secret = platformSecret();
    let payload: PlatformJwtPayload;
    try {
      payload = this.jwt.verify<PlatformJwtPayload>(token, {
        secret,
        audience: PLATFORM_AUDIENCE,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Session plateforme invalide ou expirée');
    }
    if (payload.typ !== 'platform' || !payload.sub) {
      throw new UnauthorizedException('Session plateforme invalide ou expirée');
    }

    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    if (!admin || !admin.active) {
      throw new UnauthorizedException('Session plateforme invalide ou expirée');
    }
    // Construit champ par champ : /platform/auth/me renvoie cet objet tel quel.
    const authenticated: AuthenticatedPlatformAdmin = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
    request.platformAdmin = authenticated;

    const roles = this.reflector.getAllAndOverride<PlatformRole[]>(PLATFORM_ROLES_KEY, targets);
    if (roles && !roles.includes(admin.role)) {
      throw new ForbiddenException('Rôle plateforme insuffisant pour cette action');
    }
    return true;
  }
}

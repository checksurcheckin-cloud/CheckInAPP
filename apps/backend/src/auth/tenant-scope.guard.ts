import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';

/**
 * S'utilise APRÈS JwtAuthGuard (donc req.user est déjà rempli).
 *
 * Rôle : vérifier que la ressource demandée (site, employé, shift...) appartient
 * bien au companyId de l'utilisateur connecté. Sans ça, un utilisateur de
 * l'entreprise A pourrait potentiellement lire/modifier les données de
 * l'entreprise B en devinant un id.
 *
 * Usage concret dans chaque service : ne JAMAIS faire
 *   prisma.site.findUnique({ where: { id } })
 * mais toujours
 *   prisma.site.findFirst({ where: { id, companyId: user.companyId } })
 *
 * Ce guard sert de garde-fou au niveau contrôleur ; la vraie protection reste
 * de systématiquement filtrer par companyId dans CHAQUE requête Prisma.
 */
@Injectable()
export class TenantScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user?.companyId) {
      throw new ForbiddenException('Aucune entreprise associée à cet utilisateur');
    }

    // Le companyId est disponible ici pour que chaque service l'utilise
    // systématiquement dans ses requêtes Prisma. Voir note ci-dessus.
    return true;
  }
}

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/current-user.decorator';

const OUT_OF_SCOPE = 'Ce magasin ne fait pas partie de votre périmètre';

// Périmètre "magasins gérés" d'un manager (décision #36). Un admin gère
// toujours tout ; un manager sans ligne ManagedSite aussi (compatibilité
// avec tous les comptes existants) ; sinon seulement ses magasins. Les
// contrôleurs appellent ces vérifications AVANT de déléguer au service
// métier, sur l'entité réellement ciblée (rechargée et rescopée par
// companyId, règle #1) — jamais sur un siteId fourni par le client seul.
@Injectable()
export class SiteScopeService {
  constructor(private readonly prisma: PrismaService) {}

  // null = tous les magasins.
  async managedSiteIds(user: AuthenticatedUser): Promise<string[] | null> {
    if (user.role !== 'manager') return null;
    const rows = await this.prisma.managedSite.findMany({
      where: { userId: user.userId, site: { companyId: user.companyId } },
      select: { siteId: true },
    });
    return rows.length === 0 ? null : rows.map((r) => r.siteId);
  }

  async ensureSite(user: AuthenticatedUser, siteId: string): Promise<void> {
    const scope = await this.managedSiteIds(user);
    if (scope && !scope.includes(siteId)) {
      throw new ForbiddenException(OUT_OF_SCOPE);
    }
  }

  // Actions réservées à qui gère TOUS les magasins (ex. créer un site).
  async ensureAllSites(user: AuthenticatedUser): Promise<void> {
    if (await this.managedSiteIds(user)) {
      throw new ForbiddenException('Réservé aux managers qui gèrent tous les magasins');
    }
  }

  async ensureShift(user: AuthenticatedUser, shiftId: string): Promise<void> {
    const scope = await this.managedSiteIds(user);
    if (!scope) return;
    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, site: { companyId: user.companyId } },
      select: { siteId: true },
    });
    if (!shift) throw new NotFoundException('Shift introuvable');
    if (!scope.includes(shift.siteId)) throw new ForbiddenException(OUT_OF_SCOPE);
  }

  async ensureOffer(user: AuthenticatedUser, offerId: string): Promise<void> {
    const scope = await this.managedSiteIds(user);
    if (!scope) return;
    const offer = await this.prisma.shiftOffer.findFirst({
      where: { id: offerId, shiftAssignment: { shift: { site: { companyId: user.companyId } } } },
      select: { shiftAssignment: { select: { shift: { select: { siteId: true } } } } },
    });
    if (!offer) throw new NotFoundException('Offre introuvable');
    if (!scope.includes(offer.shiftAssignment.shift.siteId)) throw new ForbiddenException(OUT_OF_SCOPE);
  }

  async ensureTimeEntry(user: AuthenticatedUser, entryId: string): Promise<void> {
    const scope = await this.managedSiteIds(user);
    if (!scope) return;
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: entryId, site: { companyId: user.companyId } },
      select: { siteId: true },
    });
    if (!entry) throw new NotFoundException('Pointage introuvable');
    if (!scope.includes(entry.siteId)) throw new ForbiddenException(OUT_OF_SCOPE);
  }

  async ensureDevice(user: AuthenticatedUser, deviceId: string): Promise<void> {
    const scope = await this.managedSiteIds(user);
    if (!scope) return;
    const device = await this.prisma.siteDevice.findFirst({
      where: { id: deviceId, site: { companyId: user.companyId } },
      select: { siteId: true },
    });
    if (!device) throw new NotFoundException('Terminal introuvable');
    if (!scope.includes(device.siteId)) throw new ForbiddenException(OUT_OF_SCOPE);
  }

  // Un manager limité n'agit que sur les employés de ses magasins, ou pas
  // encore rattachés (pour pouvoir les rattacher) — jamais sur un autre
  // manager ou un admin.
  async ensureUser(user: AuthenticatedUser, targetUserId: string): Promise<void> {
    const scope = await this.managedSiteIds(user);
    if (!scope) return;
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, companyId: user.companyId },
      select: { role: true, siteId: true },
    });
    if (!target) throw new NotFoundException('Utilisateur introuvable');
    if (target.role !== 'employee' || (target.siteId && !scope.includes(target.siteId))) {
      throw new ForbiddenException("Cet employé ne fait pas partie de vos magasins");
    }
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';

const SALT_ROUNDS = 12;

// Champs sûrs à renvoyer au client — jamais passwordHash ni pinCodeHash.
const SAFE_USER_SELECT = {
  id: true,
  companyId: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  badgeCode: true,
  gpsClockInEnabled: true,
  siteId: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // `siteId` optionnel : filtre l'annuaire pour un site donné, utilisé par la
  // grille planning (web-manager) pour ne proposer que les employés qui y
  // sont rattachés. Un employé sans site (siteId: null) reste visible sur
  // TOUS les sites — pas de déclaration = pas exclu, même philosophie que
  // les disponibilités (décision #14) — et les rôles manager/admin ne sont
  // jamais filtrés (ils supervisent tous les sites de l'entreprise, voir
  // décision #25 : le scoping ne s'applique qu'à l'affichage, pas encore à
  // l'assignation backend).
  findAll(companyId: string, siteId?: string) {
    return this.prisma.user.findMany({
      where: {
        companyId,
        ...(siteId ? { OR: [{ siteId }, { siteId: null }, { role: { not: 'employee' } }] } : {}),
      },
      select: SAFE_USER_SELECT,
    });
  }

  async findOne(companyId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId },
      select: SAFE_USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return user;
  }

  async invite(companyId: string, dto: InviteUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email');
    }
    if (dto.siteId) {
      await this.ensureSiteInCompany(companyId, dto.siteId);
    }

    // Pas encore de flow "accepter l'invitation" : on génère un mot de passe
    // temporaire aléatoire, jamais communiqué, en attendant que ce flow existe.
    const temporaryPassword = randomBytes(24).toString('hex');
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

    return this.prisma.user.create({
      data: {
        companyId,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role ?? 'employee',
        status: 'invited',
        passwordHash,
        siteId: dto.siteId,
      },
      select: SAFE_USER_SELECT,
    });
  }

  // Jamais faire confiance à un siteId fourni par le client sans vérifier
  // qu'il appartient bien à la même entreprise (règle critique décision #1) —
  // sinon un manager pourrait rattacher un employé au site d'une AUTRE
  // company en devinant/rejouant un id.
  private async ensureSiteInCompany(companyId: string, siteId: string) {
    const site = await this.prisma.site.findFirst({ where: { id: siteId, companyId } });
    if (!site) {
      throw new NotFoundException('Site introuvable');
    }
  }

  async updateRole(companyId: string, id: string, dto: UpdateUserRoleDto) {
    await this.findOne(companyId, id);
    return this.prisma.user.update({
      where: { id },
      data: { role: dto.role },
      select: SAFE_USER_SELECT,
    });
  }

  // Pas encore de flow "accepter l'invitation" (voir CLAUDE.md, "Connu
  // manquant") — en attendant, un manager peut faire passer un compte
  // `invited` à `active` (ou `disabled` pour un départ) directement.
  async updateStatus(companyId: string, id: string, dto: UpdateUserStatusDto) {
    await this.findOne(companyId, id);
    return this.prisma.user.update({
      where: { id },
      data: { status: dto.status },
      select: SAFE_USER_SELECT,
    });
  }

  async regenerateBadge(companyId: string, id: string) {
    await this.findOne(companyId, id);
    const badgeCode = randomBytes(8).toString('hex');
    return this.prisma.user.update({
      where: { id },
      data: { badgeCode },
      select: SAFE_USER_SELECT,
    });
  }

  // Surcharge individuelle du réglage GPS de l'entreprise, et/ou site de
  // rattachement. `null` explicite sur l'un ou l'autre champ le remet à
  // vide (réglage entreprise par défaut / aucun site) ; un champ absent du
  // DTO (undefined) reste inchangé — Prisma ignore les clés `undefined`.
  async updateSettings(companyId: string, id: string, dto: UpdateUserSettingsDto) {
    const existing = await this.findOne(companyId, id);
    if (dto.siteId) {
      await this.ensureSiteInCompany(companyId, dto.siteId);
    }
    // `dto.siteId === undefined` veut dire "champ absent, ne pas toucher" —
    // seule une vraie valeur (site différent, ou null pour désassigner) fait
    // changer de site.
    const siteChanging = dto.siteId !== undefined && dto.siteId !== existing.siteId;

    const updated = await this.prisma.user.update({
      where: { id },
      data: { gpsClockInEnabled: dto.gpsClockInEnabled, siteId: dto.siteId },
      select: SAFE_USER_SELECT,
    });

    if (siteChanging) {
      // Changer un employé de site rend son horaire à venir obsolète (il ne
      // travaillera plus là où ces shifts étaient prévus) — on annule ses
      // assignations futures plutôt que de les laisser pointer vers un site
      // qu'il a quitté. `cancelled` (pas une suppression) : le shift lui-même
      // reste, il retombe simplement "non assigné" dans le pool (décision
      // #12) pour qu'un autre employé puisse le reprendre. Seules les
      // assignations À VENIR sont touchées — l'historique de pointage reste
      // intact.
      await this.prisma.shiftAssignment.updateMany({
        where: {
          userId: id,
          status: { not: 'cancelled' },
          shift: { startsAt: { gt: new Date() } },
        },
        data: { status: 'cancelled' },
      });
      this.realtime.emitToCompany(companyId, 'shifts:changed');
    }

    return updated;
  }

  async setPin(companyId: string, id: string, dto: SetPinDto) {
    await this.findOne(companyId, id);
    const pinCodeHash = await bcrypt.hash(dto.pin, SALT_ROUNDS);
    await this.prisma.user.update({ where: { id }, data: { pinCodeHash } });
    return { ok: true };
  }

  // Un kiosk n'a qu'un clavier numérique : le PIN doit identifier l'employé
  // à lui seul (pas de sélection préalable dans un annuaire). Les PIN sont
  // hashés donc pas de lookup direct — on compare contre chaque employé de
  // l'entreprise qui en a un ; acceptable à l'échelle d'une PME (20-100 pers).
  async resolveByPin(companyId: string, pin: string) {
    const candidates = await this.prisma.user.findMany({
      where: { companyId, pinCodeHash: { not: null } },
      select: { id: true, badgeCode: true, firstName: true, lastName: true, pinCodeHash: true },
    });

    for (const candidate of candidates) {
      if (candidate.pinCodeHash && (await bcrypt.compare(pin, candidate.pinCodeHash))) {
        return {
          id: candidate.id,
          badgeCode: candidate.badgeCode,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
        };
      }
    }
    return null;
  }
}

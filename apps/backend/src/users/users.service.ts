import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { decryptPin, encryptPin, randomPin } from './pin-cipher';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';

const SALT_ROUNDS = 12;
const MAX_PIN_FAILURES = 5;
const PIN_LOCK_MS = 5 * 60 * 1000;

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
export class UsersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersService.name);
  // userId -> échecs de PIN consécutifs (voir verifyPin).
  private readonly pinFailures = new Map<string, { failures: number; lockedUntil: number }>();

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

  async invite(companyId: string, dto: InviteUserDto, actorRole: string) {
    if (dto.role === 'admin' && actorRole !== 'admin') {
      throw new ForbiddenException('Seul un admin peut inviter un admin');
    }
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

    // PIN tablette généré d'office : l'employé peut pointer dès son arrivée,
    // le manager le lui communique depuis la page Équipe.
    const pin = await this.generateUniquePin(companyId);

    return this.prisma.user.create({
      data: {
        companyId,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role ?? 'employee',
        status: 'invited',
        passwordHash,
        pinCodeHash: await bcrypt.hash(pin, SALT_ROUNDS),
        pinCodeEncrypted: encryptPin(pin),
        siteId: dto.siteId,
      },
      select: SAFE_USER_SELECT,
    });
  }

  // Une entreprise doit toujours garder au moins un admin actif — sinon plus
  // personne ne peut modifier ses réglages (routes @Roles('admin')) ni
  // rétablir un admin, puisque seul un admin peut attribuer ce rôle.
  private async ensureNotLastActiveAdmin(companyId: string, target: { id: string; status: string }) {
    if (target.status !== 'active') return;
    const otherActiveAdmins = await this.prisma.user.count({
      where: { companyId, role: 'admin', status: 'active', id: { not: target.id } },
    });
    if (otherActiveAdmins === 0) {
      throw new ConflictException("Impossible : c'est le dernier admin actif de l'entreprise");
    }
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

  async updateRole(companyId: string, id: string, dto: UpdateUserRoleDto, actorRole: string) {
    const target = await this.findOne(companyId, id);
    if (actorRole !== 'admin' && (target.role === 'admin' || dto.role === 'admin')) {
      throw new ForbiddenException('Seul un admin peut attribuer ou retirer le rôle admin');
    }
    if (target.role === 'admin' && dto.role !== 'admin') {
      await this.ensureNotLastActiveAdmin(companyId, target);
    }
    return this.prisma.user.update({
      where: { id },
      data: { role: dto.role },
      select: SAFE_USER_SELECT,
    });
  }

  // Pas encore de flow "accepter l'invitation" (voir CLAUDE.md, "Connu
  // manquant") — en attendant, un manager peut faire passer un compte
  // `invited` à `active` (ou `disabled` pour un départ) directement.
  async updateStatus(companyId: string, id: string, dto: UpdateUserStatusDto, actorRole: string) {
    const target = await this.findOne(companyId, id);
    if (actorRole !== 'admin' && target.role === 'admin') {
      throw new ForbiddenException("Seul un admin peut modifier le statut d'un admin");
    }
    if (target.role === 'admin' && dto.status !== 'active') {
      await this.ensureNotLastActiveAdmin(companyId, target);
    }
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
      // Ses candidatures en cours sur des créneaux libres à venir (marché)
      // visaient son ancien magasin — elles n'ont plus lieu d'être.
      await this.prisma.shiftApplication.deleteMany({
        where: { userId: id, shift: { startsAt: { gt: new Date() } } },
      });
      this.realtime.emitToCompany(companyId, 'shifts:changed');
    }

    return updated;
  }

  // PIN choisi à la main par un manager — doit rester unique dans l'entreprise
  // (resolveByPin, utilisé par l'enrôlement de badge, identifie par le PIN seul).
  async setPin(companyId: string, id: string, dto: SetPinDto) {
    await this.findOne(companyId, id);
    const taken = await this.pinsInUse(companyId, id);
    if (taken.has(dto.pin)) {
      throw new ConflictException('Ce PIN est déjà utilisé par un autre membre de l’équipe');
    }
    await this.storePin(id, dto.pin);
    return { ok: true };
  }

  async regeneratePin(companyId: string, id: string) {
    await this.findOne(companyId, id);
    const pin = await this.generateUniquePin(companyId, id);
    await this.storePin(id, pin);
    return { pin };
  }

  // PIN relisible (choix produit) — par un manager/admin pour n'importe qui
  // de son entreprise, ou par l'employé lui-même via /users/me/pin.
  // null = compte sans PIN chiffré (antérieur à cette fonctionnalité).
  async getPin(companyId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId },
      select: { pinCodeEncrypted: true },
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return { pin: user.pinCodeEncrypted ? decryptPin(user.pinCodeEncrypted) : null };
  }

  // Annuaire affiché par la tablette pour choisir son nom avant de taper son
  // PIN : rattachés à ce site ou à aucun (même règle que findAll, décision
  // #25), comptes non désactivés, avec un PIN. Jamais d'email ni de PIN.
  listKioskEmployees(companyId: string, siteId: string) {
    return this.prisma.user.findMany({
      where: {
        companyId,
        status: { not: 'disabled' },
        pinCodeHash: { not: null },
        OR: [{ siteId }, { siteId: null }],
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  // Pointage "login classique" sur la tablette : l'employé a choisi son nom,
  // on vérifie son PIN à lui seul. Avec seulement 10 000 PIN possibles et un
  // nom connu, on bloque l'employé 5 minutes après 5 essais ratés de suite —
  // en mémoire du process (une seule instance backend aujourd'hui).
  async verifyPin(companyId: string, userId: string, pin: string) {
    const lock = this.pinFailures.get(userId);
    if (lock && lock.lockedUntil > Date.now()) {
      throw new ForbiddenException('Trop d’essais ratés — réessayez dans quelques minutes');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId, status: { not: 'disabled' } },
      select: { id: true, badgeCode: true, firstName: true, lastName: true, pinCodeHash: true },
    });
    if (!user?.pinCodeHash || !(await bcrypt.compare(pin, user.pinCodeHash))) {
      // lockedUntil: 0 = pas (encore) bloqué ; un blocage expiré repart de zéro.
      const failures = (lock?.lockedUntil === 0 ? lock.failures : 0) + 1;
      this.pinFailures.set(userId, {
        failures,
        lockedUntil: failures >= MAX_PIN_FAILURES ? Date.now() + PIN_LOCK_MS : 0,
      });
      return null;
    }

    this.pinFailures.delete(userId);
    const { pinCodeHash: _hash, ...identity } = user;
    return identity;
  }

  // Au démarrage du backend : rattrapage des comptes sans PIN chiffré.
  // Jamais bloquant — une clé manquante ne doit pas empêcher l'API de démarrer
  // (les PIN restent alors régénérables à la main une fois la clé posée).
  async onApplicationBootstrap() {
    try {
      const count = await this.backfillMissingPins();
      if (count > 0) this.logger.log(`PIN tablette générés pour ${count} compte(s)`);
    } catch (err) {
      this.logger.error(`Génération des PIN manquants impossible : ${(err as Error).message}`);
    }
  }

  // Attribue un PIN à chaque compte qui n'a pas encore de PIN chiffré
  // (comptes créés avant cette fonctionnalité) — idempotent. Un ancien PIN
  // uniquement haché est remplacé : il est impossible à relire, donc à
  // communiquer.
  async backfillMissingPins() {
    const users = await this.prisma.user.findMany({
      where: { pinCodeEncrypted: null },
      select: { id: true, companyId: true },
    });
    for (const user of users) {
      const pin = await this.generateUniquePin(user.companyId, user.id);
      await this.storePin(user.id, pin);
    }
    return users.length;
  }

  private async storePin(id: string, pin: string) {
    const pinCodeHash = await bcrypt.hash(pin, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id },
      data: { pinCodeHash, pinCodeEncrypted: encryptPin(pin) },
    });
  }

  // PIN en clair déjà attribués dans l'entreprise (hors `exceptUserId`).
  private async pinsInUse(companyId: string, exceptUserId?: string) {
    const users = await this.prisma.user.findMany({
      where: { companyId, pinCodeEncrypted: { not: null }, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) },
      select: { pinCodeEncrypted: true },
    });
    return new Set(users.map((u) => decryptPin(u.pinCodeEncrypted!)));
  }

  private async generateUniquePin(companyId: string, exceptUserId?: string) {
    const taken = await this.pinsInUse(companyId, exceptUserId);
    if (taken.size >= 10_000) {
      throw new ConflictException('Plus aucun PIN à 4 chiffres disponible pour cette entreprise');
    }
    let pin = randomPin();
    while (taken.has(pin)) pin = randomPin();
    return pin;
  }

  // Identification par le PIN seul (sans choix du nom) — ne sert plus qu'à
  // l'enrôlement de badge au kiosk ; le pointage par PIN passe par verifyPin.
  // Reste fiable car les PIN sont uniques par entreprise (generateUniquePin,
  // setPin). Les PIN sont hashés donc pas de lookup direct — on compare
  // contre chaque employé qui en a un ; acceptable pour une PME (20-100 pers).
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

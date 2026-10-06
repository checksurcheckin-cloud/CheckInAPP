import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuthenticatedUser } from '../auth/current-user.decorator';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { AssignShiftDto } from './dto/assign-shift.dto';
import { ApproveShiftOfferDto } from './dto/approve-shift-offer.dto';
import { FindShiftsQueryDto } from './dto/find-shifts-query.dto';

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(companyId: string, createdBy: string, dto: CreateShiftDto) {
    const site = await this.prisma.site.findFirst({ where: { id: dto.siteId, companyId } });
    if (!site) {
      throw new NotFoundException('Site introuvable');
    }

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException("L'heure de fin doit être après l'heure de début");
    }

    const shift = await this.prisma.shift.create({
      data: {
        siteId: dto.siteId,
        startsAt,
        endsAt,
        roleNeeded: dto.roleNeeded,
        status: dto.status ?? 'draft',
        createdBy,
      },
    });
    // Pas d'émission ici : un brouillon n'est visible de personne d'autre
    // que le manager qui le crée (voir décision #15) — rafraîchir les
    // autres clients en direct pendant le travail de mise en place du
    // planning n'a aucun intérêt et ne fait que perturber l'écran des
    // autres managers pendant qu'eux-mêmes glissent-déposent. Seul le
    // passage explicite à "published" (voir update()) prévient les autres
    // clients.
    return shift;
  }

  // Un employé ne voit que les shifts où il a une assignation — jamais le
  // planning complet du site (filtré côté requête Prisma, pas juste caché
  // à l'affichage : un employé ne doit jamais recevoir les données des
  // shifts d'un collègue). Managers/admins continuent de voir tout le site,
  // brouillons compris — c'est justement l'écran où ils les travaillent
  // avant publication.
  //
  // Un employé ne voit en plus que les shifts déjà publiés : le workflow
  // "brouillon -> on assigne -> on publie" (voir CreateShiftDto.status,
  // défaut 'draft') n'a de sens que si un brouillon reste invisible côté
  // mobile même une fois assigné, sinon publier ne changerait rien.
  findAll(user: AuthenticatedUser, query: FindShiftsQueryDto) {
    const isEmployee = user.role === 'employee';

    return this.prisma.shift.findMany({
      where: {
        site: { companyId: user.companyId },
        ...(query.siteId ? { siteId: query.siteId } : {}),
        ...(query.from || query.to
          ? {
              startsAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
        ...(isEmployee ? { assignments: { some: { userId: user.userId } }, status: 'published' } : {}),
      },
      include: {
        // Même filtrage sur les assignations incluses : un shift peut avoir
        // une assignation annulée appartenant à un autre employé (historique
        // de réassignation) — un employé ne doit jamais la voir non plus.
        assignments: { where: isEmployee ? { userId: user.userId } : undefined, include: { offers: true } },
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  async findOne(companyId: string, id: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { id, site: { companyId } },
      include: { assignments: { include: { offers: true } } },
    });
    if (!shift) {
      throw new NotFoundException('Shift introuvable');
    }
    return shift;
  }

  // Marché de shifts : les offres d'échange encore ouvertes de toute
  // l'entreprise, visibles par n'importe quel employé pour qu'il puisse les
  // reprendre — sauf les siennes. Séparé de findAll (qui reste strictement
  // "mes shifts") pour ne pas faire fuiter le planning des collègues dans
  // l'écran Planning. `hasApplied` évite de re-proposer un bouton "candidater"
  // actif sur une offre où l'appelant a déjà candidaté.
  async listOpenOffers(companyId: string, requesterId: string) {
    const offers = await this.prisma.shiftOffer.findMany({
      where: {
        status: 'open',
        offeredBy: { not: requesterId },
        shiftAssignment: { shift: { site: { companyId } } },
      },
      include: {
        shiftAssignment: { include: { shift: true } },
        candidates: { where: { userId: requesterId } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return offers.map((offer) => ({
      id: offer.id,
      shiftId: offer.shiftAssignment.shiftId,
      shift: offer.shiftAssignment.shift,
      offeredBy: offer.offeredBy,
      createdAt: offer.createdAt,
      hasApplied: offer.candidates.length > 0,
    }));
  }

  // Le pendant côté manager : toutes les offres encore ouvertes de
  // l'entreprise (page Échanges à valider, web-manager), candidatures
  // comprises — y compris celles qui n'ont encore trouvé aucun candidat,
  // pour que le manager sache qu'un shift proposé au marché est resté sans
  // preneur, pas seulement celles prêtes à valider.
  async listPendingOffersForManager(companyId: string) {
    const offers = await this.prisma.shiftOffer.findMany({
      where: {
        status: 'open',
        shiftAssignment: { shift: { site: { companyId } } },
      },
      include: {
        shiftAssignment: { include: { shift: true } },
        candidates: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return offers.map((offer) => ({
      id: offer.id,
      shiftId: offer.shiftAssignment.shiftId,
      shift: offer.shiftAssignment.shift,
      offeredBy: offer.offeredBy,
      createdAt: offer.createdAt,
      candidates: offer.candidates,
    }));
  }

  async update(companyId: string, id: string, dto: UpdateShiftDto) {
    const existing = await this.findOne(companyId, id);
    if (dto.siteId) {
      const site = await this.prisma.site.findFirst({ where: { id: dto.siteId, companyId } });
      if (!site) {
        throw new NotFoundException('Site introuvable');
      }
    }

    // Valide l'état final (pas juste les champs fournis) : un PATCH qui ne
    // touche qu'un seul des deux bords pourrait sinon rendre l'intervalle
    // invalide par rapport à l'autre bord resté inchangé.
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : existing.endsAt;
    if (endsAt <= startsAt) {
      throw new BadRequestException("L'heure de fin doit être après l'heure de début");
    }

    const shift = await this.prisma.shift.update({
      where: { id },
      data: {
        ...(dto.siteId ? { siteId: dto.siteId } : {}),
        ...(dto.startsAt ? { startsAt } : {}),
        ...(dto.endsAt ? { endsAt } : {}),
        ...(dto.roleNeeded !== undefined ? { roleNeeded: dto.roleNeeded } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
    // On ne notifie les autres clients que sur le vrai passage à "published"
    // (bouton Publier d'une carte, "Publier N brouillons", ou changement de
    // statut via l'éditeur générique) — c'est le seul moment où le contenu
    // change réellement pour un employé ou un autre manager qui n'a pas
    // cette page ouverte. Un simple ajustement d'horaire/rôle sur un
    // brouillon reste un détail de mise en place du planning, pas une
    // information à pousser en direct.
    if (dto.status === 'published') {
      this.realtime.emitToCompany(companyId, 'shifts:changed');
    }
    return shift;
  }

  // Supprimer un shift qui a des assignations violerait la contrainte de clé
  // étrangère (ShiftAssignment.shiftId) — on supprime la chaîne complète
  // (offres -> assignations -> shift) en une transaction plutôt que de
  // planter en 500.
  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);

    const assignments = await this.prisma.shiftAssignment.findMany({
      where: { shiftId: id },
      select: { id: true },
    });
    const assignmentIds = assignments.map((a) => a.id);

    await this.prisma.$transaction([
      this.prisma.shiftOffer.deleteMany({ where: { shiftAssignmentId: { in: assignmentIds } } }),
      this.prisma.shiftAssignment.deleteMany({ where: { shiftId: id } }),
      this.prisma.shift.delete({ where: { id } }),
    ]);
    // Même logique que create()/update() : supprimer un shift fait partie du
    // travail de mise en place du planning, pas de la publication — pas
    // d'émission en direct pour autant.
  }

  // Un shift = un seul employé assigné à la fois.
  async assign(companyId: string, shiftId: string, dto: AssignShiftDto) {
    const shift = await this.findOne(companyId, shiftId);

    const activeAssignment = shift.assignments.find((a) => a.status !== 'cancelled');
    if (activeAssignment) {
      throw new ConflictException('Ce shift est déjà assigné à un autre employé');
    }

    const employee = await this.prisma.user.findFirst({ where: { id: dto.userId, companyId } });
    if (!employee) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    // Les heures d'une Availability ("HH:mm") sont déclarées en heure locale
    // du site ; le shift est stocké en UTC. Il faut le fuseau du site pour
    // comparer les deux sans décalage (voir ensureAvailable).
    const site = await this.prisma.site.findFirst({
      where: { id: shift.siteId, companyId },
      select: { timezone: true },
    });

    await this.ensureAvailable(dto.userId, shift.startsAt, shift.endsAt, site?.timezone ?? 'Europe/Brussels');
    await this.ensureNoOverlap(dto.userId, shift.startsAt, shift.endsAt, shiftId);

    const assignment = await this.prisma.shiftAssignment.create({
      data: { shiftId, userId: dto.userId, status: 'assigned' },
    });
    // Assigner un employé sur la grille est aussi un geste de préparation du
    // planning (souvent sur un brouillon) — pas d'émission ici, seule la
    // publication (update() avec status: 'published') prévient les autres
    // clients. Voir CLAUDE.md décision #23.
    return assignment;
  }

  async offerAssignment(companyId: string, employee: AuthenticatedUser, assignmentId: string) {
    const assignment = await this.findOwnedAssignment(companyId, assignmentId);

    if (assignment.userId !== employee.userId) {
      throw new ForbiddenException("Ce shift n'est pas assigné à cet utilisateur");
    }
    if (assignment.status !== 'assigned') {
      throw new BadRequestException('Ce shift ne peut pas être proposé dans son état actuel');
    }

    const [offer] = await this.prisma.$transaction([
      this.prisma.shiftOffer.create({
        data: { shiftAssignmentId: assignmentId, offeredBy: employee.userId, status: 'open' },
      }),
      this.prisma.shiftAssignment.update({
        where: { id: assignmentId },
        data: { status: 'offered' },
      }),
    ]);

    this.realtime.emitToCompany(companyId, 'shifts:changed');
    return offer;
  }

  // Un collègue candidate sur une offre encore ouverte — plusieurs
  // candidatures possibles par offre (voir décision correspondante dans
  // CLAUDE.md). Ni le statut de l'offre ni celui de l'assignation ne
  // changent : le shift reste visible dans le planning de son propriétaire
  // d'origine (toujours 'offered') tant que le manager n'a pas choisi un
  // candidat via approveOffer.
  async acceptOffer(companyId: string, colleague: AuthenticatedUser, offerId: string) {
    const offer = await this.findOwnedOffer(companyId, offerId);

    if (offer.status !== 'open') {
      throw new BadRequestException("Cette offre n'est plus disponible");
    }
    if (offer.offeredBy === colleague.userId) {
      throw new ForbiddenException("Impossible d'accepter sa propre offre");
    }

    const existing = await this.prisma.shiftOfferCandidate.findFirst({
      where: { offerId, userId: colleague.userId },
    });
    if (existing) {
      throw new BadRequestException('Vous avez déjà candidaté pour cet échange');
    }

    // Retour rapide pour le candidat — pas une garantie définitive, revérifié
    // à l'approbation puisque sa disponibilité peut changer d'ici là.
    await this.ensureNoOverlap(
      colleague.userId,
      offer.shiftAssignment.shift.startsAt,
      offer.shiftAssignment.shift.endsAt,
      offer.shiftAssignment.shiftId,
    );

    const candidacy = await this.prisma.shiftOfferCandidate.create({
      data: { offerId, userId: colleague.userId },
    });
    // Le manager voit la nouvelle candidature en direct sur la page
    // Échanges à valider, sans avoir à recharger.
    this.realtime.emitToCompany(companyId, 'shifts:changed');
    return candidacy;
  }

  // Le manager choisit UN candidat parmi ceux qui ont postulé (dto.userId) —
  // transfère l'assignation, clôt l'offre, et efface les autres candidatures
  // (elles n'ont plus d'objet une fois l'offre résolue).
  async approveOffer(companyId: string, offerId: string, dto: ApproveShiftOfferDto) {
    const offer = await this.findOwnedOffer(companyId, offerId);

    if (offer.status !== 'open') {
      throw new BadRequestException("Cette offre n'est plus disponible");
    }

    const candidate = await this.prisma.shiftOfferCandidate.findFirst({
      where: { offerId, userId: dto.userId },
    });
    if (!candidate) {
      throw new NotFoundException("Cet employé n'a pas candidaté pour cet échange");
    }

    // Re-vérifié à l'approbation : le candidat choisi a pu être assigné
    // ailleurs entre sa candidature et la validation manager.
    await this.ensureNoOverlap(
      dto.userId,
      offer.shiftAssignment.shift.startsAt,
      offer.shiftAssignment.shift.endsAt,
      offer.shiftAssignment.shiftId,
    );

    const [, , updatedOffer] = await this.prisma.$transaction([
      this.prisma.shiftOfferCandidate.deleteMany({ where: { offerId } }),
      this.prisma.shiftAssignment.update({
        where: { id: offer.shiftAssignmentId },
        data: { userId: dto.userId, status: 'confirmed' },
      }),
      this.prisma.shiftOffer.update({
        where: { id: offerId },
        data: { acceptedBy: dto.userId, status: 'approved', resolvedAt: new Date() },
      }),
    ]);

    this.realtime.emitToCompany(companyId, 'shifts:changed');
    return updatedOffer;
  }

  // Le manager retire l'offre du marché sans choisir personne — l'offre
  // passe en 'rejected' (état terminal), les candidatures sont effacées, et
  // l'assignation revient au propriétaire d'origine. S'il veut retenter, il
  // doit reproposer explicitement via offerAssignment.
  async rejectOffer(companyId: string, offerId: string) {
    const offer = await this.findOwnedOffer(companyId, offerId);

    if (offer.status !== 'open') {
      throw new BadRequestException("Cette offre n'est plus disponible");
    }

    const [, , updatedOffer] = await this.prisma.$transaction([
      this.prisma.shiftOfferCandidate.deleteMany({ where: { offerId } }),
      this.prisma.shiftAssignment.update({
        where: { id: offer.shiftAssignmentId },
        data: { status: 'assigned' },
      }),
      this.prisma.shiftOffer.update({
        where: { id: offerId },
        data: { status: 'rejected', resolvedAt: new Date() },
      }),
    ]);

    this.realtime.emitToCompany(companyId, 'shifts:changed');
    return updatedOffer;
  }

  private async findOwnedAssignment(companyId: string, id: string) {
    const assignment = await this.prisma.shiftAssignment.findFirst({
      where: { id, shift: { site: { companyId } } },
    });
    if (!assignment) {
      throw new NotFoundException('Assignation introuvable');
    }
    return assignment;
  }

  private async findOwnedOffer(companyId: string, id: string) {
    const offer = await this.prisma.shiftOffer.findFirst({
      where: { id, shiftAssignment: { shift: { site: { companyId } } } },
      include: { shiftAssignment: { include: { shift: true } } },
    });
    if (!offer) {
      throw new NotFoundException('Offre introuvable');
    }
    return offer;
  }

  // Un employé ne peut pas être sur deux shifts qui se chevauchent dans le
  // temps, quel que soit le site — vérifié à l'assignation directe, à
  // l'acceptation d'une offre d'échange, et à nouveau à l'approbation manager.
  private async ensureNoOverlap(userId: string, startsAt: Date, endsAt: Date, excludeShiftId: string) {
    const conflict = await this.prisma.shiftAssignment.findFirst({
      where: {
        userId,
        status: { not: 'cancelled' },
        shiftId: { not: excludeShiftId },
        shift: { startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
      },
      include: { shift: true },
    });

    if (conflict) {
      throw new ConflictException(
        `Cet employé a déjà un shift sur ce créneau (${conflict.shift.startsAt.toISOString()} → ${conflict.shift.endsAt.toISOString()})`,
      );
    }
  }

  // Un manager ne peut pas assigner un shift à un employé qui a déclaré ne
  // pas être disponible ce jour-là (ou qui n'a rien déclaré du tout — on
  // bloque par défaut plutôt que d'assigner par erreur, voir brief). Une
  // disponibilité ponctuelle (specificDate) pour le jour exact prime sur
  // une disponibilité récurrente (dayOfWeek) du même jour.
  //
  // Le shift est stocké en UTC, mais les heures d'une Availability ("HH:mm")
  // et son jour de la semaine se raisonnent en heure LOCALE du site : on
  // ramène donc le shift dans le fuseau du site avant toute comparaison,
  // sinon un décalage d'1–2 h (heure d'hiver / d'été) fait rejeter des
  // créneaux valides le matin et accepter des créneaux invalides le soir.
  private async ensureAvailable(userId: string, startsAt: Date, endsAt: Date, timezone: string) {
    const start = zonedParts(startsAt, timezone);
    const end = zonedParts(endsAt, timezone);

    // Jour civil du shift dans le fuseau du site (minuit UTC de cette date) —
    // pour la recherche par specificDate et par jour de la semaine.
    const dayStart = new Date(Date.UTC(start.year, start.month - 1, start.day));
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const dayOfWeek = start.weekday; // lundi = 0, même convention que le reste de l'app

    const specific = await this.prisma.availability.findFirst({
      where: { userId, specificDate: { gte: dayStart, lt: dayEnd } },
    });
    const availability =
      specific ??
      (await this.prisma.availability.findFirst({
        where: { userId, dayOfWeek, specificDate: null },
      }));

    const dateLabel = formatDate(dayStart);
    const shiftRangeLabel = `${formatMinutes(start.minutesOfDay)} et ${formatMinutes(end.minutesOfDay)}`;

    // Aucune déclaration pour ce jour == disponible par défaut (décision #8
    // révisée) : l'inverse ("pas de déclaration = bloqué") semblait plus sûr
    // sur le papier, mais en pratique bloquait en silence des employés dont
    // la grille planning n'affichait pourtant aucun signe d'indisponibilité
    // (décision #14 traite déjà l'absence de déclaration comme 'none' à
    // l'affichage) — un manager n'avait aucun moyen de deviner pourquoi une
    // case visuellement libre refusait toute dépose. Un employé qui ne peut
    // vraiment pas travailler un jour donné doit le déclarer explicitement
    // (isAvailable: false) : c'est ce cas-là, pas le silence, qui bloque.
    if (!availability) {
      return;
    }

    // Un shift de nuit peut finir le lendemain en heure locale — on place
    // alors la fin sur une échelle > 24 h pour toutes les comparaisons
    // ci-dessous.
    const dayDiff = Math.round((Date.UTC(end.year, end.month - 1, end.day) - dayStart.getTime()) / 86_400_000);
    const shiftEndMinutes = end.minutesOfDay + dayDiff * 24 * 60;

    if (availability.isAvailable) {
      const availStartMinutes = parseHhmm(availability.startTime);
      const availEndMinutes = parseHhmm(availability.endTime);
      if (start.minutesOfDay < availStartMinutes || shiftEndMinutes > availEndMinutes) {
        throw new ConflictException(
          `Cet employé n'est disponible que de ${availability.startTime} à ${availability.endTime} le ${dateLabel}, ` +
            `en dehors du créneau du shift (${shiftRangeLabel})`,
        );
      }
      return;
    }

    // isAvailable: false — bloque toute la journée par défaut. L'employé a pu
    // restreindre son indisponibilité à une plage précise (écran
    // Disponibilités, "Préciser une plage horaire" — voir FULL_DAY_START/END) :
    // dans ce cas seul un shift qui chevauche cette plage (en heure locale du
    // site) est refusé, le reste de la journée reste assignable.
    const isFullDayBlock = availability.startTime === FULL_DAY_START && availability.endTime === FULL_DAY_END;
    if (isFullDayBlock) {
      throw new ConflictException(`Cet employé n'est pas disponible le ${dateLabel} entre ${shiftRangeLabel}`);
    }

    const blockStartMinutes = parseHhmm(availability.startTime);
    const blockEndMinutes = parseHhmm(availability.endTime);
    const overlapsBlock = start.minutesOfDay < blockEndMinutes && shiftEndMinutes > blockStartMinutes;
    if (overlapsBlock) {
      throw new ConflictException(
        `Cet employé a déclaré être indisponible de ${availability.startTime} à ${availability.endTime} le ` +
          `${dateLabel}, ce qui chevauche le créneau du shift (${shiftRangeLabel})`,
      );
    }
  }
}

// Sentinelle "toute la journée" pour une indisponibilité non restreinte à une
// plage précise — voir CLAUDE.md décision #8 et AvailabilitiesScreen côté
// checkin-mobile ("Préciser une plage horaire").
const FULL_DAY_START = '00:00';
const FULL_DAY_END = '23:59';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(d: Date): string {
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function formatMinutes(minutesOfDay: number): string {
  const m = ((minutesOfDay % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

function parseHhmm(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

// Décompose un instant (Date UTC) dans un fuseau IANA donné (ex:
// "Europe/Brussels"), pour comparer un shift stocké en UTC aux heures
// locales déclarées dans une Availability.
function zonedParts(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number; weekday: number; minutesOfDay: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  })
    .formatToParts(instant)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
    minutesOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

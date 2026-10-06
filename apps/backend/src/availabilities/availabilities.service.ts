import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';

@Injectable()
export class AvailabilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(companyId: string, userId: string, dto: CreateAvailabilityDto) {
    const availability = await this.prisma.availability.create({
      data: {
        userId,
        dayOfWeek: dto.dayOfWeek,
        specificDate: dto.specificDate ? new Date(dto.specificDate) : undefined,
        startTime: dto.startTime,
        endTime: dto.endTime,
        isAvailable: dto.isAvailable ?? true,
      },
    });

    this.realtime.emitToCompany(companyId, 'availabilities:changed');
    return availability;
  }

  findAll(companyId: string, requesterId: string, requesterRole: string, targetUserId?: string) {
    // Un employé ne voit que ses propres dispos ; un manager peut filtrer par
    // employé ou consulter toute l'entreprise pour construire le planning.
    const userId = requesterRole === 'employee' ? requesterId : targetUserId;

    return this.prisma.availability.findMany({
      where: {
        user: { companyId },
        ...(userId ? { userId } : {}),
      },
      orderBy: [{ dayOfWeek: 'asc' }, { specificDate: 'asc' }],
    });
  }

  // Édition en place d'un créneau (ex: bascule Disponible/Indisponible ou
  // ajustement d'horaire) — sert l'écran mobile qui affiche un créneau par
  // jour plutôt que de forcer l'utilisateur à en créer un nouveau à chaque fois.
  async update(
    companyId: string,
    requesterId: string,
    requesterRole: string,
    id: string,
    dto: UpdateAvailabilityDto,
  ) {
    await this.findOwned(companyId, requesterId, requesterRole, id);

    const updated = await this.prisma.availability.update({
      where: { id },
      data: {
        ...(dto.dayOfWeek !== undefined ? { dayOfWeek: dto.dayOfWeek } : {}),
        ...(dto.specificDate !== undefined ? { specificDate: new Date(dto.specificDate) } : {}),
        ...(dto.startTime !== undefined ? { startTime: dto.startTime } : {}),
        ...(dto.endTime !== undefined ? { endTime: dto.endTime } : {}),
        ...(dto.isAvailable !== undefined ? { isAvailable: dto.isAvailable } : {}),
      },
    });

    this.realtime.emitToCompany(companyId, 'availabilities:changed');
    return updated;
  }

  async remove(companyId: string, requesterId: string, requesterRole: string, id: string) {
    await this.findOwned(companyId, requesterId, requesterRole, id);
    await this.prisma.availability.delete({ where: { id } });
    this.realtime.emitToCompany(companyId, 'availabilities:changed');
  }

  // Availability n'a pas de companyId propre — scopée via la relation user.
  private async findOwned(companyId: string, requesterId: string, requesterRole: string, id: string) {
    const availability = await this.prisma.availability.findFirst({
      where: { id, user: { companyId } },
    });
    if (!availability) {
      throw new NotFoundException('Disponibilité introuvable');
    }
    // Un employé ne gère que ses propres disponibilités ; un manager peut
    // gérer celles de toute l'entreprise (déjà scopée par companyId ci-dessus).
    if (requesterRole === 'employee' && availability.userId !== requesterId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres disponibilités');
    }
    return availability;
  }
}

import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma, TimeEntrySource, TimeEntryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { RotatingQrService } from '../users/rotating-qr.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuthenticatedUser } from '../auth/current-user.decorator';
import { AuthenticatedDevice } from '../site-devices/current-device.decorator';
import { CreateDeviceTimeEntryDto } from './dto/create-device-time-entry.dto';
import { CreateSelfTimeEntryDto } from './dto/create-self-time-entry.dto';
import { CreateManualTimeEntryDto } from './dto/create-manual-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { FindTimeEntriesQueryDto } from './dto/find-time-entries-query.dto';
import { ScanRotatingQrDto } from './dto/scan-rotating-qr.dto';

const PRESENCE_TYPES: TimeEntryType[] = ['clock_in', 'clock_out'];

@Injectable()
export class TimeEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly rotatingQrService: RotatingQrService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // Le kiosk n'a pas accès à /sites/:id/presence (réservé aux managers) pour
  // décider lui-même arrivée/départ — le serveur bascule donc automatiquement
  // clock_in/clock_out selon le dernier pointage de cet employé sur ce site.
  async createFromDevice(device: AuthenticatedDevice, dto: CreateDeviceTimeEntryDto) {
    const user = await this.resolveDeviceUser(device, dto);
    const type = await this.nextClockType(user.id, device.siteId);

    const entry = await this.prisma.timeEntry.create({
      data: {
        userId: user.id,
        siteId: device.siteId,
        deviceId: device.deviceId,
        type,
        timestamp: new Date(),
        source: dto.source,
      },
    });

    this.realtime.emitToCompany(device.companyId, 'time-entries:changed');
    return { ...entry, employee: { firstName: user.firstName, lastName: user.lastName } };
  }

  // Modèle "Basic-Fit" : le téléphone de l'employé génère un QR rotatif
  // (TOTP), la tablette le scanne. Inverse de l'ancien modèle où c'était le
  // téléphone qui scannait le QR fixe de la tablette (voir createSelf,
  // source qr_scan_own_phone + deviceId — laissé en place mais plus utilisé
  // par checkin-mobile depuis ce changement).
  async createFromRotatingQr(device: AuthenticatedDevice, dto: ScanRotatingQrDto) {
    const { userId, code } = this.rotatingQrService.decodePayload(dto.payload);

    // RÈGLE CRITIQUE (voir CLAUDE.md) : le userId vient d'un payload scanné
    // par un device, donc non fiable — on ne fait jamais confiance à un id
    // brut sans le rescoper par companyId avant de vérifier/utiliser quoi
    // que ce soit dessus.
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId: device.companyId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!user) {
      throw new UnauthorizedException('Code QR invalide');
    }

    const isValid = await this.rotatingQrService.verifyCode(user.id, code);
    if (!isValid) {
      throw new UnauthorizedException('Code expiré ou invalide');
    }

    const type = await this.nextClockType(user.id, device.siteId);

    const entry = await this.prisma.timeEntry.create({
      data: {
        userId: user.id,
        siteId: device.siteId,
        deviceId: device.deviceId,
        type,
        timestamp: new Date(),
        source: 'qr_scan_own_phone',
      },
    });

    this.realtime.emitToCompany(device.companyId, 'time-entries:changed');
    return { ...entry, employee: { firstName: user.firstName, lastName: user.lastName } };
  }

  async createSelf(user: AuthenticatedUser, dto: CreateSelfTimeEntryDto) {
    if (dto.source === 'gps') {
      await this.ensureGpsClockInAllowed(user.userId);
    }

    let siteId: string;
    let deviceId: string | undefined;

    if (dto.source === 'qr_scan_own_phone') {
      const device = await this.prisma.siteDevice.findFirst({
        where: { id: dto.deviceId, site: { companyId: user.companyId } },
      });
      if (!device) {
        throw new NotFoundException('Terminal introuvable');
      }
      siteId = device.siteId;
      deviceId = device.id;
    } else {
      const site = await this.prisma.site.findFirst({
        where: { id: dto.siteId, companyId: user.companyId },
      });
      if (!site) {
        throw new NotFoundException('Site introuvable');
      }
      siteId = site.id;
    }

    const entry = await this.prisma.timeEntry.create({
      data: {
        userId: user.userId,
        siteId,
        deviceId,
        type: dto.type,
        timestamp: new Date(),
        geoLat: dto.source === 'gps' ? dto.geoLat : undefined,
        geoLng: dto.source === 'gps' ? dto.geoLng : undefined,
        source: dto.source,
      },
    });

    this.realtime.emitToCompany(user.companyId, 'time-entries:changed');
    return entry;
  }

  async createManual(manager: AuthenticatedUser, dto: CreateManualTimeEntryDto) {
    const [site, targetUser] = await Promise.all([
      this.prisma.site.findFirst({ where: { id: dto.siteId, companyId: manager.companyId } }),
      this.prisma.user.findFirst({ where: { id: dto.userId, companyId: manager.companyId } }),
    ]);
    if (!site) {
      throw new NotFoundException('Site introuvable');
    }
    if (!targetUser) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const entry = await this.prisma.timeEntry.create({
      data: {
        userId: dto.userId,
        siteId: dto.siteId,
        type: dto.type,
        timestamp: new Date(),
        source: 'manual_by_manager',
        createdBy: manager.userId,
        creationReason: dto.creationReason,
      },
    });

    this.realtime.emitToCompany(manager.companyId, 'time-entries:changed');
    return entry;
  }

  findAll(requester: AuthenticatedUser, query: FindTimeEntriesQueryDto) {
    // Un employé ne voit que ses propres pointages, quel que soit ?userId=.
    const targetUserId = requester.role === 'employee' ? requester.userId : query.userId;

    return this.prisma.timeEntry.findMany({
      where: {
        site: { companyId: requester.companyId },
        ...(targetUserId ? { userId: targetUserId } : {}),
        ...(query.from || query.to
          ? {
              timestamp: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { timestamp: 'desc' },
    });
  }

  async update(companyId: string, managerId: string, id: string, dto: UpdateTimeEntryDto) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id, site: { companyId } },
    });
    if (!entry) {
      throw new NotFoundException('Pointage introuvable');
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: {
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.timestamp ? { timestamp: new Date(dto.timestamp) } : {}),
        isEdited: true,
        editedBy: managerId,
        editReason: dto.editReason,
      },
    });

    this.realtime.emitToCompany(companyId, 'time-entries:changed');
    return updated;
  }

  async getPresence(companyId: string, siteId: string) {
    const site = await this.prisma.site.findFirst({ where: { id: siteId, companyId } });
    if (!site) {
      throw new NotFoundException('Site introuvable');
    }

    const entries = await this.prisma.timeEntry.findMany({
      where: { siteId, type: { in: PRESENCE_TYPES } },
      orderBy: { timestamp: 'asc' },
      select: { userId: true, type: true, timestamp: true, source: true, geoLat: true, geoLng: true },
    });

    // On garde le dernier pointage de chaque employé — s'il s'agit d'un
    // clock_in, l'employé est présent depuis ce timestamp précis (sert à
    // afficher "depuis 09:00" et le mode de pointage côté client sans
    // recalcul serveur).
    type LastEntry = {
      type: TimeEntryType;
      since: Date;
      source: TimeEntrySource;
      geoLat: Prisma.Decimal | null;
      geoLng: Prisma.Decimal | null;
    };
    const lastEntryByUser = new Map<string, LastEntry>();
    for (const entry of entries) {
      lastEntryByUser.set(entry.userId, {
        type: entry.type,
        since: entry.timestamp,
        source: entry.source,
        geoLat: entry.geoLat,
        geoLng: entry.geoLng,
      });
    }

    const present = [...lastEntryByUser.entries()].filter(([, e]) => e.type === 'clock_in');
    if (present.length === 0) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: present.map(([userId]) => userId) } },
      select: { id: true, firstName: true, lastName: true },
    });
    const entryByUser = new Map(present);
    const siteLat = site.geoLat != null ? Number(site.geoLat) : null;
    const siteLng = site.geoLng != null ? Number(site.geoLng) : null;

    return users.map((u) => {
      const entry = entryByUser.get(u.id)!;
      const geoLat = entry.geoLat != null ? Number(entry.geoLat) : null;
      const geoLng = entry.geoLng != null ? Number(entry.geoLng) : null;
      const distanceFromSiteMeters =
        entry.source === 'gps' && geoLat !== null && geoLng !== null && siteLat !== null && siteLng !== null
          ? haversineDistanceMeters(geoLat, geoLng, siteLat, siteLng)
          : null;

      return {
        ...u,
        since: entry.since,
        source: entry.source,
        geoLat,
        geoLng,
        distanceFromSiteMeters,
      };
    });
  }

  private async resolveDeviceUser(device: AuthenticatedDevice, dto: CreateDeviceTimeEntryDto) {
    if (dto.source === 'badge_scan') {
      const user = await this.prisma.user.findFirst({
        where: { badgeCode: dto.badgeCode, companyId: device.companyId },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!user) {
        throw new UnauthorizedException('Badge inconnu');
      }
      return user;
    }

    const user = await this.usersService.resolveByPin(device.companyId, dto.pin ?? '');
    if (!user) {
      throw new UnauthorizedException('PIN invalide');
    }
    return user;
  }

  private async nextClockType(userId: string, siteId: string): Promise<TimeEntryType> {
    const last = await this.prisma.timeEntry.findFirst({
      where: { userId, siteId, type: { in: PRESENCE_TYPES } },
      orderBy: { timestamp: 'desc' },
      select: { type: true },
    });
    return last?.type === 'clock_in' ? 'clock_out' : 'clock_in';
  }

  // User.gpsClockInEnabled (surcharge individuelle) prime sur
  // Company.gpsClockInEnabled (réglage par défaut) quand il est renseigné.
  private async ensureGpsClockInAllowed(userId: string) {
    const requester = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { gpsClockInEnabled: true, company: { select: { gpsClockInEnabled: true } } },
    });
    const enabled = requester?.gpsClockInEnabled ?? requester?.company.gpsClockInEnabled ?? true;
    if (!enabled) {
      throw new ForbiddenException("Le pointage GPS n'est pas autorisé pour cet utilisateur");
    }
  }
}

// Distance à vol d'oiseau (formule de Haversine), en mètres — sert au
// manager à juger si un pointage GPS est cohérent avec une présence réelle
// sur le site (voir sites/presence).
function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

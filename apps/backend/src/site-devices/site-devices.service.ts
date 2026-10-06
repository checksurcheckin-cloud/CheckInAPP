import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateSiteDeviceDto } from './dto/create-site-device.dto';
import { AuthenticateDeviceDto } from './dto/authenticate-device.dto';
import { EnrollBadgeDto } from './dto/enroll-badge.dto';

interface DeviceJwtPayload {
  deviceId: string;
  siteId: string;
  companyId: string;
  type: 'device';
}

@Injectable()
export class SiteDevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async create(companyId: string, dto: CreateSiteDeviceDto) {
    await this.ensureSiteInCompany(companyId, dto.siteId);
    const qrSecret = randomBytes(32).toString('hex');
    return this.prisma.siteDevice.create({
      data: { siteId: dto.siteId, deviceLabel: dto.deviceLabel, qrSecret },
    });
  }

  async findAll(companyId: string, siteId: string) {
    await this.ensureSiteInCompany(companyId, siteId);
    return this.prisma.siteDevice.findMany({ where: { siteId } });
  }

  async rotateSecret(companyId: string, id: string) {
    await this.findOwned(companyId, id);
    const qrSecret = randomBytes(32).toString('hex');
    return this.prisma.siteDevice.update({
      where: { id },
      data: { qrSecret, qrRotatedAt: new Date() },
    });
  }

  async authenticate(dto: AuthenticateDeviceDto) {
    const device = await this.prisma.siteDevice.findUnique({
      where: { id: dto.deviceId },
      include: { site: true },
    });

    if (!device || !this.secretsMatch(device.qrSecret, dto.qrSecret)) {
      throw new UnauthorizedException('Identifiants device invalides');
    }

    const payload: DeviceJwtPayload = {
      deviceId: device.id,
      siteId: device.siteId,
      companyId: device.site.companyId,
      type: 'device',
    };

    const deviceToken = this.jwt.sign(payload, {
      secret: process.env.JWT_DEVICE_SECRET,
      expiresIn: process.env.JWT_DEVICE_EXPIRES_IN ?? '12h',
    });

    return { deviceToken, siteId: device.siteId, deviceLabel: device.deviceLabel };
  }

  // Un employé identifié par son PIN peut lier un nouveau badge à son compte
  // directement au kiosk, sans passer par le panel manager (§2.8).
  async enrollBadge(companyId: string, dto: EnrollBadgeDto) {
    const user = await this.usersService.resolveByPin(companyId, dto.pin);
    if (!user) {
      throw new UnauthorizedException('PIN invalide');
    }

    const existing = await this.prisma.user.findUnique({ where: { badgeCode: dto.badgeCode } });
    if (existing && existing.id !== user.id) {
      throw new ConflictException('Ce badge est déjà attribué à un autre employé');
    }

    return this.prisma.user.update({
      where: { id: user.id },
      data: { badgeCode: dto.badgeCode },
      select: { id: true, firstName: true, lastName: true, badgeCode: true },
    });
  }

  private async ensureSiteInCompany(companyId: string, siteId: string) {
    const site = await this.prisma.site.findFirst({ where: { id: siteId, companyId } });
    if (!site) {
      throw new NotFoundException('Site introuvable');
    }
    return site;
  }

  private async findOwned(companyId: string, id: string) {
    const device = await this.prisma.siteDevice.findFirst({
      where: { id, site: { companyId } },
    });
    if (!device) {
      throw new NotFoundException('Device introuvable');
    }
    return device;
  }

  // Comparaison en temps constant : qrSecret sert d'identifiant d'accès à un
  // terminal physique, pas question de laisser fuiter sa valeur via le temps
  // de réponse d'une comparaison naïve.
  private secretsMatch(expected: string, provided: string): boolean {
    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(provided);
    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }
    return timingSafeEqual(expectedBuf, providedBuf);
  }
}

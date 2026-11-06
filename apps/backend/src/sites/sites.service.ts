import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(companyId: string, dto: CreateSiteDto) {
    const site = await this.prisma.site.create({ data: { ...dto, companyId } });
    this.notifySitesChanged(companyId);
    return site;
  }

  findAll(companyId: string) {
    return this.prisma.site.findMany({ where: { companyId } });
  }

  async findOne(companyId: string, id: string) {
    const site = await this.prisma.site.findFirst({ where: { id, companyId } });
    if (!site) {
      throw new NotFoundException('Site introuvable');
    }
    return site;
  }

  async update(companyId: string, id: string, dto: UpdateSiteDto) {
    await this.findOne(companyId, id);
    const site = await this.prisma.site.update({ where: { id }, data: dto });
    this.notifySitesChanged(companyId);
    return site;
  }

  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);
    await this.prisma.site.delete({ where: { id } });
    this.notifySitesChanged(companyId);
  }

  // La liste des sites est en cache côté web-manager (sélecteurs de site de
  // chaque page) : ce signal dit aux managers connectés de la recharger.
  private notifySitesChanged(companyId: string) {
    this.realtime.emitToCompany(companyId, 'sites:changed');
  }
}

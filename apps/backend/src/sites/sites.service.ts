import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  create(companyId: string, dto: CreateSiteDto) {
    return this.prisma.site.create({ data: { ...dto, companyId } });
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
    return this.prisma.site.update({ where: { id }, data: dto });
  }

  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);
    await this.prisma.site.delete({ where: { id } });
  }
}

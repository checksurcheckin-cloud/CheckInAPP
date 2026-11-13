import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  findMine(companyId: string) {
    return this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  }

  updateMine(companyId: string, dto: UpdateCompanyDto) {
    return this.prisma.company.update({ where: { id: companyId }, data: dto });
  }

  async updateSettings(companyId: string, dto: UpdateCompanySettingsDto) {
    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        gpsClockInEnabled: dto.gpsClockInEnabled,
        mobileClockInEnabled: dto.mobileClockInEnabled,
        jointCommittee: dto.jointCommittee,
        planningMode: dto.planningMode,
      },
    });
    // checkin-mobile affiche/masque l'onglet Pointage en direct (décision #35).
    this.realtime.emitToCompany(companyId, 'settings:changed');
    return company;
  }
}

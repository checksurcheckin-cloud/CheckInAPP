import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/tenant-scope.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';

@ApiTags('companies')
@Controller('companies')
@UseGuards(JwtAuthGuard, TenantScopeGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('me')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.companiesService.findMine(user.companyId);
  }

  @Patch('me')
  @UseGuards(RolesGuard)
  @Roles('admin')
  updateMine(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.updateMine(user.companyId, dto);
  }

  @Patch('me/settings')
  @UseGuards(RolesGuard)
  @Roles('admin')
  updateSettings(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateCompanySettingsDto) {
    return this.companiesService.updateSettings(user.companyId, dto);
  }
}

import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/tenant-scope.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { TimeEntriesService } from '../time-entries/time-entries.service';
import { SitesService } from './sites.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@ApiTags('sites')
@Controller('sites')
@UseGuards(JwtAuthGuard, TenantScopeGuard)
export class SitesController {
  constructor(
    private readonly sitesService: SitesService,
    private readonly timeEntriesService: TimeEntriesService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.sitesService.findAll(user.companyId);
  }

  // Réservé aux managers/admins : la réponse inclut désormais les
  // coordonnées GPS exactes des employés présents (voir TimeEntriesService,
  // feature "visibilité du type de pointage") — jamais exposées à un
  // simple employé, même de la même entreprise.
  @Get(':id/presence')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  getPresence(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.timeEntriesService.getPresence(user.companyId, id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sitesService.findOne(user.companyId, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSiteDto) {
    return this.sitesService.create(user.companyId, dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateSiteDto) {
    return this.sitesService.update(user.companyId, id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sitesService.remove(user.companyId, id);
  }
}

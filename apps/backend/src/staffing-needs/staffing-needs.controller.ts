import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/tenant-scope.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { StaffingNeedsService } from './staffing-needs.service';
import { SetDateNeedsDto, SetWeeklyNeedsDto } from './dto/set-needs.dto';
import { ResolvedNeedsQueryDto, SiteNeedsQueryDto } from './dto/needs-query.dto';

// Besoins journaliers en personnel (décision #40) : définis par l'admin,
// lus par les managers dans le planning.
@ApiTags('staffing-needs')
@Controller('staffing-needs')
@UseGuards(JwtAuthGuard, TenantScopeGuard, RolesGuard)
export class StaffingNeedsController {
  constructor(private readonly needs: StaffingNeedsService) {}

  @Get()
  @Roles('admin')
  getForSite(@CurrentUser() user: AuthenticatedUser, @Query() query: SiteNeedsQueryDto) {
    return this.needs.getForSite(user.companyId, query.siteId);
  }

  // Besoins effectifs jour par jour — barre de besoins du planning.
  @Get('resolved')
  @Roles('admin', 'manager')
  resolve(@CurrentUser() user: AuthenticatedUser, @Query() query: ResolvedNeedsQueryDto) {
    return this.needs.resolve(user.companyId, query.siteId, query.from, query.to);
  }

  @Put('weekly')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  setWeekly(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetWeeklyNeedsDto) {
    return this.needs.setWeekly(user.companyId, dto.siteId, dto.dayOfWeek, dto.needs);
  }

  @Put('dates/:date')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  setDate(@CurrentUser() user: AuthenticatedUser, @Param('date') date: string, @Body() dto: SetDateNeedsDto) {
    return this.needs.setDate(user.companyId, dto.siteId, date, dto.needs);
  }

  @Delete('dates/:date')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  clearDate(@CurrentUser() user: AuthenticatedUser, @Param('date') date: string, @Query() query: SiteNeedsQueryDto) {
    return this.needs.clearDate(user.companyId, query.siteId, date);
  }
}

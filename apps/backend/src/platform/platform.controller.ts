import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPlatformAdmin, PlatformAuthGuard, PlatformPublic, PlatformRoles } from './platform-auth.guard';
import { AuthenticatedPlatformAdmin } from './platform-jwt';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformService } from './platform.service';
import { PlatformLoginDto, UpdateSubscriptionDto } from './dto/platform.dto';

// Console interne de l'équipe CheckInApp (apps/platform-dashboard). Toutes
// les routes passent par PlatformAuthGuard — JAMAIS JwtAuthGuard : un token
// d'entreprise n'y donne aucun accès, et un token plateforme n'ouvre aucune
// route d'entreprise.
@ApiTags('platform')
@Controller('platform')
@UseGuards(PlatformAuthGuard)
export class PlatformController {
  constructor(
    private readonly auth: PlatformAuthService,
    private readonly platform: PlatformService,
  ) {}

  @PlatformPublic()
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: PlatformLoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('auth/me')
  me(@CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin) {
    return admin;
  }

  @Get('overview')
  overview() {
    return this.platform.overview();
  }

  @Get('companies')
  listCompanies() {
    return this.platform.listCompanies();
  }

  @Get('companies/:id')
  getCompany(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.getCompany(id);
  }

  @Patch('companies/:id/subscription')
  @PlatformRoles('owner', 'admin')
  updateSubscription(
    @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.platform.updateSubscription(admin, id, dto);
  }

  @Get('devices')
  listDevices() {
    return this.platform.listDevices();
  }

  @Get('health')
  health() {
    return this.platform.health();
  }

  @Get('audit')
  listAudit() {
    return this.platform.listAudit();
  }
}

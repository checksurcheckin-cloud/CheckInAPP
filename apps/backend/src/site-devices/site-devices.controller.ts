import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/tenant-scope.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { DeviceAuthGuard } from './device-auth.guard';
import { CurrentDevice, AuthenticatedDevice } from './current-device.decorator';
import { SiteDevicesService } from './site-devices.service';
import { CreateSiteDeviceDto } from './dto/create-site-device.dto';
import { AuthenticateDeviceDto } from './dto/authenticate-device.dto';
import { EnrollBadgeDto } from './dto/enroll-badge.dto';
import { FindSiteDevicesQueryDto } from './dto/find-site-devices-query.dto';

@ApiTags('site-devices')
@Controller('site-devices')
export class SiteDevicesController {
  constructor(private readonly siteDevicesService: SiteDevicesService) {}

  // Endpoint appelé par le terminal checkin-pos lui-même — pas de JWT
  // utilisateur ici, le device s'identifie avec son qrSecret.
  @Post('authenticate')
  authenticate(@Body() dto: AuthenticateDeviceDto) {
    return this.siteDevicesService.authenticate(dto);
  }

  // Un employé identifié par son PIN lie un nouveau badge à son compte,
  // directement au kiosk — device authentifié, pas de JWT utilisateur.
  @Post('enroll-badge')
  @UseGuards(DeviceAuthGuard)
  enrollBadge(@CurrentDevice() device: AuthenticatedDevice, @Body() dto: EnrollBadgeDto) {
    return this.siteDevicesService.enrollBadge(device.companyId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, TenantScopeGuard)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindSiteDevicesQueryDto) {
    return this.siteDevicesService.findAll(user.companyId, query.siteId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, TenantScopeGuard, RolesGuard)
  @Roles('admin', 'manager')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSiteDeviceDto) {
    return this.siteDevicesService.create(user.companyId, dto);
  }

  @Post(':id/rotate-secret')
  @UseGuards(JwtAuthGuard, TenantScopeGuard, RolesGuard)
  @Roles('admin', 'manager')
  rotateSecret(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.siteDevicesService.rotateSecret(user.companyId, id);
  }
}

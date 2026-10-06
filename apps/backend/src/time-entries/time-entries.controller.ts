import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/tenant-scope.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { DeviceAuthGuard } from '../site-devices/device-auth.guard';
import { CurrentDevice, AuthenticatedDevice } from '../site-devices/current-device.decorator';
import { TimeEntriesService } from './time-entries.service';
import { CreateDeviceTimeEntryDto } from './dto/create-device-time-entry.dto';
import { CreateSelfTimeEntryDto } from './dto/create-self-time-entry.dto';
import { CreateManualTimeEntryDto } from './dto/create-manual-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { FindTimeEntriesQueryDto } from './dto/find-time-entries-query.dto';
import { ScanRotatingQrDto } from './dto/scan-rotating-qr.dto';

@ApiTags('time-entries')
@Controller('time-entries')
export class TimeEntriesController {
  constructor(private readonly timeEntriesService: TimeEntriesService) {}

  // Appelé par checkin-pos — badge_scan / pin_code, device authentifié.
  @Post('device')
  @UseGuards(DeviceAuthGuard)
  createFromDevice(
    @CurrentDevice() device: AuthenticatedDevice,
    @Body() dto: CreateDeviceTimeEntryDto,
  ) {
    return this.timeEntriesService.createFromDevice(device, dto);
  }

  // Appelé par checkin-pos — QR rotatif (TOTP) affiché par le téléphone de
  // l'employé, scanné par la tablette. Modèle "Basic-Fit", device authentifié.
  @Post('scan-rotating-qr')
  @UseGuards(DeviceAuthGuard)
  scanRotatingQr(@CurrentDevice() device: AuthenticatedDevice, @Body() dto: ScanRotatingQrDto) {
    return this.timeEntriesService.createFromRotatingQr(device, dto);
  }

  // Appelé par checkin-mobile — gps / qr_scan_own_phone, l'employé pointe pour lui-même.
  @Post('self')
  @UseGuards(JwtAuthGuard, TenantScopeGuard)
  createSelf(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSelfTimeEntryDto) {
    return this.timeEntriesService.createSelf(user, dto);
  }

  // Manager pointe à la place d'un employé.
  @Post('manual')
  @UseGuards(JwtAuthGuard, TenantScopeGuard, RolesGuard)
  @Roles('admin', 'manager')
  createManual(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateManualTimeEntryDto) {
    return this.timeEntriesService.createManual(user, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, TenantScopeGuard)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindTimeEntriesQueryDto) {
    return this.timeEntriesService.findAll(user, query);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, TenantScopeGuard, RolesGuard)
  @Roles('admin', 'manager')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTimeEntryDto,
  ) {
    return this.timeEntriesService.update(user.companyId, user.userId, id, dto);
  }
}

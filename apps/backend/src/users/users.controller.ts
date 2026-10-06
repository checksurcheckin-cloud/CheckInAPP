import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/tenant-scope.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { UsersService } from './users.service';
import { RotatingQrService } from './rotating-qr.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, TenantScopeGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly rotatingQrService: RotatingQrService,
  ) {}

  // `siteId` optionnel : filtre l'annuaire pour la grille planning d'un site
  // donné (voir UsersService.findAll) — omis, renvoie toute l'entreprise
  // comme avant (pas de changement de comportement par défaut).
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('siteId') siteId?: string) {
    return this.usersService.findAll(user.companyId, siteId);
  }

  // Code QR rotatif personnel (TOTP, 30s) affiché par checkin-mobile —
  // scanné par la tablette (checkin-pos) pour pointer. Deux segments donc
  // aucun conflit avec @Get(':id') ci-dessous, quel que soit l'ordre.
  @Get('me/rotating-qr')
  async getMyRotatingQr(@CurrentUser() user: AuthenticatedUser) {
    const { code, validUntil } = await this.rotatingQrService.generateCode(user.userId);
    return { payload: JSON.stringify({ userId: user.userId, code }), validUntil };
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.findOne(user.companyId, id);
  }

  @Post('invite')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  invite(@CurrentUser() user: AuthenticatedUser, @Body() dto: InviteUserDto) {
    return this.usersService.invite(user.companyId, dto);
  }

  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.usersService.updateRole(user.companyId, id, dto);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.usersService.updateStatus(user.companyId, id, dto);
  }

  @Post(':id/badge/regenerate')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  regenerateBadge(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.regenerateBadge(user.companyId, id);
  }

  @Post(':id/pin')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  setPin(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetPinDto,
  ) {
    return this.usersService.setPin(user.companyId, id, dto);
  }

  @Patch(':id/settings')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserSettingsDto,
  ) {
    return this.usersService.updateSettings(user.companyId, id, dto);
  }
}

import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { MOBILE_CLOCK_IN_DISABLED_MESSAGE, enablesClockIn } from './clock-in-settings';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/tenant-scope.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { SiteScopeService } from '../site-scope/site-scope.service';
import { SetManagedSitesDto } from './dto/set-managed-sites.dto';
import { UsersService } from './users.service';
import { RotatingQrService } from './rotating-qr.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { UpdateUserContractDto } from './dto/update-user-contract.dto';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, TenantScopeGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly rotatingQrService: RotatingQrService,
    private readonly siteScope: SiteScopeService,
  ) {}

  // Périmètre de l'appelant (décision #36) : web-manager s'en sert pour ne
  // proposer que ses magasins dans les listes déroulantes.
  @Get('me/scope')
  async getMyScope(@CurrentUser() user: AuthenticatedUser) {
    const siteIds = await this.siteScope.managedSiteIds(user);
    return { allSites: siteIds === null, siteIds: siteIds ?? [] };
  }

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
    // Pas de QR à afficher si le pointage mobile est coupé (décision #35).
    const settings = await this.usersService.getClockInSettings(user.companyId, user.userId);
    if (!settings.mobileClockInEnabled) {
      throw new ForbiddenException(MOBILE_CLOCK_IN_DISABLED_MESSAGE);
    }
    const { code, validUntil } = await this.rotatingQrService.generateCode(user.userId);
    return { payload: JSON.stringify({ userId: user.userId, code }), validUntil };
  }

  // Réglages de pointage résolus de l'appelant (onglet Pointage, GPS).
  @Get('me/clock-in-settings')
  getMyClockInSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getClockInSettings(user.companyId, user.userId);
  }

  // Le PIN tablette de l'appelant (affiché dans son profil checkin-mobile).
  // Déclaré avant ':id/pin' pour que 'me' ne soit pas pris pour un id.
  @Get('me/pin')
  getMyPin(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getPin(user.companyId, user.userId);
  }

  @Get(':id/pin')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async getPin(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.siteScope.ensureUser(user, id);
    return this.usersService.getPin(user.companyId, id);
  }

  @Post(':id/pin/regenerate')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async regeneratePin(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.siteScope.ensureUser(user, id);
    return this.usersService.regeneratePin(user.companyId, id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.findOne(user.companyId, id);
  }

  @Post('invite')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async invite(@CurrentUser() user: AuthenticatedUser, @Body() dto: InviteUserDto) {
    // Manager limité : uniquement des employés, rattachés à un de ses magasins.
    if (await this.siteScope.managedSiteIds(user)) {
      if (dto.role && dto.role !== 'employee') {
        throw new ForbiddenException('Vous ne pouvez inviter que des employés');
      }
      if (!dto.siteId) {
        throw new ForbiddenException('Choisissez un de vos magasins pour cet employé');
      }
      await this.siteScope.ensureSite(user, dto.siteId);
    }
    return this.usersService.invite(user.companyId, dto, user.role);
  }

  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    // Promouvoir quelqu'un en manager lui donnerait tous les magasins : un
    // manager limité ne touche pas aux rôles.
    await this.siteScope.ensureAllSites(user);
    return this.usersService.updateRole(user.companyId, id, dto, user.role);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    await this.siteScope.ensureUser(user, id);
    return this.usersService.updateStatus(user.companyId, id, dto, user.role);
  }

  @Post(':id/badge/regenerate')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async regenerateBadge(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.siteScope.ensureUser(user, id);
    return this.usersService.regenerateBadge(user.companyId, id);
  }

  @Post(':id/pin')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async setPin(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetPinDto,
  ) {
    await this.siteScope.ensureUser(user, id);
    return this.usersService.setPin(user.companyId, id, dto);
  }

  @Patch(':id/settings')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserSettingsDto,
  ) {
    await this.siteScope.ensureUser(user, id);
    if (dto.siteId) await this.siteScope.ensureSite(user, dto.siteId);
    // Un manager peut couper le pointage (QR/GPS) d'un employé, jamais le
    // réactiver : ni surcharge "activé", ni retour au réglage entreprise
    // (qui pourrait annuler une désactivation posée par l'admin) — décision #38.
    if (user.role !== 'admin' && enablesClockIn(dto)) {
      throw new ForbiddenException('Seul un admin peut réactiver le pointage');
    }
    return this.usersService.updateSettings(user.companyId, id, dto);
  }

  // Contrat (conformité du planning) — même périmètre que les autres réglages
  // d'un employé.
  @Patch(':id/contract')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async updateContract(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserContractDto,
  ) {
    await this.siteScope.ensureUser(user, id);
    return this.usersService.updateContract(user.companyId, id, dto);
  }

  // Magasins gérés par un manager (décision #36) — admin uniquement.
  @Patch(':id/managed-sites')
  @UseGuards(RolesGuard)
  @Roles('admin')
  setManagedSites(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SetManagedSitesDto) {
    return this.usersService.setManagedSites(user.companyId, id, dto.siteIds);
  }
}

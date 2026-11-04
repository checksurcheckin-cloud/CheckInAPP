import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/tenant-scope.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { ShiftsService } from './shifts.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { AssignShiftDto } from './dto/assign-shift.dto';
import { ApproveShiftOfferDto } from './dto/approve-shift-offer.dto';
import { ProposeShiftOnMarketDto } from './dto/propose-shift-on-market.dto';
import { FindShiftsQueryDto } from './dto/find-shifts-query.dto';
import { SiteScopeService } from '../site-scope/site-scope.service';

@ApiTags('shifts')
@Controller()
@UseGuards(JwtAuthGuard, TenantScopeGuard)
export class ShiftsController {
  // Chaque route manager vérifie d'abord le périmètre magasins (décision #36).
  constructor(
    private readonly shiftsService: ShiftsService,
    private readonly siteScope: SiteScopeService,
  ) {}

  @Get('shifts')
  async findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindShiftsQueryDto) {
    if (user.role === 'employee' || query.mine === 'true') {
      return this.shiftsService.findAll(user, query);
    }
    if (query.siteId) await this.siteScope.ensureSite(user, query.siteId);
    return this.shiftsService.findAll(user, query, await this.siteScope.managedSiteIds(user));
  }

  @Get('shifts/:id')
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (user.role !== 'employee') await this.siteScope.ensureShift(user, id);
    return this.shiftsService.findOne(user.companyId, id);
  }

  // Marché de shifts : offres d'échange ouvertes de toute l'entreprise
  // (l'appelant excepté). Accessible à tout utilisateur authentifié — un
  // employé doit pouvoir reprendre le shift d'un collègue.
  @Get('shift-offers')
  listOpenOffers(@CurrentUser() user: AuthenticatedUser) {
    return this.shiftsService.listOpenOffers(user.companyId, user.userId);
  }

  // Page "Échanges à valider" (web-manager) : toutes les offres encore
  // ouvertes, candidatures comprises (même vides) — voir
  // ShiftsService.listPendingOffersForManager.
  @Get('shift-offers/pending')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async listPendingOffers(@CurrentUser() user: AuthenticatedUser) {
    return this.shiftsService.listPendingOffersForManager(user.companyId, await this.siteScope.managedSiteIds(user));
  }

  // Écriture réservée en pratique au client web-manager (choix produit, pas
  // une restriction API — un manager reste autorisé quel que soit le client).
  @Post('shifts')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateShiftDto) {
    await this.siteScope.ensureSite(user, dto.siteId);
    return this.shiftsService.create(user.companyId, user.userId, dto);
  }

  @Patch('shifts/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateShiftDto) {
    await this.siteScope.ensureShift(user, id);
    if (dto.siteId) await this.siteScope.ensureSite(user, dto.siteId);
    return this.shiftsService.update(user.companyId, id, dto);
  }

  @Delete('shifts/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.siteScope.ensureShift(user, id);
    return this.shiftsService.remove(user.companyId, id);
  }

  @Post('shifts/:id/assign')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async assign(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AssignShiftDto) {
    await this.siteScope.ensureShift(user, id);
    return this.shiftsService.assign(user.companyId, id, dto);
  }

  // Un employé candidate sur un créneau libre publié de son magasin (entrée
  // 'open_shift' du marché) — voir ShiftsService.applyToOpenShift.
  @Post('shifts/:id/apply')
  applyToOpenShift(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.shiftsService.applyToOpenShift(user.companyId, user, id);
  }

  // Le manager choisit un candidat (dto.userId) parmi ceux du créneau libre.
  @Post('shifts/:id/applications/approve')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async approveOpenShift(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ApproveShiftOfferDto) {
    await this.siteScope.ensureShift(user, id);
    return this.shiftsService.approveOpenShift(user.companyId, id, dto);
  }

  // Choisit le public d'un créneau libre sur le marché (tous les sites,
  // certains sites, certains employés) — publie le shift s'il était brouillon.
  @Post('shifts/:id/market')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async proposeOnMarket(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ProposeShiftOnMarketDto) {
    await this.siteScope.ensureShift(user, id);
    return this.shiftsService.proposeOnMarket(user.companyId, id, dto);
  }

  // Refuse toutes les candidatures ; le créneau reste libre sur le marché.
  @Post('shifts/:id/applications/reject')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  async rejectOpenShiftApplications(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.siteScope.ensureShift(user, id);
    return this.shiftsService.rejectOpenShiftApplications(user.companyId, id);
  }

  // L'employé assigné propose son propre shift.
  @Post('shift-assignments/:id/offer')
  offerAssignment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.shiftsService.offerAssignment(user.companyId, user, id);
  }

  // Un collègue accepte une offre ouverte.
  @Post('shift-offers/:id/accept')
  acceptOffer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.shiftsService.acceptOffer(user.companyId, user, id);
  }

  // Plusieurs collègues peuvent candidater sur la même offre — le manager
  // choisit lequel approuver (dto.userId), voir ShiftsService.approveOffer.
  @Post('shift-offers/:id/approve')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async approveOffer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ApproveShiftOfferDto) {
    await this.siteScope.ensureOffer(user, id);
    return this.shiftsService.approveOffer(user.companyId, id, dto);
  }

  @Post('shift-offers/:id/reject')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async rejectOffer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.siteScope.ensureOffer(user, id);
    return this.shiftsService.rejectOffer(user.companyId, id);
  }
}

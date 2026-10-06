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
import { FindShiftsQueryDto } from './dto/find-shifts-query.dto';

@ApiTags('shifts')
@Controller()
@UseGuards(JwtAuthGuard, TenantScopeGuard)
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get('shifts')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindShiftsQueryDto) {
    return this.shiftsService.findAll(user, query);
  }

  @Get('shifts/:id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
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
  listPendingOffers(@CurrentUser() user: AuthenticatedUser) {
    return this.shiftsService.listPendingOffersForManager(user.companyId);
  }

  // Écriture réservée en pratique au client web-manager (choix produit, pas
  // une restriction API — un manager reste autorisé quel que soit le client).
  @Post('shifts')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateShiftDto) {
    return this.shiftsService.create(user.companyId, user.userId, dto);
  }

  @Patch('shifts/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateShiftDto) {
    return this.shiftsService.update(user.companyId, id, dto);
  }

  @Delete('shifts/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.shiftsService.remove(user.companyId, id);
  }

  @Post('shifts/:id/assign')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  assign(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AssignShiftDto) {
    return this.shiftsService.assign(user.companyId, id, dto);
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
  approveOffer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ApproveShiftOfferDto) {
    return this.shiftsService.approveOffer(user.companyId, id, dto);
  }

  @Post('shift-offers/:id/reject')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  rejectOffer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.shiftsService.rejectOffer(user.companyId, id);
  }
}

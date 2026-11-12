import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/tenant-scope.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { ComplianceService } from './compliance.service';
import { CheckComplianceQueryDto } from './dto/check-compliance-query.dto';
import { AcknowledgeComplianceDto } from './dto/acknowledge-compliance.dto';

// Conformité du planning au droit du travail belge (avertissements, jamais
// bloquants) — web-manager uniquement.
@ApiTags('compliance')
@Controller('compliance')
@UseGuards(JwtAuthGuard, TenantScopeGuard, RolesGuard)
@Roles('admin', 'manager')
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  // Lecture, comme le planning : un manager limité peut consulter les autres
  // magasins (décision #36).
  @Get()
  check(@CurrentUser() user: AuthenticatedUser, @Query() query: CheckComplianceQueryDto) {
    return this.complianceService.check(user.companyId, query);
  }

  @Get('joint-committees')
  listJointCommittees() {
    return this.complianceService.listRulePacks();
  }

  @Post('acknowledge')
  @HttpCode(HttpStatus.NO_CONTENT)
  acknowledge(@CurrentUser() user: AuthenticatedUser, @Body() dto: AcknowledgeComplianceDto) {
    return this.complianceService.acknowledge(user.companyId, user.userId, dto);
  }
}

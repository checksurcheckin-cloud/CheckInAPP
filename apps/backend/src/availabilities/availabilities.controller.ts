import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/tenant-scope.guard';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { AvailabilitiesService } from './availabilities.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { FindAvailabilitiesQueryDto } from './dto/find-availabilities-query.dto';

@ApiTags('availabilities')
@Controller('availabilities')
@UseGuards(JwtAuthGuard, TenantScopeGuard)
export class AvailabilitiesController {
  constructor(private readonly availabilitiesService: AvailabilitiesService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAvailabilityDto) {
    return this.availabilitiesService.create(user.companyId, user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindAvailabilitiesQueryDto) {
    return this.availabilitiesService.findAll(user.companyId, user.userId, user.role, query.userId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.availabilitiesService.update(user.companyId, user.userId, user.role, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.availabilitiesService.remove(user.companyId, user.userId, user.role, id);
  }
}

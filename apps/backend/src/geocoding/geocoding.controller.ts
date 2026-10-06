import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/tenant-scope.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { GeocodingService } from './geocoding.service';
import { GeocodeSearchDto } from './dto/geocode-search.dto';
import { GeocodeReverseDto } from './dto/geocode-reverse.dto';

// Réservé aux managers/admins : seuls usages actuels sont la fiche site
// (adresse -> coordonnées) et l'écran Présence (coordonnées -> adresse),
// deux écrans déjà restreints à ces rôles.
@ApiTags('geocoding')
@Controller('geocoding')
@UseGuards(JwtAuthGuard, TenantScopeGuard, RolesGuard)
@Roles('admin', 'manager')
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  @Get('search')
  search(@Query() dto: GeocodeSearchDto) {
    return this.geocodingService.search(dto.query);
  }

  @Get('reverse')
  async reverse(@Query() dto: GeocodeReverseDto) {
    const label = await this.geocodingService.reverse(dto.lat, dto.lng);
    return { label };
  }
}

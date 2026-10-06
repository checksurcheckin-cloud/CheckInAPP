import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

// `gpsClockInEnabled: null` (envoyé explicitement) remet l'employé sur le
// réglage entreprise par défaut plutôt que de garder une surcharge figée.
// `siteId: null` désassigne l'employé de tout site (redevient visible sur
// tous les sites du planning, voir UsersService.findAll).
export class UpdateUserSettingsDto {
  @IsOptional()
  @IsBoolean()
  gpsClockInEnabled?: boolean | null;

  @IsOptional()
  @IsUUID()
  siteId?: string | null;
}

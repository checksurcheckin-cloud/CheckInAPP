import { IsBoolean, IsOptional } from 'class-validator';

// Chaque réglage est optionnel : la page Réglages n'envoie que celui qu'on
// vient de basculer.
export class UpdateCompanySettingsDto {
  @IsOptional()
  @IsBoolean()
  gpsClockInEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  mobileClockInEnabled?: boolean;
}

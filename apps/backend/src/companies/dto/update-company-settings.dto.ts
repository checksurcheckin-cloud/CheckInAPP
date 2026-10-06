import { IsBoolean } from 'class-validator';

export class UpdateCompanySettingsDto {
  @IsBoolean()
  gpsClockInEnabled: boolean;
}

import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { JOINT_COMMITTEE_CODES } from '../../compliance/rule-packs';

// Chaque réglage est optionnel : la page Réglages n'envoie que celui qu'on
// vient de basculer.
export class UpdateCompanySettingsDto {
  @IsOptional()
  @IsBoolean()
  gpsClockInEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  mobileClockInEnabled?: boolean;

  // Création des horaires : libre, ou selon les besoins de l'admin (décision #40).
  @IsOptional()
  @IsIn(['free', 'needs'])
  planningMode?: 'free' | 'needs';

  // Commission paritaire (src/compliance/rule-packs.ts) — null = aucune.
  @IsOptional()
  @IsIn(JOINT_COMMITTEE_CODES)
  jointCommittee?: string | null;
}

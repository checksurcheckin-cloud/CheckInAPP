import { TimeEntryType } from '@prisma/client';
import { IsEnum, IsIn, IsLatitude, IsLongitude, IsUUID, ValidateIf } from 'class-validator';

// Émis par checkin-mobile — l'employé pointe pour lui-même, authentifié par
// son propre JWT utilisateur. 'gps' = auto-pointage géolocalisé.
// 'qr_scan_own_phone' + deviceId = ancien modèle (le téléphone scannait le QR
// du terminal) abandonné au profit du QR rotatif scanné par la tablette —
// voir POST /time-entries/scan-rotating-qr. Chemin laissé en place côté
// backend mais plus utilisé par checkin-mobile.
export class CreateSelfTimeEntryDto {
  @IsEnum(TimeEntryType)
  type: TimeEntryType;

  @IsIn(['gps', 'qr_scan_own_phone'])
  source: 'gps' | 'qr_scan_own_phone';

  // Optionnel : sans siteId, le backend déduit le site (le plus proche de
  // la position, sinon le site de rattachement de l'employé) — l'app mobile
  // ne demande plus de choisir un site. Encore accepté pour les anciennes
  // versions de l'app.
  @ValidateIf((o) => o.source === 'gps' && o.siteId !== undefined)
  @IsUUID()
  siteId?: string;

  @ValidateIf((o) => o.source === 'gps')
  @IsLatitude()
  geoLat?: number;

  @ValidateIf((o) => o.source === 'gps')
  @IsLongitude()
  geoLng?: number;

  @ValidateIf((o) => o.source === 'qr_scan_own_phone')
  @IsUUID()
  deviceId?: string;
}

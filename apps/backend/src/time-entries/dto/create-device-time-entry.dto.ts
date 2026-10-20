import { IsIn, IsString, IsUUID, Matches, ValidateIf } from 'class-validator';

// Émis par checkin-pos (device authentifié) — l'employé s'identifie sur le
// terminal lui-même : par son badge seul, ou comme un login classique en
// choisissant son nom dans la liste du kiosk (userId) puis en tapant son PIN.
// Pas de `type` : le serveur bascule automatiquement clock_in/clock_out
// selon le dernier pointage (le device ne peut pas consulter la présence).
export class CreateDeviceTimeEntryDto {
  @IsIn(['badge_scan', 'pin_code'])
  source: 'badge_scan' | 'pin_code';

  @ValidateIf((o) => o.source === 'badge_scan')
  @IsString()
  badgeCode?: string;

  @ValidateIf((o) => o.source === 'pin_code')
  @IsUUID()
  userId?: string;

  @ValidateIf((o) => o.source === 'pin_code')
  @Matches(/^\d{4}$/, { message: 'Le PIN doit contenir exactement 4 chiffres' })
  pin?: string;
}

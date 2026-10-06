import { IsIn, IsString, ValidateIf } from 'class-validator';

// Émis par checkin-pos (device authentifié) — l'employé s'identifie sur le
// terminal lui-même : le badge OU le PIN suffisent seuls à l'identifier
// (pas de sélection préalable dans un annuaire, le kiosk n'a qu'un clavier).
// Pas de `type` : le serveur bascule automatiquement clock_in/clock_out
// selon le dernier pointage (le device ne peut pas consulter la présence).
export class CreateDeviceTimeEntryDto {
  @IsIn(['badge_scan', 'pin_code'])
  source: 'badge_scan' | 'pin_code';

  @ValidateIf((o) => o.source === 'badge_scan')
  @IsString()
  badgeCode?: string;

  @ValidateIf((o) => o.source === 'pin_code')
  @IsString()
  pin?: string;
}

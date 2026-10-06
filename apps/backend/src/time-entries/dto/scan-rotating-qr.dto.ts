import { IsString } from 'class-validator';

// Émis par checkin-pos (device authentifié) après avoir scanné le QR rotatif
// affiché par le téléphone de l'employé. `payload` est la chaîne brute lue
// par la caméra — encode { userId, code } (TOTP), décodée et vérifiée côté
// serveur. Pas de siteId/type : comme pour badge_scan/pin_code, le site vient
// du device authentifié et le type (clock_in/clock_out) est déduit du
// dernier pointage de l'employé sur ce site.
export class ScanRotatingQrDto {
  @IsString()
  payload: string;
}

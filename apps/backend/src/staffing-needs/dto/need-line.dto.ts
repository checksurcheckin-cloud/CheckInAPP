import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Une ligne de besoin : « count personnes de startTime à endTime, rôle X »,
// en heure locale du site. Fin avant le début = shift de nuit (lendemain).
export class NeedLineDto {
  @Matches(HHMM, { message: 'startTime doit être au format HH:mm' })
  startTime: string;

  @Matches(HHMM, { message: 'endTime doit être au format HH:mm' })
  endTime: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  roleNeeded?: string | null;

  @IsInt()
  @Min(1)
  @Max(50)
  count: number;
}

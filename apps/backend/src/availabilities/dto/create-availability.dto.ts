import { IsBoolean, IsDateString, IsInt, IsOptional, Matches, Max, Min, ValidateIf } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Récurrente (dayOfWeek) OU ponctuelle (specificDate) — au moins l'une des deux.
export class CreateAvailabilityDto {
  @ValidateIf((o) => o.specificDate === undefined)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ValidateIf((o) => o.dayOfWeek === undefined)
  @IsDateString()
  specificDate?: string;

  @Matches(TIME_PATTERN, { message: 'startTime doit être au format HH:mm' })
  startTime: string;

  @Matches(TIME_PATTERN, { message: 'endTime doit être au format HH:mm' })
  endTime: string;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

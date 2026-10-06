import { IsBoolean, IsDateString, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// PATCH : tous les champs optionnels, seuls ceux fournis sont modifiés.
export class UpdateAvailabilityDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @IsDateString()
  specificDate?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'startTime doit être au format HH:mm' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'endTime doit être au format HH:mm' })
  endTime?: string;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

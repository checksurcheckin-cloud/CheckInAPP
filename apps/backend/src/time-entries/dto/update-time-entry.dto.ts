import { TimeEntryType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateTimeEntryDto {
  @IsOptional()
  @IsEnum(TimeEntryType)
  type?: TimeEntryType;

  @IsOptional()
  @IsDateString()
  timestamp?: string;

  @IsString()
  @MinLength(3)
  editReason: string;
}

import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class FindShiftsQueryDto {
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

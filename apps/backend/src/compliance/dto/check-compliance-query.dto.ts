import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CheckComplianceQueryDto {
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}

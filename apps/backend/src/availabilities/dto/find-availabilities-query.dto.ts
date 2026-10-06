import { IsOptional, IsUUID } from 'class-validator';

export class FindAvailabilitiesQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;
}

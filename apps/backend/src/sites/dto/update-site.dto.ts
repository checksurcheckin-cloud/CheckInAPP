import { IsIn, IsLatitude, IsLongitude, IsOptional, IsString, MinLength } from 'class-validator';
import { JOINT_COMMITTEE_CODES } from '../../compliance/rule-packs';

export class UpdateSiteDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsLatitude()
  geoLat?: number;

  @IsOptional()
  @IsLongitude()
  geoLng?: number;

  @IsOptional()
  @IsString()
  timezone?: string;

  // Commission paritaire (src/compliance/rule-packs.ts) — null = aucune.
  @IsOptional()
  @IsIn(JOINT_COMMITTEE_CODES)
  jointCommittee?: string | null;
}

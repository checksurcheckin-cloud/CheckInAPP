import { IsLatitude, IsLongitude, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSiteDto {
  @IsString()
  @MinLength(2)
  name: string;

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
}

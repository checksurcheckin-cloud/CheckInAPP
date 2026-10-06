import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateSiteDeviceDto {
  @IsUUID()
  siteId: string;

  @IsString()
  @MinLength(2)
  deviceLabel: string;
}

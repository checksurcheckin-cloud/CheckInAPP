import { IsUUID } from 'class-validator';

export class FindSiteDevicesQueryDto {
  @IsUUID()
  siteId: string;
}

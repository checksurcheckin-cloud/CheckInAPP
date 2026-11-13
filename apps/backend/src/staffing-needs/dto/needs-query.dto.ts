import { IsUUID, Matches } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class SiteNeedsQueryDto {
  @IsUUID()
  siteId: string;
}

export class ResolvedNeedsQueryDto {
  @IsUUID()
  siteId: string;

  @Matches(DATE, { message: 'from doit être au format YYYY-MM-DD' })
  from: string;

  @Matches(DATE, { message: 'to doit être au format YYYY-MM-DD' })
  to: string;
}

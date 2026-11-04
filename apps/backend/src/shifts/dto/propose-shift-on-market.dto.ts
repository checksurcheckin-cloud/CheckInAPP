import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';

export const MARKET_SCOPES = ['site', 'all_sites', 'sites', 'employees'] as const;
export type MarketScopeValue = (typeof MARKET_SCOPES)[number];

// Public d'un créneau libre sur le marché (décision #33). siteIds/userIds ne
// sont lus que pour leur portée respective, et revalidés dans l'entreprise
// côté service (règle #1).
export class ProposeShiftOnMarketDto {
  @IsIn(MARKET_SCOPES)
  scope: MarketScopeValue;

  @ValidateIf((dto: ProposeShiftOnMarketDto) => dto.scope === 'sites')
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  siteIds?: string[];

  @ValidateIf((dto: ProposeShiftOnMarketDto) => dto.scope === 'employees')
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  userIds?: string[];
}

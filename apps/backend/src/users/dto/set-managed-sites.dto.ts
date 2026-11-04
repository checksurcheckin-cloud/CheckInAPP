import { IsArray, IsUUID } from 'class-validator';

// Magasins gérés par un manager (décision #36) — tableau vide = tous les
// magasins de l'entreprise.
export class SetManagedSitesDto {
  @IsArray()
  @IsUUID('all', { each: true })
  siteIds: string[];
}

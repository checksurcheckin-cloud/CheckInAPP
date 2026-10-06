import { IsUUID } from 'class-validator';

// Plusieurs collègues peuvent candidater sur une même offre ouverte — le
// manager choisit lequel approuver, d'où le besoin de préciser l'id.
export class ApproveShiftOfferDto {
  @IsUUID()
  userId: string;
}

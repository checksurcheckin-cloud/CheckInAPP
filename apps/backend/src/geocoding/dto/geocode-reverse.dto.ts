import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';

// Query params arrivent en string — @Type les convertit en number avant
// que class-validator ne les valide.
export class GeocodeReverseDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lng: number;
}

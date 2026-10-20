import { Matches } from 'class-validator';

export class SetPinDto {
  // Code PIN utilisé sur le terminal checkin-pos — exactement 4 chiffres.
  @Matches(/^\d{4}$/, { message: 'Le PIN doit contenir exactement 4 chiffres' })
  pin: string;
}

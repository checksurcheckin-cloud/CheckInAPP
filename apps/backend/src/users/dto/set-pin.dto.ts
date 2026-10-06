import { Matches } from 'class-validator';

export class SetPinDto {
  // Code PIN utilisé sur le terminal checkin-pos — 4 à 6 chiffres.
  @Matches(/^\d{4,6}$/, { message: 'Le PIN doit contenir entre 4 et 6 chiffres' })
  pin: string;
}

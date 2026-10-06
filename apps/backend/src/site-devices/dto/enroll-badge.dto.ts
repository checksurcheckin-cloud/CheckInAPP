import { IsString } from 'class-validator';

export class EnrollBadgeDto {
  @IsString()
  pin: string;

  @IsString()
  badgeCode: string;
}

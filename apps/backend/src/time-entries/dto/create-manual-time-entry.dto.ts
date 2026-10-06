import { TimeEntryType } from '@prisma/client';
import { IsEnum, IsString, IsUUID, MinLength } from 'class-validator';

// Un manager pointe à la place d'un employé (téléphone cassé, badge perdu...).
export class CreateManualTimeEntryDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  siteId: string;

  @IsEnum(TimeEntryType)
  type: TimeEntryType;

  @IsString()
  @MinLength(3)
  creationReason: string;
}

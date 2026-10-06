import { IsUUID } from 'class-validator';

export class AssignShiftDto {
  @IsUUID()
  userId: string;
}

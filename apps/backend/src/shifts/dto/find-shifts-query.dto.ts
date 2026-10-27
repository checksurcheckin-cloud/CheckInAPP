import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

export class FindShiftsQueryDto {
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  // 'true' : uniquement les shifts publiés assignés à l'appelant, quel que
  // soit son rôle — l'app mobile est la même pour un manager que pour un
  // employé (décision #31), son planning ne montre que ses propres shifts.
  @IsOptional()
  @IsIn(['true', 'false'])
  mine?: 'true' | 'false';
}

import { IsDateString, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

// Données de contrat utilisées par les contrôles de conformité du planning
// (src/compliance). `null` efface la valeur ; un champ absent n'est pas touché.
export class UpdateUserContractDto {
  @IsOptional()
  @IsIn(['full_time', 'part_time', 'student', 'flexi_job'])
  contractType?: 'full_time' | 'part_time' | 'student' | 'flexi_job' | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  weeklyContractHours?: number | null;

  // "YYYY-MM-DD"
  @IsOptional()
  @IsDateString({ strict: true })
  birthDate?: string | null;
}

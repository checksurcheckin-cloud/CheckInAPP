import { ArrayMaxSize, IsArray, IsIn, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AcknowledgedViolationDto {
  @IsString()
  @MaxLength(64)
  ruleId: string;

  @IsIn(['error', 'warning', 'info'])
  severity: 'error' | 'warning' | 'info';

  @IsUUID()
  userId: string;

  @IsArray()
  @IsUUID('all', { each: true })
  shiftIds: string[];

  @IsString()
  @MaxLength(500)
  message: string;
}

// Le manager publie malgré des alertes de conformité : trace dans l'AuditLog.
export class AcknowledgeComplianceDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  shiftIds: string[];

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AcknowledgedViolationDto)
  violations: AcknowledgedViolationDto[];
}

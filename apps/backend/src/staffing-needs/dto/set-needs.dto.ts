import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { NeedLineDto } from './need-line.dto';

// Remplace toute la liste d'un jour de la semaine type (lundi = 0).
export class SetWeeklyNeedsDto {
  @IsUUID()
  siteId: string;

  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => NeedLineDto)
  needs: NeedLineDto[];
}

// Remplace la liste d'une date précise ; vide = jour fermé.
export class SetDateNeedsDto {
  @IsUUID()
  siteId: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => NeedLineDto)
  needs: NeedLineDto[];
}

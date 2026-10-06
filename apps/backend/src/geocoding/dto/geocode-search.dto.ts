import { IsString, MinLength } from 'class-validator';

export class GeocodeSearchDto {
  @IsString()
  @MinLength(3)
  query: string;
}

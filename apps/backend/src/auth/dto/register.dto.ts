import { IsEmail, IsString, MinLength } from 'class-validator';

// Crée une nouvelle entreprise (company) + son premier utilisateur (role: admin)
export class RegisterDto {
  @IsString()
  @MinLength(2)
  companyName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;
}

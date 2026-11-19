import { IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';
import { SubscriptionStatus } from '@prisma/client';

export const SUBSCRIPTION_PLANS = ['trial', 'starter', 'pro', 'enterprise'] as const;

export class PlatformLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(200)
  password: string;
}

// Champs absents = inchangés ; `null` explicite = vidé (seats, dates, notes).
export class UpdateSubscriptionDto {
  @IsOptional()
  @IsIn(SUBSCRIPTION_PLANS)
  plan?: string;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(0)
  seats?: number | null;

  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsDateString()
  trialEndsAt?: string | null;

  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsDateString()
  currentPeriodEnd?: string | null;

  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

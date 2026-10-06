import { IsString, IsUUID } from 'class-validator';

export class AuthenticateDeviceDto {
  @IsUUID()
  deviceId: string;

  @IsString()
  qrSecret: string;
}

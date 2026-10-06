import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { SiteDevicesController } from './site-devices.controller';
import { SiteDevicesService } from './site-devices.service';
import { DeviceJwtStrategy } from './device-jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_DEVICE_SECRET,
      signOptions: { expiresIn: process.env.JWT_DEVICE_EXPIRES_IN ?? '12h' },
    }),
    UsersModule,
  ],
  controllers: [SiteDevicesController],
  providers: [SiteDevicesService, DeviceJwtStrategy],
  exports: [DeviceJwtStrategy],
})
export class SiteDevicesModule {}

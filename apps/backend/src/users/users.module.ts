import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RotatingQrService } from './rotating-qr.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, RotatingQrService],
  exports: [UsersService, RotatingQrService],
})
export class UsersModule {}

import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ExpoPushService } from './expo-push.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, ExpoPushService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

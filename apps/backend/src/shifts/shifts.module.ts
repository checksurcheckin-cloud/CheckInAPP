import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { StaffingNeedsModule } from '../staffing-needs/staffing-needs.module';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

@Module({
  imports: [NotificationsModule, StaffingNeedsModule],
  controllers: [ShiftsController],
  providers: [ShiftsService],
})
export class ShiftsModule {}

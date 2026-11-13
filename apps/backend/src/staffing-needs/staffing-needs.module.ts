import { Module } from '@nestjs/common';
import { StaffingNeedsController } from './staffing-needs.controller';
import { StaffingNeedsService } from './staffing-needs.service';

@Module({
  controllers: [StaffingNeedsController],
  providers: [StaffingNeedsService],
  exports: [StaffingNeedsService],
})
export class StaffingNeedsModule {}

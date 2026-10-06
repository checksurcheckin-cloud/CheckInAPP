import { Module } from '@nestjs/common';
import { TimeEntriesModule } from '../time-entries/time-entries.module';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';

@Module({
  imports: [TimeEntriesModule],
  controllers: [SitesController],
  providers: [SitesService],
})
export class SitesModule {}

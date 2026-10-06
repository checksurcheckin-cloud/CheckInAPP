import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { SitesModule } from './sites/sites.module';
import { UsersModule } from './users/users.module';
import { SiteDevicesModule } from './site-devices/site-devices.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { ShiftsModule } from './shifts/shifts.module';
import { AvailabilitiesModule } from './availabilities/availabilities.module';
import { GeocodingModule } from './geocoding/geocoding.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    PrismaModule,
    RealtimeModule,
    AuthModule,
    CompaniesModule,
    SitesModule,
    UsersModule,
    SiteDevicesModule,
    TimeEntriesModule,
    ShiftsModule,
    AvailabilitiesModule,
    GeocodingModule,
  ],
})
export class AppModule {}

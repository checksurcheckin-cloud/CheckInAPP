import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';

// @Global() : n'importe quel service (ShiftsService, TimeEntriesService,
// AvailabilitiesService...) peut injecter RealtimeGateway directement sans
// que ce module ait besoin d'être réimporté partout — un seul canal
// websocket pour toute l'app, pas un par module métier.
@Global()
@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_ACCESS_SECRET })],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}

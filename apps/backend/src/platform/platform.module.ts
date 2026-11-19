import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PlatformController } from './platform.controller';
import { PlatformAuthGuard } from './platform-auth.guard';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformService } from './platform.service';

// JwtModule sans secret par défaut : chaque signature/vérification passe
// explicitement JWT_PLATFORM_SECRET (platformSecret()), jamais celui des
// entreprises.
@Module({
  imports: [JwtModule.register({})],
  controllers: [PlatformController],
  providers: [PlatformAuthService, PlatformService, PlatformAuthGuard],
})
export class PlatformModule {}

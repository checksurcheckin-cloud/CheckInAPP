import { Global, Module } from '@nestjs/common';
import { SiteScopeService } from './site-scope.service';

// @Global() : chaque contrôleur métier vérifie le périmètre magasins d'un
// manager (décision #36) sans réimporter ce module.
@Global()
@Module({
  providers: [SiteScopeService],
  exports: [SiteScopeService],
})
export class SiteScopeModule {}

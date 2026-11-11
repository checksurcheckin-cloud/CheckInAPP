import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/tenant-scope.guard';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { ExpoPushService } from './expo-push.service';
import { RegisterPushTokenDto, UnregisterPushTokenDto } from './dto/push-token.dto';

// Toujours les notifications de l'appelant : aucune route ne prend d'userId,
// on ne peut ni lire ni marquer celles de quelqu'un d'autre.
@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard, TenantScopeGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly push: ExpoPushService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.list(user.companyId, user.userId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllRead(user.companyId, user.userId);
  }

  // Le téléphone s'enregistre à chaque ouverture de session (checkin-mobile).
  @Post('push-tokens')
  @HttpCode(HttpStatus.NO_CONTENT)
  registerPushToken(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterPushTokenDto) {
    return this.push.register(user.userId, dto.token, dto.platform);
  }

  // À la déconnexion : ce téléphone ne reçoit plus les push de ce compte.
  // POST plutôt que DELETE : le token contient des crochets, mal venus dans
  // une URL.
  @Post('push-tokens/unregister')
  @HttpCode(HttpStatus.NO_CONTENT)
  unregisterPushToken(@CurrentUser() user: AuthenticatedUser, @Body() dto: UnregisterPushTokenDto) {
    return this.push.unregister(user.userId, dto.token);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationsService.markRead(user.companyId, user.userId, id);
  }
}

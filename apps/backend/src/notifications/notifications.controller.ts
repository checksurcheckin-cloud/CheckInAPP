import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/tenant-scope.guard';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { NotificationsService } from './notifications.service';

// Toujours les notifications de l'appelant : aucune route ne prend d'userId,
// on ne peut ni lire ni marquer celles de quelqu'un d'autre.
@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard, TenantScopeGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.list(user.companyId, user.userId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllRead(user.companyId, user.userId);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationsService.markRead(user.companyId, user.userId, id);
  }
}

import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Vérifie un token device (émis par SiteDevicesService.authenticate) et
// attache req.user = { deviceId, siteId, companyId }. À utiliser sur les
// endpoints appelés par checkin-pos, à la place de JwtAuthGuard.
@Injectable()
export class DeviceAuthGuard extends AuthGuard('device-jwt') {}

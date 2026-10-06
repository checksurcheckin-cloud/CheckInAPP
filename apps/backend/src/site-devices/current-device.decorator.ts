import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedDevice {
  deviceId: string;
  siteId: string;
  companyId: string;
}

// Raccourci pour récupérer req.user (rempli par DeviceJwtStrategy.validate) —
// même mécanique que @CurrentUser mais côté device.
export const CurrentDevice = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedDevice => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);

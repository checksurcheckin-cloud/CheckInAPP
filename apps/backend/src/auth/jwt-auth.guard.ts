import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Vérifie que le token JWT est valide et attache req.user (userId, companyId, role)
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

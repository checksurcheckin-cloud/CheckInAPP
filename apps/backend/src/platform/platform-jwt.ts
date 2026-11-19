import { ServiceUnavailableException } from '@nestjs/common';
import type { PlatformRole } from '@prisma/client';

// Token de la console plateforme : secret ET audience propres, pour qu'il
// soit impossible de le confondre avec un token d'entreprise (JwtStrategy,
// JWT_ACCESS_SECRET) ou de tablette (JWT_DEVICE_SECRET) — dans les deux sens.
export const PLATFORM_AUDIENCE = 'checkinapp-platform';

export interface PlatformJwtPayload {
  sub: string; // PlatformAdmin.id
  typ: 'platform';
}

// Ce que les contrôleurs reçoivent (req.platformAdmin), relu en base à
// chaque requête : un admin désactivé ou rétrogradé perd l'accès tout de suite.
export interface AuthenticatedPlatformAdmin {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
}

// Refuse de signer ou de vérifier quoi que ce soit si le secret manque, ou
// s'il est identique à un secret d'entreprise/tablette (sinon un token
// d'entreprise pourrait être vérifié avec la même clé).
export function platformSecret(): string {
  const secret = process.env.JWT_PLATFORM_SECRET;
  if (!secret || secret === process.env.JWT_ACCESS_SECRET || secret === process.env.JWT_DEVICE_SECRET) {
    throw new ServiceUnavailableException('Console plateforme non configurée (JWT_PLATFORM_SECRET)');
  }
  return secret;
}

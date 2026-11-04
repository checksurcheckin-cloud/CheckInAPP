import type { Site, SiteScope } from '@horaires/shared-types';
import { apiClient } from '../services/AuthService';

// Magasins que l'utilisateur connecté gère (décision #36) : tous pour un
// admin ou un manager sans restriction, sinon seulement les siens. Les
// listes déroulantes n'affichent que ceux-là — le backend refuse de toute
// façon toute action hors périmètre (403).
export async function loadManagedSites(): Promise<{ sites: Site[]; scope: SiteScope }> {
  const [all, scope] = await Promise.all([apiClient.getSites(), apiClient.getMyScope()]);
  return { sites: scope.allSites ? all : all.filter((s) => scope.siteIds.includes(s.id)), scope };
}

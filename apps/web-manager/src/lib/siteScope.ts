import type { Site, SiteScope } from '@horaires/shared-types';
import { apiClient } from '../services/AuthService';

// Magasins de l'utilisateur connecté (décision #36) : `sites` = tous les
// magasins de l'entreprise, `managedSites` = ceux qu'il peut modifier (tous
// pour un admin ou un manager sans restriction). Un manager limité consulte
// les autres en lecture seule ; le backend refuse toute modification hors
// périmètre (403).
export async function loadManagedSites(): Promise<{ sites: Site[]; managedSites: Site[]; scope: SiteScope }> {
  const [all, scope] = await Promise.all([apiClient.getSites(), apiClient.getMyScope()]);
  return {
    sites: all,
    managedSites: scope.allSites ? all : all.filter((s) => scope.siteIds.includes(s.id)),
    scope,
  };
}

export function canManageSite(scope: SiteScope | null, siteId: string | null | undefined): boolean {
  if (!scope || scope.allSites) return true;
  return Boolean(siteId && scope.siteIds.includes(siteId));
}

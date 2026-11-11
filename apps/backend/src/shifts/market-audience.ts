// Public d'un créneau libre (décision #33), en deux versions qui doivent
// rester identiques : filtre Prisma (liste du marché) et test en mémoire
// (candidature, destinataires des notifications). Un employé sans site voit
// les créneaux "son magasin" et "sites précis" de tous les sites, comme
// partout ailleurs (décision #25).
export function marketAudienceWhere(userId: string, siteId: string | null) {
  return {
    OR: [
      { marketScope: 'site' as const, ...(siteId ? { siteId } : {}) },
      { marketScope: 'all_sites' as const },
      { marketScope: 'sites' as const, ...(siteId ? { marketSiteIds: { has: siteId } } : {}) },
      { marketScope: 'employees' as const, marketUserIds: { has: userId } },
    ],
  };
}

export function isInMarketAudience(
  shift: { siteId: string; marketScope: string; marketSiteIds: string[]; marketUserIds: string[] },
  userId: string,
  siteId: string | null,
): boolean {
  switch (shift.marketScope) {
    case 'all_sites':
      return true;
    case 'sites':
      return !siteId || shift.marketSiteIds.includes(siteId);
    case 'employees':
      return shift.marketUserIds.includes(userId);
    default:
      return !siteId || shift.siteId === siteId;
  }
}

import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { Socket } from '@horaires/api-client';
import type { PresentEmployee } from '@horaires/shared-types';
import { apiClient } from '../services/AuthService';
import { loadManagedSites } from './siteScope';

// Clés du cache. Pas d'id d'entreprise dedans : le cache est entièrement
// vidé à la connexion et à la déconnexion (AuthService), donc il ne contient
// jamais que les données du compte connecté.
export const queryKeys = {
  siteScope: ['site-scope'] as const,
  users: ['users'] as const,
  availabilities: ['availabilities'] as const,
  shifts: ['shifts'] as const,
  shiftsRange: (siteId: string, from: string, to: string) => ['shifts', siteId, from, to] as const,
  presence: ['presence'] as const,
  presenceForSite: (siteId: string) => ['presence', siteId] as const,
  pendingOffers: ['pending-offers'] as const,
  company: ['company'] as const,
  compliance: ['compliance'] as const,
  complianceRange: (siteId: string, from: string, to: string) => ['compliance', siteId, from, to] as const,
  jointCommittees: ['joint-committees'] as const,
  staffingNeeds: ['staffing-needs'] as const,
  siteStaffingNeeds: (siteId: string) => ['staffing-needs', 'site', siteId] as const,
  resolvedStaffingNeeds: (siteId: string, from: string, to: string) =>
    ['staffing-needs', 'resolved', siteId, from, to] as const,
};

// Magasins de l'entreprise + périmètre du manager connecté (décision #36).
export function useSiteScope() {
  return useQuery({ queryKey: queryKeys.siteScope, queryFn: loadManagedSites });
}

export function useUsers() {
  return useQuery({ queryKey: queryKeys.users, queryFn: () => apiClient.getUsers() });
}

// Pas de userId : vue manager, toute l'entreprise (voir
// AvailabilitiesService.findAll) — la grille planning marque les jours
// indisponibles de n'importe quel employé.
export function useAvailabilities() {
  return useQuery({ queryKey: queryKeys.availabilities, queryFn: () => apiClient.getAvailabilities() });
}

export function useShifts(siteId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.shiftsRange(siteId ?? '', from, to),
    queryFn: () => apiClient.getShifts({ siteId: siteId!, from, to }),
    enabled: Boolean(siteId),
  });
}

// Vue "en direct" pensée pour rester ouverte : rechargée toutes les 30s en
// filet de sécurité (socket déconnecté), le websocket la rafraîchit plus vite.
export function usePresence(siteId: string | null) {
  return useQuery({
    queryKey: queryKeys.presenceForSite(siteId ?? ''),
    queryFn: async (): Promise<PresentEmployee[]> => {
      const list = await apiClient.getPresence(siteId!);
      // Un backend pas encore redéployé renvoie l'ancien format (présents
      // seulement, sans status/entries) — on complète plutôt que de planter.
      return list.map((e) => ({
        ...e,
        status: e.status ?? 'present',
        breakSince: e.breakSince ?? null,
        entries: e.entries ?? [{ type: 'clock_in', timestamp: e.since, source: e.source }],
      }));
    },
    enabled: Boolean(siteId),
    refetchInterval: 30_000,
  });
}

export function usePendingOffers() {
  return useQuery({ queryKey: queryKeys.pendingOffers, queryFn: () => apiClient.getPendingShiftOffers() });
}

// Contrôle de conformité du planning affiché (droit du travail belge) —
// avertissements uniquement. Rechargé avec les shifts.
export function useCompliance(siteId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.complianceRange(siteId ?? '', from, to),
    queryFn: () => apiClient.getCompliance({ siteId: siteId!, from, to }),
    enabled: Boolean(siteId),
  });
}

// Liste fixe (côté backend, rule-packs.ts) : jamais périmée en cours de session.
export function useJointCommittees() {
  return useQuery({
    queryKey: queryKeys.jointCommittees,
    queryFn: () => apiClient.getJointCommittees(),
    staleTime: Infinity,
  });
}

// Semaine type + exceptions d'un site (page Besoins, admin).
export function useSiteStaffingNeeds(siteId: string | null) {
  return useQuery({
    queryKey: queryKeys.siteStaffingNeeds(siteId ?? ''),
    queryFn: () => apiClient.getStaffingNeeds(siteId!),
    enabled: Boolean(siteId),
  });
}

// Besoins effectifs jour par jour (planning en mode « selon les besoins ») ;
// `from`/`to` au format YYYY-MM-DD.
export function useResolvedStaffingNeeds(siteId: string | null, from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.resolvedStaffingNeeds(siteId ?? '', from, to),
    queryFn: () => apiClient.getResolvedStaffingNeeds({ siteId: siteId!, from, to }),
    enabled: enabled && Boolean(siteId),
  });
}

export function useCompany() {
  return useQuery({ queryKey: queryKeys.company, queryFn: () => apiClient.getMyCompany() });
}

// Signal temps réel du backend (realtime.gateway.ts) -> données du cache à
// recharger. Les candidatures et offres d'échange passent par
// `shifts:changed` ; `users:changed` couvre aussi les magasins gérés, d'où
// le périmètre.
const INVALIDATIONS: Record<string, QueryKey[]> = {
  'shifts:changed': [queryKeys.shifts, queryKeys.pendingOffers, queryKeys.compliance],
  'availabilities:changed': [queryKeys.availabilities],
  'time-entries:changed': [queryKeys.presence],
  'settings:changed': [queryKeys.company, queryKeys.compliance],
  'sites:changed': [queryKeys.siteScope, queryKeys.compliance],
  'staffing-needs:changed': [queryKeys.staffingNeeds],
  'users:changed': [queryKeys.users, queryKeys.siteScope, queryKeys.compliance],
};

export function useRealtimeInvalidation(socket: Socket | null) {
  const client = useQueryClient();

  useEffect(() => {
    if (!socket) return;
    const handlers = Object.entries(INVALIDATIONS).map(([event, keys]) => {
      const handler = () => {
        for (const queryKey of keys) void client.invalidateQueries({ queryKey });
      };
      socket.on(event, handler);
      return [event, handler] as const;
    });
    // Des signaux ont pu être manqués pendant une coupure : tout recharger.
    const onReconnect = () => void client.invalidateQueries();
    socket.io.on('reconnect', onReconnect);
    return () => {
      for (const [event, handler] of handlers) socket.off(event, handler);
      socket.io.off('reconnect', onReconnect);
    };
  }, [socket, client]);
}

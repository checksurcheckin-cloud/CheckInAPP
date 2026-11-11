import { useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { Socket } from '@horaires/api-client';
import { apiClient } from '../services/AuthService';

// Clés du cache. Pas d'id d'utilisateur dedans : le cache (mémoire et
// téléphone) est vidé à la connexion et à la déconnexion, il ne contient
// jamais que les données du compte connecté. Les clés sauvegardées pour la
// consultation hors ligne sont listées dans queryClient.ts.
export const queryKeys = {
  myShifts: ['my-shifts'] as const,
  sites: ['sites'] as const,
  users: ['users'] as const,
  openOffers: ['open-offers'] as const,
  myAvailabilities: ['my-availabilities'] as const,
};

// `mine: true` : ses propres shifts publiés, même pour un manager (décision
// #31). Triés par début, comme les écrans les affichent.
export function useMyShifts() {
  return useQuery({
    queryKey: queryKeys.myShifts,
    queryFn: async () => {
      const list = await apiClient.getShifts({ mine: true });
      return list.slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },
  });
}

export function useSites() {
  return useQuery({ queryKey: queryKeys.sites, queryFn: () => apiClient.getSites() });
}

export function useUsers() {
  return useQuery({ queryKey: queryKeys.users, queryFn: () => apiClient.getUsers() });
}

// Marché : offres d'échange des collègues et créneaux libres (l'API exclut
// déjà ses propres offres et ce qui chevauche un de ses shifts).
export function useOpenOffers() {
  return useQuery({ queryKey: queryKeys.openOffers, queryFn: () => apiClient.getOpenShiftOffers() });
}

// userId explicite : sans lui, un manager recevrait les dispos de toute
// l'entreprise (le serveur ne restreint d'office que les employés).
export function useMyAvailabilities(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.myAvailabilities,
    queryFn: () => apiClient.getAvailabilities(userId!),
    enabled: Boolean(userId),
  });
}

// Les onglets restent montés : en revenant sur un écran, on recharge ce qui
// a plus de 30 s, sans toucher à ce qui est encore frais.
export function useRefreshOnFocus(keys: QueryKey[]) {
  const client = useQueryClient();
  useFocusEffect(
    useCallback(() => {
      for (const queryKey of keys) void client.refetchQueries({ queryKey, stale: true, type: 'active' });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client]),
  );
}

// Tire-pour-rafraîchir : recharge tout de suite, fraîches ou non.
export function useManualRefresh(keys: QueryKey[]) {
  const client = useQueryClient();
  return useCallback(
    () => Promise.all(keys.map((queryKey) => client.refetchQueries({ queryKey, type: 'active' }))).then(() => {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client],
  );
}

// Signal temps réel du backend (realtime.gateway.ts) -> données du cache à
// recharger. Les candidatures et offres passent par `shifts:changed`.
const INVALIDATIONS: Record<string, QueryKey[]> = {
  'shifts:changed': [queryKeys.myShifts, queryKeys.openOffers],
  'availabilities:changed': [queryKeys.myAvailabilities],
  'sites:changed': [queryKeys.sites],
  'users:changed': [queryKeys.users],
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

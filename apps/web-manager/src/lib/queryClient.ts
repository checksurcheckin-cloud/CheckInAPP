import { QueryClient } from '@tanstack/react-query';

// Cache des réponses de l'API, partagé par toutes les pages (voir
// lib/queries.ts). Une donnée reste "fraîche" 30s : revenir sur une page dans
// ce délai l'affiche sans requête ; au-delà, elle s'affiche tout de suite
// depuis le cache et se recharge en arrière-plan. Les signaux temps réel
// (useRealtimeInvalidation) la périment dès qu'elle change côté serveur.
//
// Module séparé de queries.ts pour qu'AuthService puisse vider le cache à la
// déconnexion sans import circulaire (queries.ts importe apiClient).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 1,
    },
  },
});

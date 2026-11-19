import { QueryClient } from '@tanstack/react-query';

// Même réglage que web-manager : 30 s de fraîcheur, puis rechargement en
// arrière-plan.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

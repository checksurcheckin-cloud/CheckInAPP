import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, focusManager, type Query } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

// Cache des réponses de l'API (voir lib/queries.ts). Une donnée reste
// "fraîche" 30 s : changer d'onglet dans ce délai l'affiche sans requête ;
// au-delà, elle s'affiche tout de suite depuis le cache et se recharge en
// arrière-plan. Les signaux temps réel (useRealtimeInvalidation) la périment
// dès qu'elle change côté serveur.
//
// Module sans import d'AuthService, pour qu'AuthService puisse vider le
// cache à la déconnexion sans import circulaire.

// Une semaine : assez pour relire son planning hors ligne après quelques
// jours sans réseau.
const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Gardé assez longtemps pour être sauvegardé et relu hors ligne.
      gcTime: PERSIST_MAX_AGE,
      retry: 1,
    },
  },
});

// Retour au premier plan = "focus" de l'app : les données périmées se
// rechargent toutes seules (équivalent du retour sur l'onglet d'un
// navigateur).
focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
  return () => sub.remove();
});

// Consultation hors ligne : le planning, les sites et les dispos de
// l'employé sont aussi sauvegardés sur le téléphone, et réaffichés au
// lancement même sans réseau. Seulement ses propres données — ni l'annuaire
// des collègues ni le marché (inutilisable hors ligne de toute façon), et
// jamais le PIN ni le pointage, qui restent en direct.
export const PERSISTED_KEYS = new Set(['my-shifts', 'sites', 'my-availabilities']);

export const persistOptions = {
  persister: createAsyncStoragePersister({ storage: AsyncStorage, key: 'horaires-query-cache' }),
  maxAge: PERSIST_MAX_AGE,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Query) =>
      query.state.status === 'success' && PERSISTED_KEYS.has(String(query.queryKey[0])),
  },
};

// À la connexion et à la déconnexion : rien du compte précédent ne reste, ni
// en mémoire ni sur le téléphone.
export async function clearQueryCache() {
  queryClient.clear();
  try {
    await persistOptions.persister.removeClient();
  } catch {
    // Stockage indisponible : le cache mémoire est déjà vidé.
  }
}

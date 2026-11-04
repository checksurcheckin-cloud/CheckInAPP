import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { ClockInSettings } from '@horaires/shared-types';
import { apiClient, useAuth } from './AuthService';

// Réglages de pointage résolus de l'utilisateur connecté (décision #35) :
// pilotent la présence de l'onglet Pointage et de l'option GPS. Rechargés au
// retour au premier plan et en direct quand un manager change un réglage
// (événement `settings:changed`, et à chaque reconnexion du websocket). En
// cas d'échec réseau, on garde la dernière valeur connue et on réessaie
// toutes les 15 s tant qu'aucune réponse n'est arrivée — sinon une app
// ouverte pendant une coupure (ou un redéploiement) restait figée sur l'app
// complète. Le backend refuse de toute façon un pointage interdit.
const RETRY_MS = 15000;
type ClockInSettingsState = { settings: ClockInSettings | null };

const ClockInSettingsContext = createContext<ClockInSettingsState>({ settings: null });

export function ClockInSettingsProvider({ children }: { children: React.ReactNode }) {
  const { user, socket } = useAuth();
  const [settings, setSettings] = useState<ClockInSettings | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    try {
      setSettings(await apiClient.getMyClockInSettings());
    } catch {
      // Premier chargement en échec : on n'enferme pas l'employé hors du
      // pointage, on affiche l'app complète (le backend reste l'arbitre)...
      setSettings((current) => current ?? { mobileClockInEnabled: true, gpsClockInEnabled: true });
      // ... mais on réessaie jusqu'à obtenir la vraie valeur.
      retryTimer.current = setTimeout(() => void load(), RETRY_MS);
    }
  }, []);

  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!user) return;
    void load();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => sub.remove();
  }, [user, load]);

  useEffect(() => {
    if (!socket) return;
    const onChanged = () => void load();
    socket.on('settings:changed', onChanged);
    // Un changement fait pendant une déconnexion n'aurait jamais été reçu.
    socket.on('connect', onChanged);
    return () => {
      socket.off('settings:changed', onChanged);
      socket.off('connect', onChanged);
    };
  }, [socket, load]);

  return <ClockInSettingsContext.Provider value={{ settings }}>{children}</ClockInSettingsContext.Provider>;
}

export function useClockInSettings() {
  return useContext(ClockInSettingsContext).settings;
}

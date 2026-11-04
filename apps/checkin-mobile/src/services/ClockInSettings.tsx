import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { ClockInSettings } from '@horaires/shared-types';
import { apiClient, useAuth } from './AuthService';

// Réglages de pointage résolus de l'utilisateur connecté (décision #35) :
// pilotent la présence de l'onglet Pointage et de l'option GPS. Rechargés au
// retour au premier plan et en direct quand un manager change un réglage
// (événement `settings:changed`). En cas d'échec réseau, on garde la
// dernière valeur connue — le backend refuse de toute façon un pointage
// interdit.
type ClockInSettingsState = { settings: ClockInSettings | null };

const ClockInSettingsContext = createContext<ClockInSettingsState>({ settings: null });

export function ClockInSettingsProvider({ children }: { children: React.ReactNode }) {
  const { user, socket } = useAuth();
  const [settings, setSettings] = useState<ClockInSettings | null>(null);

  const load = useCallback(async () => {
    try {
      setSettings(await apiClient.getMyClockInSettings());
    } catch {
      // Premier chargement en échec : on n'enferme pas l'employé hors du
      // pointage, on affiche l'app complète (le backend reste l'arbitre).
      setSettings((current) => current ?? { mobileClockInEnabled: true, gpsClockInEnabled: true });
    }
  }, []);

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
    return () => {
      socket.off('settings:changed', onChanged);
    };
  }, [socket, load]);

  return <ClockInSettingsContext.Provider value={{ settings }}>{children}</ClockInSettingsContext.Provider>;
}

export function useClockInSettings() {
  return useContext(ClockInSettingsContext).settings;
}

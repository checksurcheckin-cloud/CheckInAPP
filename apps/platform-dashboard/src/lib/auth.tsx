import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { queryClient } from './queryClient';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import type { PlatformAdmin } from './types';

interface AuthState {
  admin: PlatformAdmin | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<PlatformAdmin | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    queryClient.clear();
    setAdmin(null);
  }, []);

  // Session expirée ou admin désactivé : retour à l'écran de connexion.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Session de l'onglet : on relit l'admin (rôle à jour) plutôt que de faire
  // confiance à ce qui a été stocké.
  useEffect(() => {
    if (!getToken()) {
      setIsLoading(false);
      return;
    }
    api
      .me()
      .then(setAdmin)
      .catch(() => setToken(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { accessToken, admin: loggedIn } = await api.login(email, password);
    queryClient.clear();
    setToken(accessToken);
    setAdmin(loggedIn);
  }, []);

  return <AuthContext.Provider value={{ admin, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() doit être utilisé dans <AuthProvider>');
  return ctx;
}

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { ApiClient, connectRealtime, type Socket } from '@horaires/api-client';
import type { User } from '@horaires/shared-types';

const ACCESS_TOKEN_KEY = 'horaires_access_token';
const REFRESH_TOKEN_KEY = 'horaires_refresh_token';
const USER_KEY = 'horaires_user';

// Accès synchrone au token courant pour ApiClient.
let currentAccessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const apiClient = new ApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: () => currentAccessToken,
  onUnauthorized: () => onUnauthorized?.(),
});

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  socket: Socket | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function persistSession(accessToken: string, refreshToken: string, user: User) {
  currentAccessToken = accessToken;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  currentAccessToken = null;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Connexion websocket dérivée de l'état d'auth : dès qu'un user est
  // authentifié (login ou session restaurée depuis localStorage), on ouvre
  // le canal temps réel ; il se ferme automatiquement au logout.
  useEffect(() => {
    if (!user || !currentAccessToken) {
      return;
    }
    const connection = connectRealtime(API_BASE_URL, currentAccessToken);
    setSocket(connection);
    return () => {
      connection.disconnect();
      setSocket(null);
    };
  }, [user]);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  useEffect(() => {
    onUnauthorized = () => logout();
    return () => {
      onUnauthorized = null;
    };
  }, [logout]);

  useEffect(() => {
    const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);
    if (accessToken && storedUser) {
      currentAccessToken = accessToken;
      setUser(JSON.parse(storedUser) as User);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiClient.login(email, password);
    // web-manager est réservé aux managers/admins (voir CLAUDE.md) — un
    // employé qui se trompe d'app se fait refuser ici plutôt que de voir un
    // espace vide/cassé. La vraie protection reste côté backend (RolesGuard
    // sur chaque endpoint d'écriture), ceci n'est qu'un garde-fou côté UX.
    if (response.user.role === 'employee') {
      throw new Error('Cet espace est réservé aux managers');
    }
    persistSession(response.accessToken, response.refreshToken, response.user);
    setUser(response.user);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, socket }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() doit être utilisé à l'intérieur d'un <AuthProvider>");
  }
  return ctx;
}

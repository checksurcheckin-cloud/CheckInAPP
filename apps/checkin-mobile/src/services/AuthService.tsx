import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { ApiClient, connectRealtime, type Socket } from '@horaires/api-client';
import type { User } from '@horaires/shared-types';

const ACCESS_TOKEN_KEY = 'horaires_access_token';
const REFRESH_TOKEN_KEY = 'horaires_refresh_token';
const USER_KEY = 'horaires_user';

// Accès synchrone au token courant pour ApiClient — SecureStore est async,
// donc on garde une copie en mémoire mise à jour par le AuthProvider.
let currentAccessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export const apiClient = new ApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: () => currentAccessToken,
  onUnauthorized: () => onUnauthorized?.(),
});

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  socket: Socket | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function persistSession(
  accessToken: string,
  refreshToken: string,
  user: User,
) {
  currentAccessToken = accessToken;
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
  ]);
}

async function clearSession() {
  currentAccessToken = null;
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
  ]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Connexion websocket dérivée de l'état d'auth : dès qu'un user est
  // authentifié (login ou session restaurée depuis SecureStore), on ouvre le
  // canal temps réel ; il se ferme automatiquement au logout.
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

  const logout = useCallback(async () => {
    await clearSession();
    setUser(null);
  }, []);

  useEffect(() => {
    onUnauthorized = () => {
      // Le refresh token a expiré ou été révoqué — retour à l'écran de login.
      void logout();
    };
    return () => {
      onUnauthorized = null;
    };
  }, [logout]);

  // Restaure la session persistée au démarrage de l'app.
  useEffect(() => {
    (async () => {
      const [accessToken, refreshToken, storedUser] = await Promise.all([
        SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);

      if (accessToken && refreshToken && storedUser) {
        currentAccessToken = accessToken;
        setUser(JSON.parse(storedUser) as User);
      }

      setIsLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiClient.login(email, password);
    await persistSession(response.accessToken, response.refreshToken, response.user);
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
    throw new Error('useAuth() doit être utilisé à l\'intérieur d\'un <AuthProvider>');
  }
  return ctx;
}

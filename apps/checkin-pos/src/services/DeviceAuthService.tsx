import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { ApiClient, ApiError } from '@horaires/api-client';

const DEVICE_ID_KEY = 'horaires_pos_device_id';
const QR_SECRET_KEY = 'horaires_pos_qr_secret';

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // token device valide 12h, on rafraîchit avant

// Accès synchrone au token courant pour ApiClient — SecureStore est async,
// donc on garde une copie en mémoire mise à jour par le DeviceAuthProvider.
let currentDeviceToken: string | null = null;

export const apiClient = new ApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
  getAccessToken: () => currentDeviceToken,
});

interface DeviceSession {
  deviceId: string;
  siteId: string;
  deviceLabel: string;
}

interface DeviceAuthContextValue {
  isLoading: boolean;
  // Appairé = identifiants (deviceId + qrSecret) stockés localement, que le
  // dernier rafraîchissement de token ait réussi ou non (voir isOffline).
  isPaired: boolean;
  session: DeviceSession | null;
  isOffline: boolean;
  pair: (deviceId: string, qrSecret: string) => Promise<void>;
  unpair: () => Promise<void>;
  retry: () => Promise<void>;
}

const DeviceAuthContext = createContext<DeviceAuthContextValue | undefined>(undefined);

export function DeviceAuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<DeviceSession | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [credentials, setCredentials] = useState<{ deviceId: string; qrSecret: string } | null>(
    null,
  );

  const authenticate = useCallback(async (deviceId: string, qrSecret: string) => {
    const response = await apiClient.authenticateDevice(deviceId, qrSecret);
    currentDeviceToken = response.deviceToken;
    setSession({ deviceId, siteId: response.siteId, deviceLabel: response.deviceLabel });
    setIsOffline(false);
  }, []);

  const unpair = useCallback(async () => {
    currentDeviceToken = null;
    setSession(null);
    setCredentials(null);
    setIsOffline(false);
    await Promise.all([
      SecureStore.deleteItemAsync(DEVICE_ID_KEY),
      SecureStore.deleteItemAsync(QR_SECRET_KEY),
    ]);
  }, []);

  const pair = useCallback(
    async (deviceId: string, qrSecret: string) => {
      await authenticate(deviceId, qrSecret);
      await Promise.all([
        SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId),
        SecureStore.setItemAsync(QR_SECRET_KEY, qrSecret),
      ]);
      setCredentials({ deviceId, qrSecret });
    },
    [authenticate],
  );

  // Distingue un vrai rejet (qrSecret révoqué par une rotation manager, il
  // faut ré-appairer) d'un simple souci réseau (on garde les identifiants et
  // on retentera — pas question de dé-appairer un kiosk juste parce qu'il a
  // perdu le wifi un instant).
  const refreshOrHandleFailure = useCallback(
    async (deviceId: string, qrSecret: string) => {
      try {
        await authenticate(deviceId, qrSecret);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
          await unpair();
        } else {
          setIsOffline(true);
        }
      }
    },
    [authenticate, unpair],
  );

  useEffect(() => {
    (async () => {
      const [deviceId, qrSecret] = await Promise.all([
        SecureStore.getItemAsync(DEVICE_ID_KEY),
        SecureStore.getItemAsync(QR_SECRET_KEY),
      ]);

      if (!deviceId || !qrSecret) {
        setIsLoading(false);
        return;
      }

      setCredentials({ deviceId, qrSecret });
      await refreshOrHandleFailure(deviceId, qrSecret);
      setIsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!credentials) return;
    const interval = setInterval(() => {
      void refreshOrHandleFailure(credentials.deviceId, credentials.qrSecret);
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [credentials, refreshOrHandleFailure]);

  const retry = useCallback(async () => {
    if (!credentials) return;
    setIsLoading(true);
    await refreshOrHandleFailure(credentials.deviceId, credentials.qrSecret);
    setIsLoading(false);
  }, [credentials, refreshOrHandleFailure]);

  return (
    <DeviceAuthContext.Provider
      value={{ isLoading, isPaired: !!credentials, session, isOffline, pair, unpair, retry }}
    >
      {children}
    </DeviceAuthContext.Provider>
  );
}

export function useDeviceAuth(): DeviceAuthContextValue {
  const ctx = useContext(DeviceAuthContext);
  if (!ctx) {
    throw new Error("useDeviceAuth() doit être utilisé à l'intérieur d'un <DeviceAuthProvider>");
  }
  return ctx;
}

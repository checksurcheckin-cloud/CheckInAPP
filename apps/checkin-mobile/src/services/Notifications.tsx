import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { AppNotification } from '@horaires/shared-types';
import { apiClient, useAuth } from './AuthService';

// Notifications de la cloche (shift assigné, candidature acceptée, nouveau
// shift dispo). Rechargées au retour au premier plan, et en direct quand le
// backend en envoie une (événement `notifications:changed`, reçu seulement
// par le destinataire) ou à chaque reconnexion du websocket. Un échec réseau
// garde simplement la dernière liste connue.
type NotificationsState = {
  items: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => void;
  markAllRead: () => void;
};

const NotificationsContext = createContext<NotificationsState>({
  items: [],
  unreadCount: 0,
  isLoading: false,
  refresh: async () => {},
  markRead: () => {},
  markAllRead: () => {},
});

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user, socket } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const list = await apiClient.getNotifications();
      setItems(list.items);
      setUnreadCount(list.unreadCount);
    } catch {
      // Dernière liste connue conservée ; nouvel essai au prochain signal.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      // Rien du compte précédent ne reste affiché au suivant.
      setItems([]);
      setUnreadCount(0);
      setIsLoading(true);
      return;
    }
    void refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [user, refresh]);

  useEffect(() => {
    if (!socket) return;
    const onChanged = () => void refresh();
    socket.on('notifications:changed', onChanged);
    socket.on('connect', onChanged);
    return () => {
      socket.off('notifications:changed', onChanged);
      socket.off('connect', onChanged);
    };
  }, [socket, refresh]);

  // Mise à jour immédiate à l'écran, puis enregistrement côté serveur.
  const markRead = useCallback(
    (id: string) => {
      const target = items.find((n) => n.id === id);
      if (!target || target.readAt) return;
      const now = new Date().toISOString();
      setItems((current) => current.map((n) => (n.id === id ? { ...n, readAt: now } : n)));
      setUnreadCount((count) => Math.max(0, count - 1));
      apiClient.markNotificationRead(id).catch(() => void refresh());
    },
    [items, refresh],
  );

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    setItems((current) => current.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setUnreadCount(0);
    apiClient.markAllNotificationsRead().catch(() => void refresh());
  }, [refresh]);

  return (
    <NotificationsContext.Provider value={{ items, unreadCount, isLoading, refresh, markRead, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}

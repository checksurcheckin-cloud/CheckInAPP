import { io, type Socket } from 'socket.io-client';

// Un seul canal websocket pour toute l'app (voir realtime.gateway.ts côté
// backend) : le client s'authentifie une fois au handshake avec le même JWT
// que les requêtes HTTP, puis rejoint automatiquement la room de sa company.
// transports: ['websocket'] force le websocket direct (pas de long-polling) —
// plus fiable sur React Native, où le polling XHR pose parfois problème.
export function connectRealtime(baseUrl: string, token: string): Socket {
  return io(baseUrl, {
    auth: { token },
    transports: ['websocket'],
  });
}

export type { Socket } from 'socket.io-client';

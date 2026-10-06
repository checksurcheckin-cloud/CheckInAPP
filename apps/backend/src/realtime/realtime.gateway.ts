import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

interface JwtPayload {
  sub: string;
  companyId: string;
  role: string;
}

// Un seul canal websocket pour toute l'app (web-manager + checkin-mobile) —
// chaque client rejoint uniquement la "room" de sa propre entreprise à la
// connexion, jamais celle d'une autre (même principe de cloisonnement que le
// reste de l'API, voir CLAUDE.md décision #1). checkin-pos ne s'y connecte
// pas : c'est un terminal mono-tâche (pointage), sans écran à tenir à jour
// en direct.
//
// Les événements sont volontairement grossiers ("shifts:changed", pas un
// événement par champ modifié précis) : chaque écran réagit en rechargeant
// ses données via son apiClient existant (le même load() que le
// pull-to-refresh), pas en fusionnant un payload partiel — plus simple et
// moins fragile que de dupliquer la logique de fusion d'état à chaque écran
// qui consomme ces données sous une forme différente (Shift imbriqué,
// PresentEmployee aplati, etc.).
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(private readonly jwt: JwtService) {}

  // Authentification au handshake, pas par requête : le token JWT déjà émis
  // par /auth/login est passé une fois à la connexion (socket.auth), jamais
  // rejoué à chaque message.
  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.query?.token as string | undefined);

    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      void client.join(`company:${payload.companyId}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect() {
    // Rien à nettoyer explicitement : socket.io retire déjà le client de ses
    // rooms à la déconnexion.
  }

  emitToCompany(companyId: string, event: string, payload: unknown = {}) {
    try {
      this.server?.to(`company:${companyId}`).emit(event, payload);
    } catch (err) {
      // Ne jamais faire échouer la mutation HTTP qui a déclenché cet envoi à
      // cause d'un souci purement websocket (client déconnecté, etc.).
      this.logger.warn(`Échec d'émission "${event}" pour company:${companyId}: ${err}`);
    }
  }
}

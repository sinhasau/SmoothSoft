import { Injectable } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { verifySessionToken, SESSION_COOKIE_NAME } from '../auth/jwt';

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/**
 * One Socket.IO room per location_id. A connected client is auto-joined to
 * ONLY their own authenticated location's room — never a client-requested
 * room — so this can't be used to eavesdrop on another location's queue.
 *
 * Single-process rooms for now (see the plan's "explicitly out of scope"
 * list) — a Redis adapter would be needed the moment this runs on more than
 * one Node process, which isn't the case for local dev.
 */
@Injectable()
@WebSocketGateway({ cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000', credentials: true } })
export class QueueGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    const token = readCookie(client.handshake.headers.cookie, SESSION_COOKIE_NAME);
    const auth = token ? verifySessionToken(token) : null;
    if (!auth) {
      client.disconnect(true);
      return;
    }
    void client.join(`location:${auth.locationId}`);
  }

  async broadcastQueueChanged(locationId: string) {
    this.server?.to(`location:${locationId}`).emit('queue:changed');
  }
}

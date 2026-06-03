import type { ClientId } from '@uxtweet/shared';
import type { WebSocket } from '@fastify/websocket';

export interface ConnectedClient {
  id: ClientId;
  socket: WebSocket;
  connectedAt: Date;
}

export type BroadcastFilter = (client: ConnectedClient) => boolean;

/**
 * Tracks active WebSocket connections and provides broadcasting utilities.
 * Deliberately decoupled from the message domain logic.
 */
export class ConnectionManager {
  private readonly clients = new Map<ClientId, ConnectedClient>();

  /**
   * Register a new client connection.
   */
  add(client: ConnectedClient): void {
    this.clients.set(client.id, client);
  }

  /**
   * Remove a client by its identifier.
   */
  remove(clientId: ClientId): void {
    this.clients.delete(clientId);
  }

  /**
   * Number of currently connected clients.
   */
  get count(): number {
    return this.clients.size;
  }

  /**
   * Send a JSON payload to a single client.
   * Silently ignores the send when the socket is not in the OPEN state.
   */
  send(clientId: ClientId, payload: unknown): void {
    const client = this.clients.get(clientId);
    if (client?.socket.readyState === 1 /* OPEN */) {
      client.socket.send(JSON.stringify(payload));
    }
  }

  /**
   * Broadcast a JSON payload to all connected clients, with an optional filter.
   */
  broadcast(payload: unknown, filter?: BroadcastFilter): void {
    const data = JSON.stringify(payload);
    for (const client of this.clients.values()) {
      if (client.socket.readyState !== 1 /* OPEN */) continue;
      if (filter && !filter(client)) continue;
      client.socket.send(data);
    }
  }
}

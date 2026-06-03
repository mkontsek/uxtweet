import type { ClientId, RosterEntry } from '@uxtweet/shared';
import type { WebSocket } from '@fastify/websocket';
import { WS_READY_STATE } from './wsReadyState';

export interface ConnectedClient {
    id: ClientId;
    socket: WebSocket;
    connectedAt: Date;
    /** Last time the client sent a frame; drives the client-derived idle status. */
    lastActivityAt: Date;
    /** Set once the client has successfully claimed a nickname via `join`. */
    nickname?: string;
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
     * Atomically claim a nickname for a client. Uniqueness is enforced
     * case-insensitively across all currently connected clients; the original
     * casing is preserved for display. Returns `false` when another live client
     * already holds the nickname, or when the client id is unknown.
     */
    claimNickname(clientId: ClientId, nickname: string): boolean {
        const client = this.clients.get(clientId);
        if (!client) {
            return false;
        }

        const wanted = nickname.toLowerCase();
        for (const other of this.clients.values()) {
            if (other.id === clientId) {
                continue;
            }
            if (other.nickname?.toLowerCase() === wanted) {
                return false;
            }
        }

        client.nickname = nickname;
        return true;
    }

    /**
     * The nickname a client claimed, or `undefined` if it has not joined yet.
     */
    nicknameOf(clientId: ClientId): string | undefined {
        return this.clients.get(clientId)?.nickname;
    }

    /**
     * Record that a client just sent a frame. Keeps the roster's `lastActivityAt`
     * fresh so a newly-connecting client's `welcome` snapshot is accurate.
     */
    touchActivity(clientId: ClientId): void {
        const client = this.clients.get(clientId);
        if (client) {
            client.lastActivityAt = new Date();
        }
    }

    /**
     * The live roster: one entry per client that has claimed a nickname, with
     * times serialised to ISO strings for the wire. Per-pod, like `count`.
     */
    roster(): RosterEntry[] {
        const entries: RosterEntry[] = [];
        for (const client of this.clients.values()) {
            if (client.nickname === undefined) {
                continue;
            }
            entries.push({
                nickname: client.nickname,
                connectedAt: client.connectedAt.toISOString(),
                lastActivityAt: client.lastActivityAt.toISOString(),
            });
        }
        return entries;
    }

    /**
     * Send a JSON payload to a single client.
     * Silently ignores the send when the socket is not in the OPEN state.
     */
    send(clientId: ClientId, payload: unknown): void {
        const client = this.clients.get(clientId);
        if (client?.socket.readyState === WS_READY_STATE.OPEN) {
            client.socket.send(JSON.stringify(payload));
        }
    }

    /**
     * Broadcast a JSON payload to all connected clients, with an optional filter.
     */
    broadcast(payload: unknown, filter?: BroadcastFilter): void {
        const data = JSON.stringify(payload);
        for (const client of this.clients.values()) {
            if (client.socket.readyState !== WS_READY_STATE.OPEN) {
                continue;
            }
            if (filter && !filter(client)) {
                continue;
            }
            client.socket.send(data);
        }
    }
}

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
     * Record the nickname a client has been granted, for display and the
     * roster. Uniqueness is **not** enforced here — that is the
     * {@link NicknameRegistry}'s job (local or cross-pod), claimed by the
     * transport before this is called. No-op for an unknown client id.
     */
    setNickname(clientId: ClientId, nickname: string): void {
        const client = this.clients.get(clientId);
        if (client) {
            client.nickname = nickname;
        }
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

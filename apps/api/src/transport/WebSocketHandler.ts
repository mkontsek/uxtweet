import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { v4 as uuidv4 } from 'uuid';
import type {
    ClientWsMessage,
    ServerErrorCode,
    ServerErrorMessage,
    ServerJoinedMessage,
} from '@uxtweet/shared';
import { validateNickname } from '@uxtweet/shared';
import type { ConnectionManager } from '../domain/ConnectionManager';
import type { MessageService } from '../domain/MessageService';
import { MessageValidationError } from '../domain/MessageService';
import { WS_READY_STATE } from '../domain/wsReadyState';

const HISTORY_LIMIT = 50;

/**
 * Registers the WebSocket route and wires the transport layer to the domain.
 * All WebSocket-specific concerns live here; the domain classes are unaware of WS.
 */
export function registerWebSocketHandler(
    fastify: FastifyInstance,
    connections: ConnectionManager,
    messages: MessageService
): void {
    fastify.get('/ws', { websocket: true }, (socket: WebSocket) => {
        const clientId = uuidv4();

        const now = new Date();
        connections.add({
            id: clientId,
            socket,
            connectedAt: now,
            lastActivityAt: now,
        });

        // Send welcome message with history
        void (async (): Promise<void> => {
            try {
                const history = await messages.getHistory(HISTORY_LIMIT);
                safeSend(socket, {
                    type: 'welcome',
                    clientId,
                    history,
                    userCount: connections.count,
                    users: connections.roster(),
                });
                // Inform all clients about updated user count
                connections.broadcast({
                    type: 'user_count',
                    count: connections.count,
                });
            } catch (err) {
                fastify.log.error(
                    { err, clientId },
                    'Failed to send welcome message'
                );
                safeSend(socket, {
                    type: 'error',
                    message: 'Failed to initialise session.',
                });
            }
        })();

        socket.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
            void routeClientMessage(
                decodeFrame(raw),
                clientId,
                connections,
                messages,
                socket,
                fastify.log
            );
        });

        socket.on('close', () => {
            const wasNamed = connections.nicknameOf(clientId) !== undefined;
            connections.remove(clientId);
            connections.broadcast({
                type: 'user_count',
                count: connections.count,
            });
            // A named user leaving changes the roster; an anonymous one does not.
            if (wasNamed) {
                connections.broadcast({
                    type: 'user_list',
                    users: connections.roster(),
                });
            }
        });

        socket.on('error', (err: Error) => {
            fastify.log.error({ err, clientId }, 'WebSocket error');
            connections.remove(clientId);
        });
    });
}

async function routeClientMessage(
    raw: string,
    clientId: string,
    connections: ConnectionManager,
    messages: MessageService,
    socket: WebSocket,
    log: FastifyBaseLogger
): Promise<void> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw) as unknown;
    } catch {
        sendError(socket, 'Invalid JSON.', 'invalid_message');
        return;
    }

    if (!isClientMessage(parsed)) {
        sendError(socket, 'Unknown message type.', 'invalid_message');
        return;
    }

    // Any valid frame counts as activity, keeping the roster's idle status fresh.
    connections.touchActivity(clientId);

    if (parsed.type === 'join') {
        joinClient(parsed.nickname, clientId, connections, socket);
        return;
    }

    const nickname = connections.nicknameOf(clientId);
    if (nickname === undefined) {
        sendError(
            socket,
            'Choose a nickname before sending messages.',
            'not_joined'
        );
        return;
    }

    try {
        await messages.createMessage(clientId, nickname, parsed.content);
    } catch (err) {
        // Only validation failures carry text safe to show the sender; anything
        // else (store/bus failure) is logged and masked behind a generic reply.
        if (err instanceof MessageValidationError) {
            sendError(socket, err.message, 'invalid_message');
            return;
        }
        log.error({ err, clientId }, 'Failed to create message');
        safeSend(socket, {
            type: 'error',
            message: 'Failed to send the message. Please try again.',
        } satisfies ServerErrorMessage);
    }
}

/**
 * Validate a requested nickname and atomically claim it. Replies with `joined`
 * on success, or an `error` carrying a specific code the client reacts to.
 */
function joinClient(
    rawNickname: string,
    clientId: string,
    connections: ConnectionManager,
    socket: WebSocket
): void {
    // A connection claims a nickname exactly once. Ignore a duplicate join from
    // an already-named client so a repeated `join` can't cycle nicknames or
    // strand the previously-held name as taken.
    if (connections.nicknameOf(clientId) !== undefined) {
        return;
    }

    const validation = validateNickname(rawNickname);
    if (!validation.ok) {
        sendError(socket, validation.reason, 'invalid_nickname');
        return;
    }

    const claimed = connections.claimNickname(clientId, validation.value);
    if (!claimed) {
        sendError(socket, 'That nickname is already taken.', 'nickname_taken');
        return;
    }

    const joined: ServerJoinedMessage = {
        type: 'joined',
        nickname: validation.value,
    };
    safeSend(socket, joined);

    // A new named user just appeared in the roster — tell everyone.
    connections.broadcast({ type: 'user_list', users: connections.roster() });
}

function sendError(
    socket: WebSocket,
    message: string,
    code: ServerErrorCode
): void {
    const payload: ServerErrorMessage = { type: 'error', message, code };
    safeSend(socket, payload);
}

/**
 * Serialise and send a frame, but only while the socket is OPEN. A client can
 * disconnect mid-processing (e.g. during the awaited history fetch); guarding
 * the send keeps a dead socket from throwing and surfacing as an unhandled
 * rejection on the `void`-ed message/welcome paths.
 */
function safeSend(socket: WebSocket, payload: unknown): void {
    if (socket.readyState === WS_READY_STATE.OPEN) {
        socket.send(JSON.stringify(payload));
    }
}

/**
 * Decode an inbound WebSocket frame to a UTF-8 string. `ws` may deliver the
 * payload as a Buffer, an ArrayBuffer, or an array of Buffer chunks; a plain
 * `.toString()` mis-stringifies the non-Buffer cases.
 */
function decodeFrame(raw: Buffer | ArrayBuffer | Buffer[]): string {
    if (Array.isArray(raw)) {
        return Buffer.concat(raw).toString('utf8');
    }
    if (Buffer.isBuffer(raw)) {
        return raw.toString('utf8');
    }
    return Buffer.from(raw).toString('utf8');
}

function isClientMessage(value: unknown): value is ClientWsMessage {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const record = value as Record<string, unknown>;

    if (record['type'] === 'join') {
        return typeof record['nickname'] === 'string';
    }

    if (record['type'] === 'send') {
        return typeof record['content'] === 'string';
    }

    return false;
}

import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { v4 as uuidv4 } from 'uuid';
import type { ClientWsMessage, ServerUserCountMessage } from '@uxtweet/shared';
import type { ConnectionManager } from '../domain/ConnectionManager';
import type { MessageService } from '../domain/MessageService';

const HISTORY_LIMIT = 50;

/**
 * Registers the WebSocket route and wires the transport layer to the domain.
 * All WebSocket-specific concerns live here; the domain classes are unaware of WS.
 */
export function registerWebSocketHandler(
  fastify: FastifyInstance,
  connections: ConnectionManager,
  messages: MessageService,
): void {
  // Wire domain events → broadcast
  messages.onMessageCreated(({ message }) => {
    connections.broadcast({ type: 'chat', message });

    const userCountMsg: ServerUserCountMessage = {
      type: 'user_count',
      count: connections.count,
    };
    connections.broadcast(userCountMsg);
  });

  fastify.get('/ws', { websocket: true }, (socket: WebSocket) => {
    const clientId = uuidv4();

    connections.add({ id: clientId, socket, connectedAt: new Date() });

    // Send welcome message with history
    void (async () => {
      const history = await messages.getHistory(HISTORY_LIMIT);
      socket.send(
        JSON.stringify({
          type: 'welcome',
          clientId,
          history,
          userCount: connections.count,
        }),
      );

      // Inform all clients about updated user count
      connections.broadcast({ type: 'user_count', count: connections.count });
    })();

    socket.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
      void handleMessage(raw.toString(), clientId, connections, messages, socket);
    });

    socket.on('close', () => {
      connections.remove(clientId);
      connections.broadcast({ type: 'user_count', count: connections.count });
    });

    socket.on('error', (err: Error) => {
      fastify.log.error({ err, clientId }, 'WebSocket error');
      connections.remove(clientId);
    });
  });
}

async function handleMessage(
  raw: string,
  clientId: string,
  connections: ConnectionManager,
  messages: MessageService,
  socket: WebSocket,
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON.' }));
    return;
  }

  if (!isClientMessage(parsed)) {
    socket.send(JSON.stringify({ type: 'error', message: 'Unknown message type.' }));
    return;
  }

  try {
    await messages.createMessage(clientId, parsed.content);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    socket.send(JSON.stringify({ type: 'error', message }));
  }
}

function isClientMessage(value: unknown): value is ClientWsMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value as Record<string, unknown>)['type'] === 'send' &&
    'content' in value &&
    typeof (value as Record<string, unknown>)['content'] === 'string'
  );
}

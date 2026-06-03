import Fastify from 'fastify';
import fastifyWebSocket from '@fastify/websocket';
import { ConnectionManager } from './domain/ConnectionManager';
import { MessageService } from './domain/MessageService';
import { InMemoryMessageStore } from './storage/InMemoryMessageStore';
import { registerWebSocketHandler } from './transport/WebSocketHandler';

export interface AppOptions {
  logger?: boolean | object;
}

export async function buildApp(options: AppOptions = {}): Promise<ReturnType<typeof Fastify>> {
  const fastify = Fastify({
    logger: options.logger ?? true,
  });

  await fastify.register(fastifyWebSocket, {
    options: {
      // Allow up to 10K concurrent connections
      maxPayload: 1048576, // 1 MiB
      backlog: 10000,
    },
  });

  // Health check
  fastify.get('/health', async () => ({ status: 'ok' }));

  const store = new InMemoryMessageStore();
  const connections = new ConnectionManager();
  const messageService = new MessageService(store);

  registerWebSocketHandler(fastify, connections, messageService);

  return fastify;
}

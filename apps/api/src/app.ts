import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import fastifyWebSocket from '@fastify/websocket';
import { ConnectionManager } from './domain/ConnectionManager';
import { MessageService } from './domain/MessageService';
import { PostgresMessageStore } from './storage/PostgresMessageStore';
import { RedisMessageBus } from './storage/RedisMessageBus';
import { registerWebSocketHandler } from './transport/WebSocketHandler';
import { registerMetrics } from './transport/metrics';
import type { ChatMessage } from '@uxtweet/shared';
import type { IMessageStore } from './storage/IMessageStore';
// `pg` is CommonJS; under the server's pure-ESM build Node can't resolve a named
// `Pool` export, so import the default and destructure (see ADR-0010 / Operations).
import pg from 'pg';

const { Pool } = pg;

// Lets `server.ts` flip readiness to failing on SIGTERM so k8s drains this pod
// from Service endpoints before the WebSocket listener actually closes.
declare module 'fastify' {
    interface FastifyInstance {
        markDraining: () => void;
    }
}

export interface AppOptions {
    logger?: boolean | object;
    /**
     * Inject a message store directly. Used by tests so they run without a real
     * database; production leaves this unset and builds a PostgresMessageStore
     * from `DATABASE_URL`.
     */
    store?: IMessageStore;
}

export async function buildApp(
    options: AppOptions = {}
): Promise<FastifyInstance> {
    const fastify = Fastify({
        logger: options.logger ?? true,
    });

    await fastify.register(fastifyWebSocket, {
        options: {
            // Generous payload limit to accommodate 10K concurrent connections;
            // individual messages are capped at 2000 chars (~2 KB) by MessageService validation.
            maxPayload: 65536, // 64 KiB — sufficient headroom above the 2 KB message limit
            backlog: 10000,
        },
    });

    // Health check, doubling as the k8s readiness probe. Once draining, it
    // returns 503 so the pod is removed from Service endpoints (stops receiving
    // new WebSocket upgrades) ahead of the listener closing on shutdown.
    let draining = false;
    fastify.decorate('markDraining', () => {
        draining = true;
    });
    fastify.get('/health', (_request, reply) => {
        if (draining) {
            void reply.code(503);
            return { status: 'shutting_down' };
        }
        return { status: 'ok' };
    });

    const { store, bus, close } = await createMessageInfrastructure(options);
    const connections = new ConnectionManager();
    const messageService = new MessageService(store);

    // Prometheus metrics (transport concern). Count every created message; the
    // connection gauge self-collects from ConnectionManager at scrape time.
    const metrics = registerMetrics(fastify, connections);
    messageService.onMessageCreated(() => {
        metrics.messagesTotal.inc();
    });

    if (bus !== undefined) {
        messageService.onMessageCreated(({ message }) => bus.publish(message));

        await bus.subscribe(
            (message) => {
                broadcastMessage(connections, message);
            },
            (err) => {
                fastify.log.error({ err }, 'Redis message dispatch failed');
            }
        );
    } else {
        messageService.onMessageCreated(({ message }) => {
            broadcastMessage(connections, message);
        });
    }

    registerWebSocketHandler(fastify, connections, messageService);

    fastify.addHook('onClose', async () => {
        await close?.();
    });

    return fastify;
}

interface MessageInfrastructure {
    store: IMessageStore;
    bus?: RedisMessageBus;
    close?: () => Promise<void>;
}

async function createMessageInfrastructure(
    options: AppOptions
): Promise<MessageInfrastructure> {
    // Tests inject their own store and skip the database entirely.
    if (options.store !== undefined) {
        return { store: options.store };
    }

    const databaseUrl = process.env['DATABASE_URL'];
    if (databaseUrl === undefined) {
        throw new Error(
            'DATABASE_URL must be set — chat history is persisted in PostgreSQL. ' +
                'For local development run `pnpm dev`, which starts Postgres via Docker Compose.'
        );
    }

    const retentionDays = parseRetentionDays(
        process.env['MESSAGE_HISTORY_RETENTION_DAYS']
    );
    const pool = new Pool({ connectionString: databaseUrl });
    const store = new PostgresMessageStore(pool, retentionDays);
    await store.init();

    // Redis is optional: it provides cross-pod fan-out for the multi-replica k3s
    // deploy. A single process (dev, or one pod) broadcasts locally without it.
    const redisUrl = process.env['REDIS_URL'];
    if (redisUrl === undefined) {
        return {
            store,
            close: async (): Promise<void> => {
                await store.close();
            },
        };
    }

    const bus = new RedisMessageBus(redisUrl);
    await bus.connect();

    return {
        store,
        bus,
        close: async (): Promise<void> => {
            await Promise.all([bus.close(), store.close()]);
        },
    };
}

function broadcastMessage(
    connections: ConnectionManager,
    message: ChatMessage
): void {
    // The user count only changes on connect/disconnect (both broadcast it
    // already), so a chat message must not re-broadcast it — that would double
    // the fan-out volume per message at scale.
    connections.broadcast({ type: 'chat', message });
}

function parseRetentionDays(raw: string | undefined): number {
    if (raw === undefined) {
        return 30;
    }

    const value = Number.parseInt(raw, 10);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(
            'MESSAGE_HISTORY_RETENTION_DAYS must be a positive integer.'
        );
    }

    return value;
}

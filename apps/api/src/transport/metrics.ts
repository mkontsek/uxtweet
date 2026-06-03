import type { FastifyInstance } from 'fastify';
import { Counter, Gauge, Registry, collectDefaultMetrics } from 'prom-client';
import type { ConnectionManager } from '../domain/ConnectionManager';

/**
 * Counters/handles the caller updates as domain events occur. The connection
 * gauge is self-collecting (reads {@link ConnectionManager.count} at scrape
 * time), so it is not exposed here.
 */
export interface AppMetrics {
    messagesTotal: Counter<string>;
}

/**
 * Registers the Prometheus `/metrics` endpoint and the app's collectors.
 *
 * Metrics live in the transport layer — `domain/` and `storage/` stay unaware of
 * them. A fresh {@link Registry} is created per call (not the global default) so
 * repeated `buildApp()` instances in tests don't clash on duplicate metric names.
 */
export function registerMetrics(
    fastify: FastifyInstance,
    connections: ConnectionManager
): AppMetrics {
    const registry = new Registry();
    collectDefaultMetrics({ register: registry });

    new Gauge({
        name: 'uxtweet_ws_connections',
        help: 'Current number of active WebSocket connections on this pod.',
        registers: [registry],
        collect(): void {
            this.set(connections.count);
        },
    });

    const messagesTotal = new Counter({
        name: 'uxtweet_messages_total',
        help: 'Total chat messages created on this pod since start.',
        registers: [registry],
    });

    fastify.get('/metrics', async (_request, reply): Promise<string> => {
        void reply.header('Content-Type', registry.contentType);
        return registry.metrics();
    });

    return { messagesTotal };
}

import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';
import { FakeMessageStore } from '../../storage/__tests__/fakeMessageStore';

describe('GET /metrics', () => {
    let app: FastifyInstance;

    afterEach(async () => {
        await app?.close();
    });

    it('exposes Prometheus metrics including the app collectors', async () => {
        app = await buildApp({ logger: false, store: new FakeMessageStore() });

        const res = await app.inject({ method: 'GET', url: '/metrics' });

        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/plain');
        expect(res.body).toContain('uxtweet_ws_connections');
        expect(res.body).toContain('uxtweet_messages_total');
        // Default Node process metrics should be present too.
        expect(res.body).toContain('process_cpu_user_seconds_total');
    });

    it('reports zero active connections when none are open', async () => {
        app = await buildApp({ logger: false, store: new FakeMessageStore() });

        const res = await app.inject({ method: 'GET', url: '/metrics' });

        expect(res.body).toMatch(/uxtweet_ws_connections 0\b/);
    });
});

import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { FakeMessageStore } from '../storage/__tests__/fakeMessageStore';

describe('buildApp', () => {
    let app: FastifyInstance | undefined;

    afterEach(async () => {
        await app?.close();
        app = undefined;
    });

    it('serves a healthy /health probe', async () => {
        app = await buildApp({ logger: false, store: new FakeMessageStore() });

        const res = await app.inject({ method: 'GET', url: '/health' });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ status: 'ok' });
    });

    it('reports 503 from /health once draining', async () => {
        app = await buildApp({ logger: false, store: new FakeMessageStore() });
        app.markDraining();

        const res = await app.inject({ method: 'GET', url: '/health' });

        expect(res.statusCode).toBe(503);
        expect(res.json()).toEqual({ status: 'shutting_down' });
    });

    it('throws when no store is injected and DATABASE_URL is unset', async () => {
        const previous = process.env['DATABASE_URL'];
        delete process.env['DATABASE_URL'];
        try {
            await expect(buildApp({ logger: false })).rejects.toThrow(
                /DATABASE_URL/
            );
        } finally {
            if (previous !== undefined) {
                process.env['DATABASE_URL'] = previous;
            }
        }
    });
});

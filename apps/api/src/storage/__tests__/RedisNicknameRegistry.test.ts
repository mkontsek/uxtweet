import { describe, it, expect, vi, beforeEach } from 'vitest';

// node-redis is a true boundary: a fake createClient backed by an in-memory
// keyspace lets the registry's claim/release semantics be exercised without a
// real Redis (SET NX, the compare-and-delete release Lua, idempotent re-claim).
interface SetOptions {
    NX?: boolean;
    EX?: number;
}

const { store, clients, createClient } = vi.hoisted(() => {
    const keyspace = new Map<string, string>();
    const made: unknown[] = [];
    const factory = vi.fn(() => {
        const client = {
            connect: vi.fn().mockResolvedValue(undefined),
            quit: vi.fn().mockResolvedValue(undefined),
            set: vi.fn((key: string, value: string, opts: SetOptions = {}) => {
                if (opts.NX && keyspace.has(key)) {
                    return Promise.resolve(null);
                }
                keyspace.set(key, value);
                return Promise.resolve('OK');
            }),
            get: vi.fn((key: string) =>
                Promise.resolve(keyspace.get(key) ?? null)
            ),
            expire: vi.fn(() => Promise.resolve(1)),
            // Emulate the compare-and-delete / compare-and-refresh Lua scripts.
            eval: vi.fn(
                (
                    script: string,
                    opts: { keys: string[]; arguments: string[] }
                ) => {
                    const [key] = opts.keys;
                    const [clientId] = opts.arguments;
                    if (key === undefined || keyspace.get(key) !== clientId) {
                        return Promise.resolve(0);
                    }
                    if (script.includes('del')) {
                        keyspace.delete(key);
                    }
                    return Promise.resolve(1);
                }
            ),
        };
        made.push(client);
        return client;
    });
    return { store: keyspace, clients: made, createClient: factory };
});

vi.mock('redis', () => ({ createClient }));

// Imported after the mock is registered.
import { RedisNicknameRegistry } from '../RedisNicknameRegistry';

describe('RedisNicknameRegistry', () => {
    beforeEach(() => {
        store.clear();
        clients.length = 0;
        createClient.mockClear();
    });

    it('claims an available nickname via SET NX', async () => {
        const registry = new RedisNicknameRegistry('redis://localhost:6379');
        expect(await registry.claim('c1', 'Alice')).toBe(true);
        // Stored under a lowercased key so uniqueness is case-insensitive.
        expect(store.has('uxtweet:nick:alice')).toBe(true);
    });

    it('rejects a nickname held by another client', async () => {
        const registry = new RedisNicknameRegistry('redis://localhost:6379');
        await registry.claim('c1', 'alice');
        expect(await registry.claim('c2', 'ALICE')).toBe(false);
    });

    it('is idempotent for the same client', async () => {
        const registry = new RedisNicknameRegistry('redis://localhost:6379');
        await registry.claim('c1', 'alice');
        expect(await registry.claim('c1', 'alice')).toBe(true);
    });

    it('frees a nickname on release', async () => {
        const registry = new RedisNicknameRegistry('redis://localhost:6379');
        await registry.claim('c1', 'alice');
        await registry.release('c1', 'alice');
        expect(store.has('uxtweet:nick:alice')).toBe(false);
        expect(await registry.claim('c2', 'alice')).toBe(true);
    });

    it('does not release a name another client now holds', async () => {
        const registry = new RedisNicknameRegistry('redis://localhost:6379');
        await registry.claim('c1', 'alice');
        // A stale release from a different client must not evict the key.
        await registry.release('c2', 'alice');
        expect(store.get('uxtweet:nick:alice')).toBe('c1');
    });

    it('close() quits the connection', async () => {
        const registry = new RedisNicknameRegistry('redis://localhost:6379');
        await registry.connect();
        await registry.close();
        const client = clients[0] as { quit: ReturnType<typeof vi.fn> };
        expect(client.quit).toHaveBeenCalledOnce();
    });
});

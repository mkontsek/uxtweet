import type { Pool, PoolClient } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@uxtweet/shared';
import { PostgresMessageStore } from '../PostgresMessageStore';

interface QueryResult {
    rows: unknown[];
}

/**
 * Kysely's PostgresDialect acquires a client via `pool.connect()` and runs
 * each query through `client.query(sql, params)`. The mock mirrors that shape
 * so assertions can inspect the compiled SQL and bound parameters.
 */
function makePool(): {
    pool: Pool;
    query: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
} {
    const query = vi
        .fn<(sql: string, params?: unknown[]) => Promise<QueryResult>>()
        .mockResolvedValue({ rows: [] });
    const end = vi.fn().mockResolvedValue(undefined);
    const client = { query, release: vi.fn() } as unknown as PoolClient;
    const connect = vi.fn().mockResolvedValue(client);
    const pool = { connect, end } as unknown as Pool;
    return { pool, query, end };
}

function makeMessage(id: string): ChatMessage {
    return {
        id,
        clientId: 'client-1',
        nickname: 'alice',
        content: 'hello',
        timestamp: new Date('2026-06-04T08:00:00.000Z').toISOString(),
    };
}

function sqlAt(query: ReturnType<typeof vi.fn>, index: number): string {
    return String(query.mock.calls[index]?.[0] ?? '');
}

function paramsAt(query: ReturnType<typeof vi.fn>, index: number): unknown[] {
    return (query.mock.calls[index]?.[1] as unknown[] | undefined) ?? [];
}

describe('PostgresMessageStore', () => {
    let pool: Pool;
    let query: ReturnType<typeof vi.fn>;
    let end: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        ({ pool, query, end } = makePool());
    });

    it('initialises the schema and prunes expired rows', async () => {
        const store = new PostgresMessageStore(pool, 30);

        await store.init();

        expect(query).toHaveBeenCalledTimes(3);
        expect(sqlAt(query, 0).toLowerCase()).toContain(
            'create table if not exists'
        );
        expect(sqlAt(query, 1).toLowerCase()).toContain(
            'create index if not exists'
        );
        expect(sqlAt(query, 2).toLowerCase()).toContain('delete from');
        expect(paramsAt(query, 2)).toEqual([30]);
    });

    it('saves messages and returns the latest history in ascending order', async () => {
        const store = new PostgresMessageStore(pool, 30);
        const first = makeMessage('1');
        const second = makeMessage('2');

        query.mockResolvedValueOnce({ rows: [] }); // save → insert
        query.mockResolvedValueOnce({
            rows: [
                {
                    id: second.id,
                    client_id: second.clientId,
                    nickname: second.nickname,
                    content: second.content,
                    created_at: new Date('2026-06-04T08:10:00.000Z'),
                },
                {
                    id: first.id,
                    client_id: first.clientId,
                    nickname: first.nickname,
                    content: first.content,
                    created_at: '2026-06-04T08:00:00.000Z',
                },
            ],
        });

        await store.save(first);
        const history = await store.getHistory(2);

        // No prune on the write path — save issues a single INSERT.
        expect(sqlAt(query, 0).toLowerCase()).toContain('insert into');
        expect(sqlAt(query, 0).toLowerCase()).not.toContain('delete from');
        expect(paramsAt(query, 0)).toEqual([
            first.id,
            first.clientId,
            first.nickname,
            first.content,
            first.timestamp,
        ]);

        expect(sqlAt(query, 1).toLowerCase()).toContain('select');
        expect(sqlAt(query, 1).toLowerCase()).toContain('order by');

        expect(history).toHaveLength(2);
        expect(history[0]?.id).toBe(first.id);
        expect(history[1]?.id).toBe(second.id);
        expect(history[1]?.timestamp).toBe('2026-06-04T08:10:00.000Z');
    });

    it('clears all rows', async () => {
        const store = new PostgresMessageStore(pool, 30);

        await store.clear();

        expect(sqlAt(query, 0).toLowerCase()).toContain(
            'truncate table chat_messages'
        );
    });

    it('closes the underlying pool', async () => {
        const store = new PostgresMessageStore(pool, 30);

        await store.init(); // acquires the pool so close() can release it
        await store.close();

        expect(end).toHaveBeenCalledTimes(1);
    });
});

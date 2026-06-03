import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatMessage } from '@uxtweet/shared';

// node-redis is a true boundary: fake createClient so the bus can be exercised
// without a Redis server. Each created client records its subscribe listener so
// tests can drive the dispatch path directly.
interface FakeRedisClient {
    connect: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
    listener?: (payload: string) => void;
    channel?: string;
}

const { clients, createClient } = vi.hoisted(() => {
    const made: FakeRedisClient[] = [];
    const factory = vi.fn(() => {
        const client: FakeRedisClient = {
            connect: vi.fn().mockResolvedValue(undefined),
            publish: vi.fn().mockResolvedValue(undefined),
            subscribe: vi
                .fn()
                .mockImplementation(
                    (channel: string, listener: (p: string) => void) => {
                        client.channel = channel;
                        client.listener = listener;
                        return Promise.resolve();
                    }
                ),
            quit: vi.fn().mockResolvedValue(undefined),
        };
        made.push(client);
        return client;
    });
    return { clients: made, createClient: factory };
});

vi.mock('redis', () => ({ createClient }));

// Imported after the mock is registered.
import { RedisMessageBus } from '../RedisMessageBus';

const SAMPLE: ChatMessage = {
    id: 'm1',
    clientId: 'c1',
    nickname: 'alice',
    content: 'hello',
    timestamp: '2026-06-16T09:00:00.000Z',
};

describe('RedisMessageBus', () => {
    beforeEach(() => {
        clients.length = 0;
        createClient.mockClear();
    });

    it('creates a separate publisher and subscriber connection', () => {
        new RedisMessageBus('redis://localhost:6379');
        expect(createClient).toHaveBeenCalledTimes(2);
        expect(clients).toHaveLength(2);
    });

    it('connect() opens both connections', async () => {
        const bus = new RedisMessageBus('redis://localhost:6379');
        await bus.connect();
        expect(clients[0]!.connect).toHaveBeenCalledOnce();
        expect(clients[1]!.connect).toHaveBeenCalledOnce();
    });

    it('publishes the serialised message to the default channel', async () => {
        const bus = new RedisMessageBus('redis://localhost:6379');
        await bus.publish(SAMPLE);
        expect(clients[0]!.publish).toHaveBeenCalledWith(
            'uxtweet:chat_messages',
            JSON.stringify(SAMPLE)
        );
    });

    it('honours a custom channel name', async () => {
        const bus = new RedisMessageBus(
            'redis://localhost:6379',
            'custom:chan'
        );
        await bus.publish(SAMPLE);
        await bus.subscribe(() => {});
        expect(clients[0]!.publish).toHaveBeenCalledWith(
            'custom:chan',
            JSON.stringify(SAMPLE)
        );
        expect(clients[1]!.channel).toBe('custom:chan');
    });

    it('dispatches a valid payload to the handler', async () => {
        const bus = new RedisMessageBus('redis://localhost:6379');
        const handler = vi.fn();
        await bus.subscribe(handler);

        clients[1]!.listener!(JSON.stringify(SAMPLE));
        // dispatch is async (void-ed); let the microtask queue drain.
        await Promise.resolve();
        await Promise.resolve();

        expect(handler).toHaveBeenCalledWith(SAMPLE);
    });

    it('reports invalid JSON via onError without calling the handler', async () => {
        const bus = new RedisMessageBus('redis://localhost:6379');
        const handler = vi.fn();
        const onError = vi.fn();
        await bus.subscribe(handler, onError);

        clients[1]!.listener!('{not json');
        await Promise.resolve();
        await Promise.resolve();

        expect(handler).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledOnce();
    });

    it('reports a structurally invalid payload via onError', async () => {
        const bus = new RedisMessageBus('redis://localhost:6379');
        const handler = vi.fn();
        const onError = vi.fn();
        await bus.subscribe(handler, onError);

        clients[1]!.listener!(JSON.stringify({ id: 'x', nickname: 'a' }));
        await Promise.resolve();
        await Promise.resolve();

        expect(handler).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledOnce();
        const [err] = onError.mock.calls[0] as [unknown];
        expect(err).toBeInstanceOf(Error);
    });

    it('close() quits both connections', async () => {
        const bus = new RedisMessageBus('redis://localhost:6379');
        await bus.close();
        expect(clients[0]!.quit).toHaveBeenCalledOnce();
        expect(clients[1]!.quit).toHaveBeenCalledOnce();
    });
});

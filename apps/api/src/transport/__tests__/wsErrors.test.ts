import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import type { ClientWsMessage, ServerWsMessage } from '@uxtweet/shared';
import { buildApp } from '../../app';
import { FakeMessageStore } from '../../storage/__tests__/fakeMessageStore';

interface TestClient {
    ws: WebSocket;
    opened: Promise<void>;
    sendRaw: (data: string) => void;
    send: (message: ClientWsMessage) => void;
    waitFor: (
        match: (msg: ServerWsMessage) => boolean
    ) => Promise<ServerWsMessage>;
}

describe('WebSocket transport error handling', () => {
    let app: FastifyInstance;
    const clients: TestClient[] = [];

    afterEach(async () => {
        for (const client of clients) {
            client.ws.close();
        }
        clients.length = 0;
        await app?.close();
    });

    async function startServer(): Promise<string> {
        app = await buildApp({ logger: false, store: new FakeMessageStore() });
        await app.listen({ port: 0, host: '127.0.0.1' });
        const address = app.server.address() as AddressInfo;
        return `ws://127.0.0.1:${address.port}/ws`;
    }

    function connect(url: string): TestClient {
        const ws = new WebSocket(url);
        const received: ServerWsMessage[] = [];
        const waiters: {
            match: (msg: ServerWsMessage) => boolean;
            resolve: (msg: ServerWsMessage) => void;
        }[] = [];

        ws.on('message', (data: Buffer) => {
            const msg = JSON.parse(data.toString()) as ServerWsMessage;
            received.push(msg);
            for (let i = waiters.length - 1; i >= 0; i--) {
                const waiter = waiters[i]!;
                if (waiter.match(msg)) {
                    waiter.resolve(msg);
                    waiters.splice(i, 1);
                }
            }
        });

        const opened = new Promise<void>((resolve, reject) => {
            ws.on('open', () => resolve());
            ws.on('error', reject);
        });

        const client: TestClient = {
            ws,
            opened,
            sendRaw: (data) => ws.send(data),
            send: (message) => ws.send(JSON.stringify(message)),
            waitFor: (match) => {
                const existing = received.find(match);
                if (existing) {
                    return Promise.resolve(existing);
                }
                return new Promise((resolve, reject) => {
                    const timer = setTimeout(() => {
                        reject(new Error('Timed out waiting for message'));
                    }, 2000);
                    waiters.push({
                        match,
                        resolve: (msg) => {
                            clearTimeout(timer);
                            resolve(msg);
                        },
                    });
                });
            },
        };
        clients.push(client);
        return client;
    }

    async function readyClient(url: string): Promise<TestClient> {
        const client = connect(url);
        await client.opened;
        await client.waitFor((m) => m.type === 'welcome');
        return client;
    }

    it('rejects invalid JSON with an invalid_message error', async () => {
        const url = await startServer();
        const client = await readyClient(url);

        client.sendRaw('{ not valid json');
        const err = await client.waitFor((m) => m.type === 'error');

        expect(err.type).toBe('error');
        if (err.type === 'error') {
            expect(err.code).toBe('invalid_message');
        }
    });

    it('rejects an unknown message type', async () => {
        const url = await startServer();
        const client = await readyClient(url);

        client.sendRaw(JSON.stringify({ type: 'nope' }));
        const err = await client.waitFor((m) => m.type === 'error');

        expect(err.type === 'error' && err.code).toBe('invalid_message');
    });

    it('refuses a send before the client has joined', async () => {
        const url = await startServer();
        const client = await readyClient(url);

        client.send({ type: 'send', content: 'hi there' });
        const err = await client.waitFor((m) => m.type === 'error');

        expect(err.type === 'error' && err.code).toBe('not_joined');
    });

    it('rejects an invalid nickname', async () => {
        const url = await startServer();
        const client = await readyClient(url);

        client.send({ type: 'join', nickname: 'a' });
        const err = await client.waitFor((m) => m.type === 'error');

        expect(err.type === 'error' && err.code).toBe('invalid_nickname');
    });

    it('rejects a nickname already taken by another client', async () => {
        const url = await startServer();
        const alice = await readyClient(url);
        alice.send({ type: 'join', nickname: 'alice' });
        await alice.waitFor((m) => m.type === 'joined');

        const bob = await readyClient(url);
        bob.send({ type: 'join', nickname: 'alice' });
        const err = await bob.waitFor((m) => m.type === 'error');

        expect(err.type === 'error' && err.code).toBe('nickname_taken');
    });

    it('broadcasts a chat frame after a joined client sends', async () => {
        const url = await startServer();
        const client = await readyClient(url);
        client.send({ type: 'join', nickname: 'alice' });
        await client.waitFor((m) => m.type === 'joined');

        client.send({ type: 'send', content: '  hello world  ' });
        const chat = await client.waitFor((m) => m.type === 'chat');

        expect(chat.type).toBe('chat');
        if (chat.type === 'chat') {
            expect(chat.message.content).toBe('hello world');
            expect(chat.message.nickname).toBe('alice');
        }
    });

    it('ignores a duplicate join from an already-named client', async () => {
        const url = await startServer();
        const client = await readyClient(url);
        client.send({ type: 'join', nickname: 'alice' });
        await client.waitFor((m) => m.type === 'joined');

        // A second join must neither error nor produce a second joined frame.
        client.send({ type: 'join', nickname: 'alice2' });
        client.send({ type: 'send', content: 'still alice' });
        const chat = await client.waitFor((m) => m.type === 'chat');

        expect(chat.type === 'chat' && chat.message.nickname).toBe('alice');
    });
});

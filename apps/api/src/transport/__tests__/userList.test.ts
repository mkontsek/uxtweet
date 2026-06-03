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
    send: (message: ClientWsMessage) => void;
    waitFor: (
        match: (msg: ServerWsMessage) => boolean
    ) => Promise<ServerWsMessage>;
}

describe('roster over the WebSocket', () => {
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

    // Buffers every server frame so callers never miss one to a registration race.
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

    it('includes the current roster in the welcome frame', async () => {
        const url = await startServer();

        const alice = connect(url);
        await alice.opened;
        await alice.waitFor((m) => m.type === 'welcome');
        alice.send({ type: 'join', nickname: 'alice' });
        await alice.waitFor((m) => m.type === 'joined');

        const bob = connect(url);
        await bob.opened;
        const welcome = await bob.waitFor((m) => m.type === 'welcome');

        expect(welcome.type).toBe('welcome');
        if (welcome.type === 'welcome') {
            expect(welcome.users.map((u) => u.nickname)).toEqual(['alice']);
        }
    });

    it('broadcasts user_list to peers when a client joins', async () => {
        const url = await startServer();

        const alice = connect(url);
        await alice.opened;
        await alice.waitFor((m) => m.type === 'welcome');
        alice.send({ type: 'join', nickname: 'alice' });
        await alice.waitFor((m) => m.type === 'joined');

        const bob = connect(url);
        await bob.opened;
        await bob.waitFor((m) => m.type === 'welcome');

        const aliceSeesBob = alice.waitFor(
            (m) => m.type === 'user_list' && m.users.length === 2
        );
        bob.send({ type: 'join', nickname: 'bob' });
        const userList = await aliceSeesBob;

        expect(userList.type).toBe('user_list');
        if (userList.type === 'user_list') {
            const names = userList.users.map((u) => u.nickname).sort();
            expect(names).toEqual(['alice', 'bob']);
        }
    });

    it('broadcasts user_list when a named client leaves', async () => {
        const url = await startServer();

        const alice = connect(url);
        await alice.opened;
        await alice.waitFor((m) => m.type === 'welcome');
        alice.send({ type: 'join', nickname: 'alice' });
        await alice.waitFor((m) => m.type === 'joined');

        const bob = connect(url);
        await bob.opened;
        await bob.waitFor((m) => m.type === 'welcome');
        bob.send({ type: 'join', nickname: 'bob' });
        await alice.waitFor(
            (m) => m.type === 'user_list' && m.users.length === 2
        );

        const aliceSeesLeave = alice.waitFor(
            (m) => m.type === 'user_list' && m.users.length === 1
        );
        bob.ws.close();
        const userList = await aliceSeesLeave;

        expect(userList.type).toBe('user_list');
        if (userList.type === 'user_list') {
            expect(userList.users.map((u) => u.nickname)).toEqual(['alice']);
        }
    });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectionManager } from '../ConnectionManager';
import type { ConnectedClient } from '../ConnectionManager';
import { WS_READY_STATE } from '../wsReadyState';
import type { WebSocket } from '@fastify/websocket';

function makeSocket(readyState: number = WS_READY_STATE.OPEN): WebSocket {
    return {
        readyState,
        send: () => undefined,
    } as unknown as WebSocket;
}

// A type-complete connected client for tests where the exact timestamps don't
// matter. Tests that assert on roster times construct the client inline instead.
function makeClient(
    id: string,
    socket: WebSocket = makeSocket()
): ConnectedClient {
    const now = new Date();
    return { id, socket, connectedAt: now, lastActivityAt: now };
}

describe('ConnectionManager', () => {
    let manager: ConnectionManager;

    beforeEach(() => {
        manager = new ConnectionManager();
    });

    it('starts with zero connections', () => {
        expect(manager.count).toBe(0);
    });

    it('adds and counts clients', () => {
        manager.add(makeClient('c1'));
        expect(manager.count).toBe(1);
    });

    it('removes a client', () => {
        manager.add(makeClient('c1'));
        manager.remove('c1');
        expect(manager.count).toBe(0);
    });

    it('broadcasts to all open sockets', () => {
        const sends: string[] = [];
        const socket = {
            readyState: WS_READY_STATE.OPEN,
            send: (d: string) => sends.push(d),
        } as unknown as WebSocket;
        manager.add({
            id: 'c1',
            socket,
            connectedAt: new Date(),
            lastActivityAt: new Date(),
        });
        manager.add({
            id: 'c2',
            socket,
            connectedAt: new Date(),
            lastActivityAt: new Date(),
        });

        manager.broadcast({ type: 'test' });

        expect(sends).toHaveLength(2);
    });

    it('skips closed sockets during broadcast', () => {
        const sends: string[] = [];
        const open = {
            readyState: WS_READY_STATE.OPEN,
            send: (d: string) => sends.push(d),
        } as unknown as WebSocket;
        const closed = makeSocket(WS_READY_STATE.CLOSED);
        manager.add({
            id: 'c1',
            socket: open,
            connectedAt: new Date(),
            lastActivityAt: new Date(),
        });
        manager.add({
            id: 'c2',
            socket: closed,
            connectedAt: new Date(),
            lastActivityAt: new Date(),
        });

        manager.broadcast({ type: 'test' });
        expect(sends).toHaveLength(1);
    });

    it('applies broadcast filter', () => {
        const sends: string[] = [];
        const socket = {
            readyState: WS_READY_STATE.OPEN,
            send: (d: string) => sends.push(d),
        } as unknown as WebSocket;
        manager.add({
            id: 'c1',
            socket,
            connectedAt: new Date(),
            lastActivityAt: new Date(),
        });
        manager.add({
            id: 'c2',
            socket,
            connectedAt: new Date(),
            lastActivityAt: new Date(),
        });

        manager.broadcast({ type: 'test' }, (c) => c.id === 'c1');
        expect(sends).toHaveLength(1);
    });

    it('send() targets a specific client', () => {
        const sends: string[] = [];
        const socket = {
            readyState: WS_READY_STATE.OPEN,
            send: (d: string) => sends.push(d),
        } as unknown as WebSocket;
        manager.add({
            id: 'c1',
            socket,
            connectedAt: new Date(),
            lastActivityAt: new Date(),
        });
        manager.add(makeClient('c2'));

        manager.send('c1', { hello: true });
        expect(sends).toHaveLength(1);
        expect(JSON.parse(sends[0]!)).toEqual({ hello: true });
    });

    describe('nicknames', () => {
        beforeEach(() => {
            manager.add(makeClient('c1'));
            manager.add(makeClient('c2'));
        });

        it('claims an available nickname', () => {
            expect(manager.claimNickname('c1', 'alice')).toBe(true);
            expect(manager.nicknameOf('c1')).toBe('alice');
        });

        it('rejects a nickname already held by another client', () => {
            manager.claimNickname('c1', 'alice');
            expect(manager.claimNickname('c2', 'alice')).toBe(false);
            expect(manager.nicknameOf('c2')).toBeUndefined();
        });

        it('compares uniqueness case-insensitively but preserves casing', () => {
            manager.claimNickname('c1', 'Alice');
            expect(manager.claimNickname('c2', 'ALICE')).toBe(false);
            expect(manager.nicknameOf('c1')).toBe('Alice');
        });

        it('allows the same client to re-claim its own nickname', () => {
            manager.claimNickname('c1', 'alice');
            expect(manager.claimNickname('c1', 'alice')).toBe(true);
        });

        it('frees a nickname when the holder disconnects', () => {
            manager.claimNickname('c1', 'alice');
            manager.remove('c1');
            expect(manager.claimNickname('c2', 'alice')).toBe(true);
        });

        it('returns false for an unknown client', () => {
            expect(manager.claimNickname('ghost', 'alice')).toBe(false);
        });
    });

    describe('roster', () => {
        it('includes only clients that have claimed a nickname', () => {
            const connectedAt = new Date('2026-06-05T10:00:00.000Z');
            manager.add({
                id: 'c1',
                socket: makeSocket(),
                connectedAt,
                lastActivityAt: connectedAt,
            });
            manager.add({
                id: 'c2',
                socket: makeSocket(),
                connectedAt,
                lastActivityAt: connectedAt,
            });
            manager.claimNickname('c1', 'alice');

            const roster = manager.roster();

            expect(roster).toHaveLength(1);
            expect(roster[0]).toEqual({
                nickname: 'alice',
                connectedAt: '2026-06-05T10:00:00.000Z',
                lastActivityAt: '2026-06-05T10:00:00.000Z',
            });
        });

        it('is empty when no client has joined', () => {
            manager.add({
                id: 'c1',
                socket: makeSocket(),
                connectedAt: new Date(),
                lastActivityAt: new Date(),
            });
            expect(manager.roster()).toEqual([]);
        });

        it('touchActivity advances lastActivityAt in the roster', () => {
            const connectedAt = new Date('2026-06-05T10:00:00.000Z');
            manager.add({
                id: 'c1',
                socket: makeSocket(),
                connectedAt,
                lastActivityAt: connectedAt,
            });
            manager.claimNickname('c1', 'alice');

            manager.touchActivity('c1');

            const entry = manager.roster()[0];
            expect(entry).toBeDefined();
            expect(Date.parse(entry!.lastActivityAt)).toBeGreaterThanOrEqual(
                connectedAt.getTime()
            );
        });

        it('touchActivity on an unknown client is a no-op', () => {
            expect(() => manager.touchActivity('ghost')).not.toThrow();
        });
    });
});

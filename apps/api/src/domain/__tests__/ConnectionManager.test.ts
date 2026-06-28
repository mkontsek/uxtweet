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

        it('records a nickname for display and the roster', () => {
            manager.setNickname('c1', 'alice');
            expect(manager.nicknameOf('c1')).toBe('alice');
        });

        it('preserves the chosen casing', () => {
            manager.setNickname('c1', 'Alice_42');
            expect(manager.nicknameOf('c1')).toBe('Alice_42');
        });

        it('does not enforce uniqueness — that is the registry concern', () => {
            // ConnectionManager is no longer the uniqueness gate; the
            // NicknameRegistry claims a name before setNickname is ever called.
            manager.setNickname('c1', 'alice');
            manager.setNickname('c2', 'alice');
            expect(manager.nicknameOf('c2')).toBe('alice');
        });

        it('clears the nickname when the client disconnects', () => {
            manager.setNickname('c1', 'alice');
            manager.remove('c1');
            expect(manager.nicknameOf('c1')).toBeUndefined();
        });

        it('is a no-op for an unknown client', () => {
            expect(() => manager.setNickname('ghost', 'alice')).not.toThrow();
            expect(manager.nicknameOf('ghost')).toBeUndefined();
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
            manager.setNickname('c1', 'alice');

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
            manager.setNickname('c1', 'alice');

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

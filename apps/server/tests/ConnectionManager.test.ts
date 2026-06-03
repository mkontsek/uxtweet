import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectionManager } from '../src/domain/ConnectionManager';
import type { WebSocket } from '@fastify/websocket';

function makeSocket(readyState = 1): WebSocket {
  return {
    readyState,
    send: () => undefined,
  } as unknown as WebSocket;
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
    manager.add({ id: 'c1', socket: makeSocket(), connectedAt: new Date() });
    expect(manager.count).toBe(1);
  });

  it('removes a client', () => {
    manager.add({ id: 'c1', socket: makeSocket(), connectedAt: new Date() });
    manager.remove('c1');
    expect(manager.count).toBe(0);
  });

  it('broadcasts to all open sockets', () => {
    const sends: string[] = [];
    const socket = { readyState: 1, send: (d: string) => sends.push(d) } as unknown as WebSocket;
    manager.add({ id: 'c1', socket, connectedAt: new Date() });
    manager.add({ id: 'c2', socket, connectedAt: new Date() });

    manager.broadcast({ type: 'test' });

    expect(sends).toHaveLength(2);
  });

  it('skips closed sockets during broadcast', () => {
    const sends: string[] = [];
    const open = { readyState: 1, send: (d: string) => sends.push(d) } as unknown as WebSocket;
    const closed = makeSocket(3); // CLOSED
    manager.add({ id: 'c1', socket: open, connectedAt: new Date() });
    manager.add({ id: 'c2', socket: closed, connectedAt: new Date() });

    manager.broadcast({ type: 'test' });
    expect(sends).toHaveLength(1);
  });

  it('applies broadcast filter', () => {
    const sends: string[] = [];
    const socket = { readyState: 1, send: (d: string) => sends.push(d) } as unknown as WebSocket;
    manager.add({ id: 'c1', socket, connectedAt: new Date() });
    manager.add({ id: 'c2', socket, connectedAt: new Date() });

    manager.broadcast({ type: 'test' }, (c) => c.id === 'c1');
    expect(sends).toHaveLength(1);
  });

  it('send() targets a specific client', () => {
    const sends: string[] = [];
    const socket = { readyState: 1, send: (d: string) => sends.push(d) } as unknown as WebSocket;
    manager.add({ id: 'c1', socket, connectedAt: new Date() });
    manager.add({ id: 'c2', socket: makeSocket(), connectedAt: new Date() });

    manager.send('c1', { hello: true });
    expect(sends).toHaveLength(1);
    expect(JSON.parse(sends[0]!)).toEqual({ hello: true });
  });
});

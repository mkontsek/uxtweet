import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h, type VNode } from 'vue';
import { mount } from '@vue/test-utils';
import { useChat } from '../useChat';

// ---------------------------------------------------------------------------
// withSetup – runs a composable inside a real component so lifecycle hooks
// (onUnmounted, etc.) have the component context they expect.
// ---------------------------------------------------------------------------
function withSetup<T>(composable: () => T): [T, ReturnType<typeof mount>] {
    let result!: T;
    const App = defineComponent({
        setup() {
            result = composable();
            return (): VNode => h('div');
        },
    });
    const wrapper = mount(App);
    return [result, wrapper];
}

// ---------------------------------------------------------------------------
// Minimal WebSocket mock
// ---------------------------------------------------------------------------
class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = MockWebSocket.OPEN;
    listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    sentMessages: string[] = [];

    constructor(public url: string) {}

    addEventListener(
        event: string,
        handler: (...args: unknown[]) => void
    ): void {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(handler);
    }

    send(data: string): void {
        this.sentMessages.push(data);
    }

    close(): void {
        this.readyState = MockWebSocket.CLOSED;
        this.emit('close', {});
    }

    emit(event: string, ...args: unknown[]): void {
        for (const handler of this.listeners[event] ?? []) {
            handler(...args);
        }
    }
}

let mockInstance: MockWebSocket | null = null;

const WebSocketStub = vi.fn(function (url: string): MockWebSocket {
    mockInstance = new MockWebSocket(url);
    return mockInstance;
});
// Mirror the static readyState constants the composable reads
// (WebSocket.OPEN, WebSocket.CONNECTING, …).
Object.assign(WebSocketStub, {
    CONNECTING: MockWebSocket.CONNECTING,
    OPEN: MockWebSocket.OPEN,
    CLOSING: MockWebSocket.CLOSING,
    CLOSED: MockWebSocket.CLOSED,
});

vi.stubGlobal('WebSocket', WebSocketStub);

describe('useChat composable', () => {
    beforeEach(() => {
        mockInstance = null;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('starts with closed status', () => {
        const [{ status }, wrapper] = withSetup(() =>
            useChat('ws://localhost:3000/ws')
        );
        expect(status.value).toBe('closed');
        wrapper.unmount();
    });

    it('transitions to connecting on connect()', () => {
        const [{ status, connect }, wrapper] = withSetup(() =>
            useChat('ws://localhost:3000/ws')
        );
        connect();
        expect(status.value).toBe('connecting');
        wrapper.unmount();
    });

    it('transitions to open after WebSocket open event', () => {
        const [{ status, connect }, wrapper] = withSetup(() =>
            useChat('ws://localhost:3000/ws')
        );
        connect();
        mockInstance!.emit('open');
        expect(status.value).toBe('open');
        wrapper.unmount();
    });

    it('processes welcome message', () => {
        const [{ messages, clientId, userCount, connect }, wrapper] = withSetup(
            () => useChat('ws://localhost:3000/ws')
        );
        connect();
        mockInstance!.emit('open');

        const welcome = {
            type: 'welcome',
            clientId: 'abc-123',
            history: [
                {
                    id: '1',
                    clientId: 'other',
                    content: 'Hello',
                    timestamp: new Date().toISOString(),
                },
            ],
            userCount: 5,
        };
        mockInstance!.emit('message', { data: JSON.stringify(welcome) });

        expect(clientId.value).toBe('abc-123');
        expect(messages.value).toHaveLength(1);
        expect(userCount.value).toBe(5);
        wrapper.unmount();
    });

    it('appends chat messages', () => {
        const [{ messages, connect }, wrapper] = withSetup(() =>
            useChat('ws://localhost:3000/ws')
        );
        connect();
        mockInstance!.emit('open');

        const chat = {
            type: 'chat',
            message: {
                id: '2',
                clientId: 'someone',
                content: 'Hey!',
                timestamp: new Date().toISOString(),
            },
        };
        mockInstance!.emit('message', { data: JSON.stringify(chat) });

        expect(messages.value).toHaveLength(1);
        expect(messages.value[0]?.content).toBe('Hey!');
        wrapper.unmount();
    });

    it('sendMessage sends serialised JSON', () => {
        const [{ connect, sendMessage }, wrapper] = withSetup(() =>
            useChat('ws://localhost:3000/ws')
        );
        connect();
        mockInstance!.emit('open');

        sendMessage('Hello server');

        expect(mockInstance!.sentMessages).toHaveLength(1);
        const sent = JSON.parse(mockInstance!.sentMessages[0]!) as {
            type: string;
            content: string;
        };
        expect(sent.type).toBe('send');
        expect(sent.content).toBe('Hello server');
        wrapper.unmount();
    });

    it('transitions to closed after WebSocket close event', () => {
        const [{ status, connect }, wrapper] = withSetup(() =>
            useChat('ws://localhost:3000/ws')
        );
        connect();
        mockInstance!.emit('open');
        mockInstance!.close();
        expect(status.value).toBe('closed');
        wrapper.unmount();
    });

    it('join sends a join frame with the nickname', () => {
        const [{ connect, join }, wrapper] = withSetup(() =>
            useChat('ws://localhost:3000/ws')
        );
        connect();
        mockInstance!.emit('open');

        join('alice');

        const sent = JSON.parse(mockInstance!.sentMessages[0]!) as {
            type: string;
            nickname: string;
        };
        expect(sent.type).toBe('join');
        expect(sent.nickname).toBe('alice');
        wrapper.unmount();
    });

    it('marks the session joined on a joined message', () => {
        const [{ connect, hasJoined, nickname }, wrapper] = withSetup(() =>
            useChat('ws://localhost:3000/ws')
        );
        connect();
        mockInstance!.emit('open');

        mockInstance!.emit('message', {
            data: JSON.stringify({ type: 'joined', nickname: 'alice' }),
        });

        expect(hasJoined.value).toBe(true);
        expect(nickname.value).toBe('alice');
        wrapper.unmount();
    });

    it('surfaces a nickname_taken error without joining', () => {
        const [{ connect, join, hasJoined, joinError }, wrapper] = withSetup(
            () => useChat('ws://localhost:3000/ws')
        );
        connect();
        mockInstance!.emit('open');
        join('alice');

        mockInstance!.emit('message', {
            data: JSON.stringify({
                type: 'error',
                code: 'nickname_taken',
                message: 'taken',
            }),
        });

        expect(hasJoined.value).toBe(false);
        expect(joinError.value).toBe('taken');
        wrapper.unmount();
    });

    it('populates the roster from the welcome frame', () => {
        const [{ users, connect }, wrapper] = withSetup(() =>
            useChat('ws://localhost:3000/ws')
        );
        connect();
        mockInstance!.emit('open');

        const ts = new Date().toISOString();
        mockInstance!.emit('message', {
            data: JSON.stringify({
                type: 'welcome',
                clientId: 'abc-123',
                history: [],
                userCount: 1,
                users: [
                    { nickname: 'alice', connectedAt: ts, lastActivityAt: ts },
                ],
            }),
        });

        expect(users.value.map((u) => u.nickname)).toEqual(['alice']);
        wrapper.unmount();
    });

    it('replaces the roster on a user_list frame', () => {
        const [{ users, connect }, wrapper] = withSetup(() =>
            useChat('ws://localhost:3000/ws')
        );
        connect();
        mockInstance!.emit('open');

        const ts = new Date().toISOString();
        mockInstance!.emit('message', {
            data: JSON.stringify({
                type: 'user_list',
                users: [
                    { nickname: 'alice', connectedAt: ts, lastActivityAt: ts },
                    { nickname: 'bob', connectedAt: ts, lastActivityAt: ts },
                ],
            }),
        });

        expect(users.value.map((u) => u.nickname)).toEqual(['alice', 'bob']);
        wrapper.unmount();
    });

    it('freshens a roster entry lastActivityAt from incoming chat', () => {
        const [{ users, connect }, wrapper] = withSetup(() =>
            useChat('ws://localhost:3000/ws')
        );
        connect();
        mockInstance!.emit('open');

        const stale = '2026-06-05T10:00:00.000Z';
        mockInstance!.emit('message', {
            data: JSON.stringify({
                type: 'user_list',
                users: [
                    {
                        nickname: 'alice',
                        connectedAt: stale,
                        lastActivityAt: stale,
                    },
                ],
            }),
        });

        const fresh = '2026-06-05T10:05:00.000Z';
        mockInstance!.emit('message', {
            data: JSON.stringify({
                type: 'chat',
                message: {
                    id: '9',
                    clientId: 'someone',
                    nickname: 'alice',
                    content: 'still here',
                    timestamp: fresh,
                },
            }),
        });

        expect(users.value[0]?.lastActivityAt).toBe(fresh);
        wrapper.unmount();
    });

    it('clears the roster when the socket closes', () => {
        const [{ users, connect }, wrapper] = withSetup(() =>
            useChat('ws://localhost:3000/ws')
        );
        connect();
        mockInstance!.emit('open');

        const ts = new Date().toISOString();
        mockInstance!.emit('message', {
            data: JSON.stringify({
                type: 'user_list',
                users: [
                    { nickname: 'alice', connectedAt: ts, lastActivityAt: ts },
                ],
            }),
        });
        expect(users.value).toHaveLength(1);

        mockInstance!.close();
        expect(users.value).toHaveLength(0);
        wrapper.unmount();
    });

    it('re-claims the nickname automatically after reconnect', () => {
        const [{ connect, join }, wrapper] = withSetup(() =>
            useChat('ws://localhost:3000/ws')
        );
        connect();
        mockInstance!.emit('open');
        join('alice');
        mockInstance!.emit('message', {
            data: JSON.stringify({ type: 'joined', nickname: 'alice' }),
        });

        // Drop and reconnect: the open handler should re-send the join frame.
        const before = mockInstance!.sentMessages.length;
        mockInstance!.emit('open');

        const last = JSON.parse(mockInstance!.sentMessages.at(-1)!) as {
            type: string;
            nickname: string;
        };
        expect(mockInstance!.sentMessages.length).toBe(before + 1);
        expect(last).toEqual({ type: 'join', nickname: 'alice' });
        wrapper.unmount();
    });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useChatStore } from '../chat';

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
// Mirror the static readyState constants the store reads
// (WebSocket.OPEN, WebSocket.CONNECTING, …).
Object.assign(WebSocketStub, {
    CONNECTING: MockWebSocket.CONNECTING,
    OPEN: MockWebSocket.OPEN,
    CLOSING: MockWebSocket.CLOSING,
    CLOSED: MockWebSocket.CLOSED,
});

vi.stubGlobal('WebSocket', WebSocketStub);

describe('chat store', () => {
    beforeEach(() => {
        // A fresh Pinia per test isolates store state; clear storage so a
        // remembered nickname from one test can't auto-rejoin in the next.
        window.localStorage.clear();
        setActivePinia(createPinia());
        mockInstance = null;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('starts with closed status', () => {
        const store = useChatStore();
        expect(store.status).toBe('closed');
    });

    it('transitions to connecting on connect()', () => {
        const store = useChatStore();
        store.connect();
        expect(store.status).toBe('connecting');
    });

    it('transitions to open after WebSocket open event', () => {
        const store = useChatStore();
        store.connect();
        mockInstance!.emit('open');
        expect(store.status).toBe('open');
    });

    it('processes welcome message', () => {
        const store = useChatStore();
        store.connect();
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
            users: [],
        };
        mockInstance!.emit('message', { data: JSON.stringify(welcome) });

        expect(store.clientId).toBe('abc-123');
        expect(store.messages).toHaveLength(1);
        expect(store.userCount).toBe(5);
    });

    it('appends chat messages', () => {
        const store = useChatStore();
        store.connect();
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

        expect(store.messages).toHaveLength(1);
        expect(store.messages[0]?.content).toBe('Hey!');
    });

    it('sendMessage sends serialised JSON', () => {
        const store = useChatStore();
        store.connect();
        mockInstance!.emit('open');

        store.sendMessage('Hello server');

        expect(mockInstance!.sentMessages).toHaveLength(1);
        const sent = JSON.parse(mockInstance!.sentMessages[0]!) as {
            type: string;
            content: string;
        };
        expect(sent.type).toBe('send');
        expect(sent.content).toBe('Hello server');
    });

    it('transitions to closed after WebSocket close event', () => {
        const store = useChatStore();
        store.connect();
        mockInstance!.emit('open');
        mockInstance!.close();
        expect(store.status).toBe('closed');
    });

    it('join sends a join frame with the nickname', () => {
        const store = useChatStore();
        store.connect();
        mockInstance!.emit('open');

        store.join('alice');

        const sent = JSON.parse(mockInstance!.sentMessages[0]!) as {
            type: string;
            nickname: string;
        };
        expect(sent.type).toBe('join');
        expect(sent.nickname).toBe('alice');
    });

    it('marks the session joined on a joined message', () => {
        const store = useChatStore();
        store.connect();
        mockInstance!.emit('open');

        mockInstance!.emit('message', {
            data: JSON.stringify({ type: 'joined', nickname: 'alice' }),
        });

        expect(store.hasJoined).toBe(true);
        expect(store.nickname).toBe('alice');
    });

    it('surfaces a nickname_taken error without joining', () => {
        const store = useChatStore();
        store.connect();
        mockInstance!.emit('open');
        store.join('alice');

        mockInstance!.emit('message', {
            data: JSON.stringify({
                type: 'error',
                code: 'nickname_taken',
                message: 'taken',
            }),
        });

        expect(store.hasJoined).toBe(false);
        expect(store.joinError).toBe('taken');
    });

    it('populates the roster from the welcome frame', () => {
        const store = useChatStore();
        store.connect();
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

        expect(store.users.map((u) => u.nickname)).toEqual(['alice']);
    });

    it('replaces the roster on a user_list frame', () => {
        const store = useChatStore();
        store.connect();
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

        expect(store.users.map((u) => u.nickname)).toEqual(['alice', 'bob']);
    });

    it('freshens a roster entry lastActivityAt from incoming chat', () => {
        const store = useChatStore();
        store.connect();
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

        expect(store.users[0]?.lastActivityAt).toBe(fresh);
    });

    it('clears the roster when the socket closes', () => {
        const store = useChatStore();
        store.connect();
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
        expect(store.users).toHaveLength(1);

        mockInstance!.close();
        expect(store.users).toHaveLength(0);
    });

    it('re-claims the nickname automatically after reconnect', () => {
        const store = useChatStore();
        store.connect();
        mockInstance!.emit('open');
        store.join('alice');
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
    });

    describe('session persistence', () => {
        it('persists the nickname on a confirmed join', () => {
            const store = useChatStore();
            store.connect();
            mockInstance!.emit('open');
            store.join('alice');
            mockInstance!.emit('message', {
                data: JSON.stringify({ type: 'joined', nickname: 'alice' }),
            });

            expect(window.localStorage.getItem('uxtweet:nickname')).toBe(
                'alice'
            );
        });

        it('auto-rejoins a remembered nickname on connect', () => {
            window.localStorage.setItem('uxtweet:nickname', 'bob');
            // Re-create the store so it reads the seeded storage on setup.
            setActivePinia(createPinia());

            const store = useChatStore();
            expect(store.isRestoringSession).toBe(true);

            store.connect();
            mockInstance!.emit('open');

            const sent = JSON.parse(mockInstance!.sentMessages[0]!) as {
                type: string;
                nickname: string;
            };
            expect(sent).toEqual({ type: 'join', nickname: 'bob' });
        });

        it('forgets a remembered nickname the server rejects', () => {
            window.localStorage.setItem('uxtweet:nickname', 'bob');
            setActivePinia(createPinia());

            const store = useChatStore();
            store.connect();
            mockInstance!.emit('open');
            mockInstance!.emit('message', {
                data: JSON.stringify({
                    type: 'error',
                    code: 'nickname_taken',
                    message: 'taken',
                }),
            });

            expect(store.isRestoringSession).toBe(false);
            expect(window.localStorage.getItem('uxtweet:nickname')).toBeNull();
        });
    });
});

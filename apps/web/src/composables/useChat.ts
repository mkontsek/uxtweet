import { ref, readonly, onUnmounted, inject } from 'vue';
import type { Ref, InjectionKey } from 'vue';
import type {
    ChatMessage,
    ClientId,
    RosterEntry,
    ServerWsMessage,
} from '@uxtweet/shared';
import { identifyUser, trackEvent } from '../analytics';

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

export interface UseChatReturn {
    messages: Readonly<Ref<readonly ChatMessage[]>>;
    status: Readonly<Ref<ConnectionStatus>>;
    clientId: Readonly<Ref<ClientId | null>>;
    userCount: Readonly<Ref<number>>;
    users: Readonly<Ref<readonly RosterEntry[]>>;
    nickname: Readonly<Ref<string | null>>;
    hasJoined: Readonly<Ref<boolean>>;
    joinError: Readonly<Ref<string | null>>;
    join: (nickname: string) => void;
    sendMessage: (content: string) => void;
    connect: () => void;
    disconnect: () => void;
}

// Typed provide/inject contract for the single chat instance created by
// MainLayout. A symbol key carries the value type, so consumers get full typing
// without a magic string or a per-call generic. Use `useChatContext()` to read.
export const CHAT_INJECTION_KEY: InjectionKey<UseChatReturn> = Symbol('chat');

export function useChatContext(): UseChatReturn {
    const chat = inject(CHAT_INJECTION_KEY);
    if (!chat) {
        throw new Error('Chat context not provided. Wrap with MainLayout.');
    }
    return chat;
}

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

export function useChat(wsUrl: string): UseChatReturn {
    const messages = ref<ChatMessage[]>([]);
    const status = ref<ConnectionStatus>('closed');
    const clientId = ref<ClientId | null>(null);
    const userCount = ref(0);
    const users = ref<RosterEntry[]>([]);
    const nickname = ref<string | null>(null);
    const hasJoined = ref(false);
    const joinError = ref<string | null>(null);

    let socket: WebSocket | null = null;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let intentionalClose = false;
    // The nickname the user wants to hold. Kept across reconnects so the session
    // re-claims the same name automatically once the socket comes back.
    let desiredNickname: string | null = null;

    function connect(): void {
        intentionalClose = false;
        // A fresh budget of attempts: a manual retry after auto-reconnect gave
        // up (or the initial connect) starts the cycle over. Clearing a pending
        // auto-reconnect tick keeps a single socket in flight.
        reconnectAttempts = 0;
        clearReconnectTimer();
        openSocket();
    }

    function disconnect(): void {
        intentionalClose = true;
        clearReconnectTimer();
        socket?.close();
    }

    function openSocket(): void {
        if (
            socket !== null &&
            (socket.readyState === WebSocket.OPEN ||
                socket.readyState === WebSocket.CONNECTING)
        ) {
            return;
        }

        status.value = 'connecting';
        socket = new WebSocket(wsUrl);

        socket.addEventListener('open', () => {
            reconnectAttempts = 0;
            status.value = 'open';
            // Re-claim the chosen nickname after a (re)connect.
            if (desiredNickname !== null) {
                sendJoin(desiredNickname);
            }
        });

        socket.addEventListener('message', (event: MessageEvent<string>) => {
            dispatchServerMessage(event.data);
        });

        socket.addEventListener('close', () => {
            status.value = 'closed';
            clientId.value = null;
            users.value = [];

            if (
                !intentionalClose &&
                reconnectAttempts < MAX_RECONNECT_ATTEMPTS
            ) {
                scheduleReconnect();
            }
        });

        socket.addEventListener('error', () => {
            status.value = 'error';
        });
    }

    function dispatchServerMessage(raw: string): void {
        let parsed: ServerWsMessage;
        try {
            parsed = JSON.parse(raw) as ServerWsMessage;
        } catch {
            console.error(
                '[chat] Failed to parse message:',
                raw.substring(0, 100)
            );
            return;
        }

        switch (parsed.type) {
            case 'welcome':
                clientId.value = parsed.clientId;
                messages.value = parsed.history;
                userCount.value = parsed.userCount;
                users.value = parsed.users;
                break;
            case 'joined':
                nickname.value = parsed.nickname;
                hasJoined.value = true;
                joinError.value = null;
                identifyUser(parsed.nickname);
                break;
            case 'chat':
                messages.value = [...messages.value, parsed.message];
                freshenActivity(
                    parsed.message.nickname,
                    parsed.message.timestamp
                );
                break;
            case 'user_count':
                userCount.value = parsed.count;
                break;
            case 'user_list':
                users.value = parsed.users;
                break;
            case 'error':
                if (
                    parsed.code === 'nickname_taken' ||
                    parsed.code === 'invalid_nickname'
                ) {
                    joinError.value = parsed.message;
                    // Don't auto-retry a rejected name on the next reconnect.
                    if (!hasJoined.value) {
                        desiredNickname = null;
                    }
                } else {
                    console.error('[chat] Server error:', parsed.message);
                }
                break;
        }
    }

    // Keep a chatting user marked "online" without any extra server frame: every
    // incoming chat message bumps the matching roster entry's last-activity time.
    function freshenActivity(nickname: string, timestamp: string): void {
        let changed = false;
        const next = users.value.map((entry) => {
            if (entry.nickname !== nickname) {
                return entry;
            }
            changed = true;
            return { ...entry, lastActivityAt: timestamp };
        });
        if (changed) {
            users.value = next;
        }
    }

    function join(requested: string): void {
        desiredNickname = requested;
        joinError.value = null;
        if (socket?.readyState === WebSocket.OPEN) {
            sendJoin(requested);
        }
    }

    function sendJoin(requested: string): void {
        socket?.send(JSON.stringify({ type: 'join', nickname: requested }));
    }

    function sendMessage(content: string): void {
        if (socket?.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ type: 'send', content }));
        trackEvent('message_sent');
    }

    function scheduleReconnect(): void {
        reconnectAttempts++;
        reconnectTimer = setTimeout(() => {
            openSocket();
        }, RECONNECT_DELAY_MS);
    }

    function clearReconnectTimer(): void {
        if (reconnectTimer !== null) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    }

    onUnmounted(() => {
        disconnect();
    });

    return {
        messages: readonly(messages),
        status: readonly(status),
        clientId: readonly(clientId),
        userCount: readonly(userCount),
        users: readonly(users),
        nickname: readonly(nickname),
        hasJoined: readonly(hasJoined),
        joinError: readonly(joinError),
        join,
        sendMessage,
        connect,
        disconnect,
    };
}

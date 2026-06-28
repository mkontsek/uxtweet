import { ref } from 'vue';
import { defineStore } from 'pinia';
import type {
    ChatMessage,
    ClientId,
    RosterEntry,
    ServerWsMessage,
} from '@uxtweet/shared';
import { identifyUser, trackEvent } from '../analytics';

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

// Where the chosen nickname is remembered across page reloads so a refresh
// re-joins the same name automatically instead of bouncing back to the landing
// screen (the session itself is still a fresh WebSocket — only the name persists).
const NICKNAME_STORAGE_KEY = 'uxtweet:nickname';

function readStoredNickname(): string | null {
    try {
        return window.localStorage.getItem(NICKNAME_STORAGE_KEY);
    } catch {
        return null;
    }
}

function persistNickname(value: string): void {
    try {
        window.localStorage.setItem(NICKNAME_STORAGE_KEY, value);
    } catch {
        // Private-mode / disabled storage: degrade to a non-persistent session.
    }
}

function clearStoredNickname(): void {
    try {
        window.localStorage.removeItem(NICKNAME_STORAGE_KEY);
    } catch {
        // Ignore — nothing to clean up if storage is unavailable.
    }
}

function resolveWsUrl(): string {
    const configured = process.env.WS_URL;
    if (configured) {
        return configured;
    }
    // In production WS_URL is empty (see quasar.config); derive it from the
    // current origin so the socket targets whatever host/ingress served the SPA.
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${window.location.host}/ws`;
}

/**
 * The single owner of the WebSocket lifecycle and chat state, as a Pinia store
 * so any component reaches it with `useChatStore()` (no provide/inject plumbing).
 * `MainLayout` drives connect/disconnect from its own lifecycle; components only
 * read state and call actions.
 */
export const useChatStore = defineStore('chat', () => {
    const wsUrl = resolveWsUrl();

    const messages = ref<ChatMessage[]>([]);
    const status = ref<ConnectionStatus>('closed');
    const clientId = ref<ClientId | null>(null);
    const userCount = ref(0);
    const users = ref<RosterEntry[]>([]);
    const nickname = ref<string | null>(null);
    const hasJoined = ref(false);
    const joinError = ref<string | null>(null);

    // The chosen name from a previous visit. When present we auto-rejoin on
    // connect and tell the UI a restore is in flight so it doesn't flash the
    // landing screen before the server confirms.
    const storedNickname = readStoredNickname();
    const isRestoringSession = ref(storedNickname !== null);

    let socket: WebSocket | null = null;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let intentionalClose = false;
    // The nickname the user wants to hold. Kept across reconnects so the session
    // re-claims the same name automatically once the socket comes back.
    let desiredNickname: string | null = storedNickname;

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
            // Re-claim the chosen nickname after a (re)connect or page reload.
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
                return;
            }
            // Auto-reconnect has given up (or this was a deliberate close): a
            // pending session restore can no longer complete, so stop waiting.
            isRestoringSession.value = false;
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
                isRestoringSession.value = false;
                // Remember the confirmed-good name for the next page load.
                persistNickname(parsed.nickname);
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
                    // Don't auto-retry a rejected name on the next reconnect or
                    // reload — forget it and let the user choose a new one.
                    if (!hasJoined.value) {
                        desiredNickname = null;
                        isRestoringSession.value = false;
                        clearStoredNickname();
                    }
                } else {
                    console.error('[chat] Server error:', parsed.message);
                }
                break;
        }
    }

    // Keep a chatting user marked "online" without any extra server frame: every
    // incoming chat message bumps the matching roster entry's last-activity time.
    function freshenActivity(entryNickname: string, timestamp: string): void {
        let changed = false;
        const next = users.value.map((entry) => {
            if (entry.nickname !== entryNickname) {
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
        // A deliberate join is not a passive restore.
        isRestoringSession.value = false;
        if (socket?.readyState === WebSocket.OPEN) {
            sendJoin(requested);
        }
    }

    function sendJoin(requested: string): void {
        socket?.send(JSON.stringify({ type: 'join', nickname: requested }));
    }

    function sendMessage(content: string): void {
        if (socket?.readyState !== WebSocket.OPEN) {
            return;
        }
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

    return {
        messages,
        status,
        clientId,
        userCount,
        users,
        nickname,
        hasJoined,
        joinError,
        isRestoringSession,
        join,
        sendMessage,
        connect,
        disconnect,
    };
});

export type ChatStore = ReturnType<typeof useChatStore>;

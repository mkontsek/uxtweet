import { ref, readonly, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import type { ChatMessage, ClientId, ServerWsMessage } from '@uxtweet/shared';

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

export interface UseChatReturn {
  messages: Readonly<Ref<ChatMessage[]>>;
  status: Readonly<Ref<ConnectionStatus>>;
  clientId: Readonly<Ref<ClientId | null>>;
  userCount: Readonly<Ref<number>>;
  sendMessage: (content: string) => void;
  connect: () => void;
  disconnect: () => void;
}

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

export function useChat(wsUrl: string): UseChatReturn {
  const messages = ref<ChatMessage[]>([]);
  const status = ref<ConnectionStatus>('closed');
  const clientId = ref<ClientId | null>(null);
  const userCount = ref(0);

  let socket: WebSocket | null = null;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let intentionalClose = false;

  function connect(): void {
    intentionalClose = false;
    openSocket();
  }

  function disconnect(): void {
    intentionalClose = true;
    clearReconnectTimer();
    socket?.close();
  }

  function openSocket(): void {
    if (socket?.readyState === WebSocket.OPEN) return;

    status.value = 'connecting';
    socket = new WebSocket(wsUrl);

    socket.addEventListener('open', () => {
      reconnectAttempts = 0;
      status.value = 'open';
    });

    socket.addEventListener('message', (event: MessageEvent<string>) => {
      handleServerMessage(event.data);
    });

    socket.addEventListener('close', () => {
      status.value = 'closed';
      clientId.value = null;

      if (!intentionalClose && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        scheduleReconnect();
      }
    });

    socket.addEventListener('error', () => {
      status.value = 'error';
    });
  }

  function handleServerMessage(raw: string): void {
    let parsed: ServerWsMessage;
    try {
      parsed = JSON.parse(raw) as ServerWsMessage;
    } catch {
      return;
    }

    switch (parsed.type) {
      case 'welcome':
        clientId.value = parsed.clientId;
        messages.value = parsed.history;
        userCount.value = parsed.userCount;
        break;
      case 'chat':
        messages.value = [...messages.value, parsed.message];
        break;
      case 'user_count':
        userCount.value = parsed.count;
        break;
      case 'error':
        console.error('[chat] Server error:', parsed.message);
        break;
    }
  }

  function sendMessage(content: string): void {
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'send', content }));
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
    sendMessage,
    connect,
    disconnect,
  };
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useChat } from '../src/composables/useChat';

// ---------------------------------------------------------------------------
// withSetup – runs a composable inside a real component so lifecycle hooks
// (onUnmounted, etc.) have the component context they expect.
// ---------------------------------------------------------------------------
function withSetup<T>(composable: () => T): [T, ReturnType<typeof mount>] {
  let result!: T;
  const App = defineComponent({
    setup() {
      result = composable();
      return () => h('div');
    },
  });
  const wrapper = mount(App);
  return [result, wrapper];
}

// ---------------------------------------------------------------------------
// Minimal WebSocket mock
// ---------------------------------------------------------------------------
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  sentMessages: string[] = [];

  constructor(public url: string) {}

  addEventListener(event: string, handler: (...args: unknown[]) => void): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(handler);
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

vi.stubGlobal(
  'WebSocket',
  class extends MockWebSocket {
    constructor(url: string) {
      super(url);
      mockInstance = this;
    }
  },
);

describe('useChat composable', () => {
  beforeEach(() => {
    mockInstance = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with closed status', () => {
    const [{ status }, wrapper] = withSetup(() => useChat('ws://localhost:3000/ws'));
    expect(status.value).toBe('closed');
    wrapper.unmount();
  });

  it('transitions to connecting on connect()', () => {
    const [{ status, connect }, wrapper] = withSetup(() => useChat('ws://localhost:3000/ws'));
    connect();
    expect(status.value).toBe('connecting');
    wrapper.unmount();
  });

  it('transitions to open after WebSocket open event', () => {
    const [{ status, connect }, wrapper] = withSetup(() => useChat('ws://localhost:3000/ws'));
    connect();
    mockInstance!.emit('open');
    expect(status.value).toBe('open');
    wrapper.unmount();
  });

  it('processes welcome message', () => {
    const [{ messages, clientId, userCount, connect }, wrapper] = withSetup(() =>
      useChat('ws://localhost:3000/ws'),
    );
    connect();
    mockInstance!.emit('open');

    const welcome = {
      type: 'welcome',
      clientId: 'abc-123',
      history: [
        { id: '1', clientId: 'other', content: 'Hello', timestamp: new Date().toISOString() },
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
    const [{ messages, connect }, wrapper] = withSetup(() => useChat('ws://localhost:3000/ws'));
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
      useChat('ws://localhost:3000/ws'),
    );
    connect();
    mockInstance!.emit('open');

    sendMessage('Hello server');

    expect(mockInstance!.sentMessages).toHaveLength(1);
    const sent = JSON.parse(mockInstance!.sentMessages[0]!) as { type: string; content: string };
    expect(sent.type).toBe('send');
    expect(sent.content).toBe('Hello server');
    wrapper.unmount();
  });

  it('transitions to closed after WebSocket close event', () => {
    const [{ status, connect }, wrapper] = withSetup(() => useChat('ws://localhost:3000/ws'));
    connect();
    mockInstance!.emit('open');
    mockInstance!.close();
    expect(status.value).toBe('closed');
    wrapper.unmount();
  });
});

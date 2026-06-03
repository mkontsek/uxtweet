import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryMessageStore } from '../src/storage/InMemoryMessageStore';
import type { ChatMessage } from '@uxtweet/shared';

const makeMessage = (id: string, content = 'hello'): ChatMessage => ({
  id,
  clientId: 'client-1',
  content,
  timestamp: new Date().toISOString(),
});

describe('InMemoryMessageStore', () => {
  let store: InMemoryMessageStore;

  beforeEach(() => {
    store = new InMemoryMessageStore();
  });

  it('stores and retrieves messages', async () => {
    const msg = makeMessage('1');
    await store.save(msg);
    const history = await store.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(msg);
  });

  it('respects the limit parameter', async () => {
    for (let i = 0; i < 10; i++) {
      await store.save(makeMessage(String(i)));
    }
    const history = await store.getHistory(5);
    expect(history).toHaveLength(5);
  });

  it('evicts oldest messages when capacity is exceeded', async () => {
    const small = new InMemoryMessageStore(3);
    await small.save(makeMessage('a', 'first'));
    await small.save(makeMessage('b', 'second'));
    await small.save(makeMessage('c', 'third'));
    await small.save(makeMessage('d', 'fourth'));

    const history = await small.getHistory();
    expect(history).toHaveLength(3);
    expect(history.map((m) => m.content)).toEqual(['second', 'third', 'fourth']);
  });

  it('clears all messages', async () => {
    await store.save(makeMessage('1'));
    await store.clear();
    expect(await store.getHistory()).toHaveLength(0);
  });

  it('returns an empty array when there are no messages', async () => {
    expect(await store.getHistory()).toHaveLength(0);
  });
});

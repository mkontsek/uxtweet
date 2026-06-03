import type { ChatMessage } from '@uxtweet/shared';
import type { IMessageStore } from './IMessageStore';

/** Maximum number of messages retained in memory. */
const DEFAULT_MAX_MESSAGES = 200;

/**
 * Simple in-memory message store with a configurable capacity.
 * When the capacity is exceeded the oldest messages are evicted.
 */
export class InMemoryMessageStore implements IMessageStore {
  private readonly messages: ChatMessage[] = [];

  constructor(private readonly maxMessages: number = DEFAULT_MAX_MESSAGES) {}

  async save(message: ChatMessage): Promise<void> {
    this.messages.push(message);
    if (this.messages.length > this.maxMessages) {
      this.messages.splice(0, this.messages.length - this.maxMessages);
    }
  }

  async getHistory(limit = 100): Promise<ChatMessage[]> {
    const start = Math.max(0, this.messages.length - limit);
    return this.messages.slice(start);
  }

  async clear(): Promise<void> {
    this.messages.splice(0, this.messages.length);
  }
}

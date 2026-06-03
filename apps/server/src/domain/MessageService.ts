import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage, ClientId } from '@uxtweet/shared';
import type { IMessageStore } from '../storage/IMessageStore';

export interface MessageCreatedEvent {
  message: ChatMessage;
}

export type OnMessageCreated = (event: MessageCreatedEvent) => void;

/**
 * Core business logic for message creation and retrieval.
 * Deliberately has no awareness of WebSocket internals.
 */
export class MessageService {
  private readonly listeners: OnMessageCreated[] = [];

  constructor(private readonly store: IMessageStore) {}

  /**
   * Register a callback that is invoked whenever a new message is created.
   */
  onMessageCreated(listener: OnMessageCreated): void {
    this.listeners.push(listener);
  }

  /**
   * Validate the message content and persist it.
   * Emits a {@link MessageCreatedEvent} to all registered listeners.
   *
   * @throws {Error} When the content is blank or exceeds the maximum length.
   */
  async createMessage(clientId: ClientId, content: string): Promise<ChatMessage> {
    const trimmed = content.trim();

    if (trimmed.length === 0) {
      throw new Error('Message content must not be empty.');
    }

    if (trimmed.length > 2000) {
      throw new Error('Message content must not exceed 2000 characters.');
    }

    const message: ChatMessage = {
      id: uuidv4(),
      clientId,
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    await this.store.save(message);
    this.emit({ message });

    return message;
  }

  /**
   * Return the message history from the underlying store.
   */
  async getHistory(limit?: number): Promise<ChatMessage[]> {
    return this.store.getHistory(limit);
  }

  private emit(event: MessageCreatedEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

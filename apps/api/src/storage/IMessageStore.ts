import type { ChatMessage } from '@uxtweet/shared';

/**
 * Abstraction over message persistence.
 * Implementations may be in-memory, Redis, PostgreSQL, etc.
 */
export interface IMessageStore {
    /**
     * Persist a message.
     */
    save(message: ChatMessage): Promise<void>;

    /**
     * Retrieve the most recent messages.
     * @param limit Maximum number of messages to return (default: 100).
     */
    getHistory(limit?: number): Promise<ChatMessage[]>;

    /**
     * Remove all messages (useful for testing / resets).
     */
    clear(): Promise<void>;
}

import type { ChatMessage } from '@uxtweet/shared';
import type { IMessageStore } from '../IMessageStore';

/**
 * In-memory `IMessageStore` for tests only. Keeps the suite runnable without a
 * real PostgreSQL — production builds a {@link PostgresMessageStore} instead
 * (see app.ts). Lives under `__tests__/` so it is never bundled into the app.
 */
export class FakeMessageStore implements IMessageStore {
    private readonly messages: ChatMessage[] = [];

    constructor(private readonly maxMessages = 200) {}

    save(message: ChatMessage): Promise<void> {
        this.messages.push(message);
        if (this.messages.length > this.maxMessages) {
            this.messages.splice(0, this.messages.length - this.maxMessages);
        }
        return Promise.resolve();
    }

    getHistory(limit = 100): Promise<ChatMessage[]> {
        const start = Math.max(0, this.messages.length - limit);
        return Promise.resolve(this.messages.slice(start));
    }

    clear(): Promise<void> {
        this.messages.splice(0, this.messages.length);
        return Promise.resolve();
    }
}

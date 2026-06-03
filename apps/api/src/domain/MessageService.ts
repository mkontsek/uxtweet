import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage, ClientId } from '@uxtweet/shared';
import type { IMessageStore } from '../storage/IMessageStore';

/**
 * Rejected message content (empty, too long). The transport may safely relay
 * `message` to the client; any other error is internal and must stay masked.
 */
export class MessageValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MessageValidationError';
    }
}

export interface MessageCreatedEvent {
    message: ChatMessage;
}

export type OnMessageCreated = (
    event: MessageCreatedEvent
) => void | Promise<void>;

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
     * @throws {MessageValidationError} When the content is blank or exceeds the maximum length.
     */
    async createMessage(
        clientId: ClientId,
        nickname: string,
        content: string
    ): Promise<ChatMessage> {
        const trimmed = content.trim();

        if (trimmed.length === 0) {
            throw new MessageValidationError(
                'Message content must not be empty.'
            );
        }

        if (trimmed.length > 2000) {
            throw new MessageValidationError(
                'Message content must not exceed 2000 characters.'
            );
        }

        const message: ChatMessage = {
            id: uuidv4(),
            clientId,
            nickname,
            content: trimmed,
            timestamp: new Date().toISOString(),
        };

        await this.store.save(message);
        await this.emit({ message });

        return message;
    }

    /**
     * Return the message history from the underlying store.
     */
    async getHistory(limit?: number): Promise<ChatMessage[]> {
        return this.store.getHistory(limit);
    }

    private async emit(event: MessageCreatedEvent): Promise<void> {
        const results = await Promise.allSettled(
            this.listeners.map((listener) => listener(event))
        );

        const rejected = results.find(
            (result): result is PromiseRejectedResult =>
                result.status === 'rejected'
        );
        if (rejected !== undefined) {
            throw rejected.reason;
        }
    }
}

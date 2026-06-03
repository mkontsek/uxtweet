import { createClient, type RedisClientType } from 'redis';
import type { ChatMessage } from '@uxtweet/shared';

export type MessageHandler = (message: ChatMessage) => void | Promise<void>;
export type ErrorHandler = (err: unknown) => void;

interface RedisPayload {
    id: string;
    clientId: string;
    nickname: string;
    content: string;
    timestamp: string;
}

const DEFAULT_CHANNEL = 'uxtweet:chat_messages';

/**
 * Redis Pub/Sub bridge for chat messages.
 * The publisher and subscriber use separate connections because Redis Pub/Sub
 * dedicates a connection to subscription mode.
 */
export class RedisMessageBus {
    private readonly publisher: RedisClientType;
    private readonly subscriber: RedisClientType;

    constructor(
        redisUrl: string,
        private readonly channel: string = DEFAULT_CHANNEL
    ) {
        this.publisher = createClient({ url: redisUrl });
        this.subscriber = createClient({ url: redisUrl });
    }

    async connect(): Promise<void> {
        await Promise.all([
            this.publisher.connect(),
            this.subscriber.connect(),
        ]);
    }

    async publish(message: ChatMessage): Promise<void> {
        await this.publisher.publish(this.channel, JSON.stringify(message));
    }

    async subscribe(
        handler: MessageHandler,
        onError?: ErrorHandler
    ): Promise<void> {
        await this.subscriber.subscribe(this.channel, (payload: string) => {
            // node-redis invokes this listener fire-and-forget, so a throw here
            // becomes an unhandled rejection rather than reaching any caller. A
            // single malformed frame must not tear down the subscription:
            // report it via onError and drop just that message.
            void this.dispatch(payload, handler, onError);
        });
    }

    private async dispatch(
        payload: string,
        handler: MessageHandler,
        onError?: ErrorHandler
    ): Promise<void> {
        try {
            const parsed = JSON.parse(payload) as unknown;
            if (!isRedisPayload(parsed)) {
                onError?.(
                    new Error('Received an invalid Redis message payload.')
                );
                return;
            }

            await handler({
                id: parsed.id,
                clientId: parsed.clientId,
                nickname: parsed.nickname,
                content: parsed.content,
                timestamp: parsed.timestamp,
            });
        } catch (err) {
            onError?.(err);
        }
    }

    async close(): Promise<void> {
        await Promise.all([this.publisher.quit(), this.subscriber.quit()]);
    }
}

function isRedisPayload(value: unknown): value is RedisPayload {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const record = value as Record<string, unknown>;

    return (
        typeof record['id'] === 'string' &&
        typeof record['clientId'] === 'string' &&
        typeof record['nickname'] === 'string' &&
        typeof record['content'] === 'string' &&
        typeof record['timestamp'] === 'string'
    );
}

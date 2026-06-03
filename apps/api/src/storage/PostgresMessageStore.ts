import { Kysely, PostgresDialect, sql } from 'kysely';
import type { RawBuilder } from 'kysely';
import type { Pool } from 'pg';
import type { ChatMessage } from '@uxtweet/shared';
import type { IMessageStore } from './IMessageStore';

interface ChatMessagesTable {
    id: string;
    client_id: string;
    nickname: string;
    content: string;
    created_at: Date | string;
}

interface Database {
    chat_messages: ChatMessagesTable;
}

const DEFAULT_RETENTION_DAYS = 30;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // hourly

/**
 * PostgreSQL-backed message store with a simple retention policy.
 * Expired rows are pruned on startup and then on an hourly timer — never on
 * the write path, so message throughput doesn't pay for housekeeping. Reads
 * additionally filter by the retention cutoff, so a row past its window can
 * never be served between prune runs.
 *
 * Queries are built with Kysely for type-safe column access; the Postgres
 * dialect wraps the injected `pg` Pool, so connection lifecycle stays here.
 */
export class PostgresMessageStore implements IMessageStore {
    private readonly db: Kysely<Database>;
    private pruneTimer: ReturnType<typeof setInterval> | undefined;

    constructor(
        pool: Pool,
        private readonly retentionDays: number = DEFAULT_RETENTION_DAYS
    ) {
        this.db = new Kysely<Database>({
            dialect: new PostgresDialect({ pool }),
        });
    }

    async init(): Promise<void> {
        await this.db.schema
            .createTable('chat_messages')
            .ifNotExists()
            .addColumn('id', 'text', (col) => col.primaryKey())
            .addColumn('client_id', 'text', (col) => col.notNull())
            .addColumn('nickname', 'text', (col) => col.notNull())
            .addColumn('content', 'text', (col) => col.notNull())
            .addColumn('created_at', 'timestamptz', (col) => col.notNull())
            .execute();

        await this.db.schema
            .createIndex('chat_messages_created_at_idx')
            .ifNotExists()
            .on('chat_messages')
            .expression(sql`created_at DESC`)
            .execute();

        await this.pruneExpiredMessages();

        // unref(): a pending prune tick must not keep the process alive.
        this.pruneTimer = setInterval(() => {
            void this.pruneExpiredMessages().catch(() => {
                // Best-effort housekeeping; the next tick retries. Reads
                // filter by the cutoff, so stale rows are never served.
            });
        }, PRUNE_INTERVAL_MS);
        this.pruneTimer.unref?.();
    }

    async save(message: ChatMessage): Promise<void> {
        await this.db
            .insertInto('chat_messages')
            .values({
                id: message.id,
                client_id: message.clientId,
                nickname: message.nickname,
                content: message.content,
                created_at: message.timestamp,
            })
            .onConflict((oc) => oc.column('id').doNothing())
            .execute();
    }

    async getHistory(limit = 100): Promise<ChatMessage[]> {
        const rows = await this.db
            .selectFrom('chat_messages')
            .select(['id', 'client_id', 'nickname', 'content', 'created_at'])
            .where('created_at', '>=', this.retentionCutoff())
            .orderBy('created_at', 'desc')
            .limit(limit)
            .execute();

        return rows.reverse().map((row) => ({
            id: row.id,
            clientId: row.client_id,
            nickname: row.nickname,
            content: row.content,
            timestamp: toIsoTimestamp(row.created_at),
        }));
    }

    async clear(): Promise<void> {
        await sql`TRUNCATE TABLE chat_messages`.execute(this.db);
    }

    async close(): Promise<void> {
        if (this.pruneTimer !== undefined) {
            clearInterval(this.pruneTimer);
            this.pruneTimer = undefined;
        }
        await this.db.destroy();
    }

    private async pruneExpiredMessages(): Promise<void> {
        await this.db
            .deleteFrom('chat_messages')
            .where('created_at', '<', this.retentionCutoff())
            .execute();
    }

    private retentionCutoff(): RawBuilder<Date> {
        return sql<Date>`NOW() - make_interval(days => ${this.retentionDays})`;
    }
}

function toIsoTimestamp(value: Date | string): string {
    return value instanceof Date
        ? value.toISOString()
        : new Date(value).toISOString();
}

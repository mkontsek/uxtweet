import { createClient, type RedisClientType } from 'redis';
import type { ClientId } from '@uxtweet/shared';
import type { NicknameRegistry } from '../domain/NicknameRegistry';

const KEY_PREFIX = 'uxtweet:nick:';
/**
 * How long a claim survives without a refresh. Bounds how long a crashed pod's
 * nicknames stay reserved before they free automatically; the heartbeat below
 * keeps a live pod's claims from expiring mid-session.
 */
const DEFAULT_TTL_SECONDS = 60;
const REFRESH_INTERVAL_MS = 30_000;

// Compare-and-delete: only drop the key if it still belongs to this client, so a
// release can never evict a nickname another client has since claimed.
const RELEASE_SCRIPT =
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0";

// Compare-and-refresh: extend the TTL only while the key is still ours.
const REFRESH_SCRIPT =
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) end return 0";

/**
 * Redis-backed {@link NicknameRegistry}: nickname uniqueness across every pod.
 * A claim is a `SET key clientId NX EX ttl` keyed by the lowercased nickname, so
 * two pods can never both hold the same name. Live claims are refreshed on a
 * heartbeat; a pod that dies stops refreshing and its names free after the TTL.
 */
export class RedisNicknameRegistry implements NicknameRegistry {
    private readonly client: RedisClientType;
    // Keys this process currently holds, for the TTL refresh heartbeat.
    private readonly held = new Map<string, ClientId>();
    private refreshTimer: ReturnType<typeof setInterval> | null = null;

    constructor(
        redisUrl: string,
        private readonly ttlSeconds: number = DEFAULT_TTL_SECONDS
    ) {
        this.client = createClient({ url: redisUrl });
    }

    async connect(): Promise<void> {
        await this.client.connect();
        this.startRefresh();
    }

    async claim(clientId: ClientId, nickname: string): Promise<boolean> {
        const key = this.keyFor(nickname);
        const result = await this.client.set(key, clientId, {
            NX: true,
            EX: this.ttlSeconds,
        });
        if (result === 'OK') {
            this.held.set(key, clientId);
            return true;
        }
        // Idempotent re-claim by the same client (e.g. a join retry) refreshes
        // the TTL rather than failing.
        const current = await this.client.get(key);
        if (current === clientId) {
            await this.client.expire(key, this.ttlSeconds);
            this.held.set(key, clientId);
            return true;
        }
        return false;
    }

    async release(clientId: ClientId, nickname: string): Promise<void> {
        const key = this.keyFor(nickname);
        this.held.delete(key);
        await this.client.eval(RELEASE_SCRIPT, {
            keys: [key],
            arguments: [clientId],
        });
    }

    async close(): Promise<void> {
        if (this.refreshTimer !== null) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
        await this.client.quit();
    }

    private startRefresh(): void {
        const timer = setInterval(() => {
            void this.refreshHeld();
        }, REFRESH_INTERVAL_MS);
        // Don't let the heartbeat alone keep the event loop alive.
        timer.unref();
        this.refreshTimer = timer;
    }

    private async refreshHeld(): Promise<void> {
        for (const [key, clientId] of this.held) {
            await this.client.eval(REFRESH_SCRIPT, {
                keys: [key],
                arguments: [clientId, String(this.ttlSeconds)],
            });
        }
    }

    private keyFor(nickname: string): string {
        return `${KEY_PREFIX}${nickname.toLowerCase()}`;
    }
}

import type { ClientId } from '@uxtweet/shared';

/**
 * Coordinates nickname uniqueness. A port so the seam between a single-process
 * registry and a cross-pod (Redis) one stays in `buildApp`, leaving the
 * transport unaware of which backing it talks to. Methods are async so a
 * distributed implementation can await a round-trip; the local one resolves
 * synchronously.
 */
export interface NicknameRegistry {
    /**
     * Atomically claim `nickname` (compared case-insensitively) for `clientId`.
     * Resolves `true` when the claim is held by this client afterwards, `false`
     * when another client already holds it. Re-claiming a name this client
     * already holds is idempotent and resolves `true`.
     */
    claim(clientId: ClientId, nickname: string): Promise<boolean>;
    /**
     * Release a claim, but only if `clientId` still holds it — releasing a name
     * another client has since taken is a no-op.
     */
    release(clientId: ClientId, nickname: string): Promise<void>;
}

/**
 * In-process {@link NicknameRegistry}: uniqueness across the connections on a
 * single pod. This is the default (dev, or a one-replica deploy). For genuine
 * horizontal scaling, `buildApp` swaps in the Redis-backed registry so a name
 * is unique across every pod, not just locally.
 */
export class LocalNicknameRegistry implements NicknameRegistry {
    // Lowercased nickname -> owning client id.
    private readonly owners = new Map<string, ClientId>();

    claim(clientId: ClientId, nickname: string): Promise<boolean> {
        const key = nickname.toLowerCase();
        const current = this.owners.get(key);
        if (current !== undefined && current !== clientId) {
            return Promise.resolve(false);
        }
        this.owners.set(key, clientId);
        return Promise.resolve(true);
    }

    release(clientId: ClientId, nickname: string): Promise<void> {
        const key = nickname.toLowerCase();
        if (this.owners.get(key) === clientId) {
            this.owners.delete(key);
        }
        return Promise.resolve();
    }
}

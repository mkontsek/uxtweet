/** A live status for a roster entry, derived on the client from activity. */
export type UserStatus = 'online' | 'idle';

/**
 * A user shown in the live roster. Only clients that have claimed a nickname
 * appear. Times are ISO 8601 strings; `online`/`idle` is derived client-side
 * from `lastActivityAt` so it ages without extra socket traffic.
 */
export interface RosterEntry {
    nickname: string;
    connectedAt: string; // ISO 8601
    lastActivityAt: string; // ISO 8601
}

/** A roster entry is `idle` once it has been inactive for this long. */
export const USER_IDLE_THRESHOLD_MS = 2 * 60 * 1000;

/**
 * Derive a user's status from their last activity relative to `nowMs`.
 * Shared so the client and any future consumer agree on the same threshold.
 */
export function deriveUserStatus(
    entry: RosterEntry,
    nowMs: number
): UserStatus {
    const lastActivity = Date.parse(entry.lastActivityAt);
    if (Number.isNaN(lastActivity)) {
        return 'online';
    }
    if (nowMs - lastActivity >= USER_IDLE_THRESHOLD_MS) {
        return 'idle';
    }
    return 'online';
}

import { describe, expect, it } from 'vitest';
import { USER_IDLE_THRESHOLD_MS, deriveUserStatus } from '../roster';
import type { RosterEntry } from '../roster';

describe('deriveUserStatus', () => {
    const NOW = Date.parse('2026-06-12T12:00:00.000Z');

    function entry(lastActivityAt: string): RosterEntry {
        return {
            nickname: 'alice',
            connectedAt: '2026-06-12T11:00:00.000Z',
            lastActivityAt,
        };
    }

    it('reports online for recent activity', () => {
        const recent = new Date(NOW - 1000).toISOString();
        expect(deriveUserStatus(entry(recent), NOW)).toBe('online');
    });

    it('reports idle exactly at the threshold', () => {
        const atThreshold = new Date(
            NOW - USER_IDLE_THRESHOLD_MS
        ).toISOString();
        expect(deriveUserStatus(entry(atThreshold), NOW)).toBe('idle');
    });

    it('reports online just under the threshold', () => {
        const justUnder = new Date(
            NOW - USER_IDLE_THRESHOLD_MS + 1
        ).toISOString();
        expect(deriveUserStatus(entry(justUnder), NOW)).toBe('online');
    });

    it('falls back to online for an unparseable timestamp', () => {
        expect(deriveUserStatus(entry('not-a-date'), NOW)).toBe('online');
    });
});

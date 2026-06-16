import { describe, expect, it } from 'vitest';
import {
    NICKNAME_MAX_LENGTH,
    NICKNAME_MIN_LENGTH,
    validateNickname,
} from '../nickname';

describe('validateNickname', () => {
    it('accepts a simple nickname', () => {
        const result = validateNickname('alice');
        expect(result).toEqual({ ok: true, value: 'alice' });
    });

    it('trims surrounding whitespace but preserves casing', () => {
        const result = validateNickname('  Alice_42  ');
        expect(result).toEqual({ ok: true, value: 'Alice_42' });
    });

    it('accepts underscores and hyphens', () => {
        expect(validateNickname('a_b-c').ok).toBe(true);
    });

    it('accepts boundary lengths', () => {
        expect(validateNickname('a'.repeat(NICKNAME_MIN_LENGTH)).ok).toBe(true);
        expect(validateNickname('a'.repeat(NICKNAME_MAX_LENGTH)).ok).toBe(true);
    });

    it('rejects nicknames that are too short', () => {
        const result = validateNickname('ab');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toContain(`${NICKNAME_MIN_LENGTH}`);
        }
    });

    it('rejects nicknames that are too long', () => {
        const result = validateNickname('a'.repeat(NICKNAME_MAX_LENGTH + 1));
        expect(result.ok).toBe(false);
    });

    it('rejects whitespace-only input', () => {
        expect(validateNickname('   ').ok).toBe(false);
    });

    it('rejects inner whitespace and punctuation', () => {
        expect(validateNickname('ali ce').ok).toBe(false);
        expect(validateNickname('alice!').ok).toBe(false);
        expect(validateNickname('al@ce').ok).toBe(false);
    });

    it('measures length after trimming', () => {
        // 2 visible chars padded to 4 with spaces — still too short.
        expect(validateNickname(' ab ').ok).toBe(false);
    });
});

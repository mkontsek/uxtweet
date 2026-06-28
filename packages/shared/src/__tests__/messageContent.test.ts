import { describe, expect, it } from 'vitest';
import { MESSAGE_MAX_LENGTH, validateMessageContent } from '../messageContent';

describe('validateMessageContent', () => {
    it('accepts ordinary content and returns it trimmed', () => {
        expect(validateMessageContent('  hello world  ')).toEqual({
            ok: true,
            value: 'hello world',
        });
    });

    it('rejects empty content', () => {
        const result = validateMessageContent('');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toBe('Message content must not be empty.');
        }
    });

    it('rejects whitespace-only content', () => {
        expect(validateMessageContent('   ').ok).toBe(false);
    });

    it('accepts content of exactly the maximum length', () => {
        const result = validateMessageContent('x'.repeat(MESSAGE_MAX_LENGTH));
        expect(result.ok).toBe(true);
    });

    it('rejects content beyond the maximum length', () => {
        const result = validateMessageContent(
            'x'.repeat(MESSAGE_MAX_LENGTH + 1)
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toContain(`${MESSAGE_MAX_LENGTH}`);
        }
    });
});

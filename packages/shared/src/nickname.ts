import { z } from 'zod';

export const NICKNAME_MIN_LENGTH = 3;
export const NICKNAME_MAX_LENGTH = 20;

/** Letters, digits, underscore and hyphen — no whitespace or punctuation. */
export const NICKNAME_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * The single source of truth for nickname rules, expressed as a Zod schema so
 * the client and server validate against the exact same definition. `.trim()`
 * runs before the length/pattern checks, so length is measured after trimming;
 * uniqueness is compared case-insensitively elsewhere while the chosen casing
 * is preserved (the schema does not alter case).
 */
export const nicknameSchema = z
    .string()
    .trim()
    .min(NICKNAME_MIN_LENGTH, {
        message: `Nickname must be at least ${NICKNAME_MIN_LENGTH} characters.`,
    })
    .max(NICKNAME_MAX_LENGTH, {
        message: `Nickname must be at most ${NICKNAME_MAX_LENGTH} characters.`,
    })
    .regex(NICKNAME_PATTERN, {
        message: 'Use only letters, numbers, underscores and hyphens.',
    });

export type NicknameValidation =
    | { ok: true; value: string }
    | { ok: false; reason: string };

/**
 * Validate and normalise a raw nickname. Shared by client (instant feedback)
 * and server (authoritative gate) so both agree on the exact same rules.
 * Returns a discriminated result rather than throwing so callers stay branchy
 * without try/catch.
 */
export function validateNickname(raw: string): NicknameValidation {
    const result = nicknameSchema.safeParse(raw);
    if (result.success) {
        return { ok: true, value: result.data };
    }
    const [issue] = result.error.issues;
    return { ok: false, reason: issue?.message ?? 'Invalid nickname.' };
}

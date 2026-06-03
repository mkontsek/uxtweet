export const NICKNAME_MIN_LENGTH = 3;
export const NICKNAME_MAX_LENGTH = 20;

/** Letters, digits, underscore and hyphen — no whitespace or punctuation. */
export const NICKNAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export type NicknameValidation =
    | { ok: true; value: string }
    | { ok: false; reason: string };

/**
 * Validate and normalise a raw nickname. Shared by client (instant feedback)
 * and server (authoritative gate) so both agree on the exact same rules.
 * Trims surrounding whitespace but does not alter case — uniqueness is
 * compared case-insensitively elsewhere, while the chosen casing is preserved.
 */
export function validateNickname(raw: string): NicknameValidation {
    const value = raw.trim();

    if (value.length < NICKNAME_MIN_LENGTH) {
        return {
            ok: false,
            reason: `Nickname must be at least ${NICKNAME_MIN_LENGTH} characters.`,
        };
    }
    if (value.length > NICKNAME_MAX_LENGTH) {
        return {
            ok: false,
            reason: `Nickname must be at most ${NICKNAME_MAX_LENGTH} characters.`,
        };
    }
    if (!NICKNAME_PATTERN.test(value)) {
        return {
            ok: false,
            reason: 'Use only letters, numbers, underscores and hyphens.',
        };
    }

    return { ok: true, value };
}

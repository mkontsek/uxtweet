import { z } from 'zod';

/** Maximum length of a single chat message, in characters. */
export const MESSAGE_MAX_LENGTH = 2000;

/**
 * The single source of truth for chat message content rules, as a Zod schema.
 * `.trim()` runs first, so a message of only whitespace collapses to empty and
 * is rejected by `.min(1)`. The server's `MessageService` is the authoritative
 * gate; the client may use the same schema for instant feedback.
 */
export const messageContentSchema = z
    .string()
    .trim()
    .min(1, { message: 'Message content must not be empty.' })
    .max(MESSAGE_MAX_LENGTH, {
        message: `Message content must not exceed ${MESSAGE_MAX_LENGTH} characters.`,
    });

export type MessageContentValidation =
    | { ok: true; value: string }
    | { ok: false; reason: string };

/**
 * Validate and normalise raw chat message content (trimmed). Returns a
 * discriminated result; the trimmed value is what should be stored and sent.
 */
export function validateMessageContent(raw: string): MessageContentValidation {
    const result = messageContentSchema.safeParse(raw);
    if (result.success) {
        return { ok: true, value: result.data };
    }
    const [issue] = result.error.issues;
    return { ok: false, reason: issue?.message ?? 'Invalid message content.' };
}

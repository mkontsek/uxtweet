// Public entry for @uxtweet/shared. This file only re-exports; implementation
// lives in the concern-scoped modules beside it. Re-export named symbols
// explicitly (no `export *`) per the project conventions.

export type { ChatMessage, ClientId, MessageId } from './message';

export {
    NICKNAME_MAX_LENGTH,
    NICKNAME_MIN_LENGTH,
    NICKNAME_PATTERN,
    validateNickname,
} from './nickname';
export type { NicknameValidation } from './nickname';

export { USER_IDLE_THRESHOLD_MS, deriveUserStatus } from './roster';
export type { RosterEntry, UserStatus } from './roster';

export type {
    ClientJoinMessage,
    ClientSendMessage,
    ClientWsMessage,
    ServerChatMessage,
    ServerErrorCode,
    ServerErrorMessage,
    ServerJoinedMessage,
    ServerUserCountMessage,
    ServerUserListMessage,
    ServerWelcomeMessage,
    ServerWsMessage,
} from './protocol';

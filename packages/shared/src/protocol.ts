import type { ChatMessage, ClientId } from './message';
import type { RosterEntry } from './roster';

// ---------------------------------------------------------------------------
// WebSocket protocol messages (client → server)
// ---------------------------------------------------------------------------

export interface ClientJoinMessage {
    type: 'join';
    nickname: string;
}

export interface ClientSendMessage {
    type: 'send';
    content: string;
}

export type ClientWsMessage = ClientJoinMessage | ClientSendMessage;

// ---------------------------------------------------------------------------
// WebSocket protocol messages (server → client)
// ---------------------------------------------------------------------------

export interface ServerWelcomeMessage {
    type: 'welcome';
    clientId: ClientId;
    history: ChatMessage[];
    userCount: number;
    users: RosterEntry[];
}

export interface ServerJoinedMessage {
    type: 'joined';
    nickname: string;
}

export interface ServerChatMessage {
    type: 'chat';
    message: ChatMessage;
}

export interface ServerUserCountMessage {
    type: 'user_count';
    count: number;
}

export interface ServerUserListMessage {
    type: 'user_list';
    users: RosterEntry[];
}

/** Machine-readable error codes so the client can react to specific failures. */
export type ServerErrorCode =
    | 'nickname_taken'
    | 'invalid_nickname'
    | 'not_joined'
    | 'invalid_message';

export interface ServerErrorMessage {
    type: 'error';
    message: string;
    code?: ServerErrorCode;
}

export type ServerWsMessage =
    | ServerWelcomeMessage
    | ServerJoinedMessage
    | ServerChatMessage
    | ServerUserCountMessage
    | ServerUserListMessage
    | ServerErrorMessage;

/** Unique identifier for a chat message. */
export type MessageId = string;

/** Unique identifier for a connected client. */
export type ClientId = string;

/** A single chat message stored and transmitted by the server. */
export interface ChatMessage {
    id: MessageId;
    clientId: ClientId;
    nickname: string;
    content: string;
    timestamp: string; // ISO 8601
}

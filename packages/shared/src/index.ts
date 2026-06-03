/** Unique identifier for a chat message. */
export type MessageId = string;

/** Unique identifier for a connected client. */
export type ClientId = string;

/** A single chat message stored and transmitted by the server. */
export interface ChatMessage {
  id: MessageId;
  clientId: ClientId;
  content: string;
  timestamp: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// WebSocket protocol messages (client → server)
// ---------------------------------------------------------------------------

export interface ClientSendMessage {
  type: 'send';
  content: string;
}

export type ClientWsMessage = ClientSendMessage;

// ---------------------------------------------------------------------------
// WebSocket protocol messages (server → client)
// ---------------------------------------------------------------------------

export interface ServerWelcomeMessage {
  type: 'welcome';
  clientId: ClientId;
  history: ChatMessage[];
  userCount: number;
}

export interface ServerChatMessage {
  type: 'chat';
  message: ChatMessage;
}

export interface ServerUserCountMessage {
  type: 'user_count';
  count: number;
}

export interface ServerErrorMessage {
  type: 'error';
  message: string;
}

export type ServerWsMessage =
  | ServerWelcomeMessage
  | ServerChatMessage
  | ServerUserCountMessage
  | ServerErrorMessage;

# Domain

## Vocabulary

- **Client** — a connected browser session. Identified by a server-assigned UUID
  `clientId` (`ClientId`), valid only for the life of the socket; not a user
  account (there is no auth).
- **Nickname** — a human-chosen display name a client claims via `join` before it
  can post. Unique (case-insensitive) among **currently-connected** clients —
  per-pod with the local registry, or across **all** pods when Redis backs the
  `NicknameRegistry` (ADR-0015); the chosen casing is preserved for display. 3–20
  chars, matching `[A-Za-z0-9_-]+`. Freed when the holder disconnects. The browser
  remembers the chosen name in `localStorage` and re-claims it after a reload
  (ADR-0016) — but it is not reserved server-side while disconnected.
- **Message** — a single chat line (`ChatMessage`): `id` (UUID), `clientId`
  (author), `nickname` (author's display name), `content` (string), `timestamp`
  (ISO 8601 string).
- **History** — the most recent messages, persisted in PostgreSQL with a 30-day
  retention window; `welcome` sends the last 50, `getHistory` defaults to 100.
  Durable across restarts (and shared across pods via the same database).
- **User count** — number of currently-open connections on **this** server pod.
- **Roster** — the live list of **named** users on **this** pod (one `RosterEntry`
  per client that has claimed a nickname). Anonymous, not-yet-joined connections are
  excluded. Like the user count, it is per-pod and lost on restart.
- **Status** — a roster entry's `online`/`idle` state. It is **not** sent by the
  server; the client derives it from `lastActivityAt` vs `USER_IDLE_THRESHOLD_MS`.

## Entities (source: `packages/shared/src/index.ts`)

```ts
type MessageId = string;
type ClientId = string;

interface ChatMessage {
    id: MessageId;
    clientId: ClientId;
    nickname: string;
    content: string;
    timestamp: string; // ISO 8601
}

const NICKNAME_MIN_LENGTH = 3;
const NICKNAME_MAX_LENGTH = 20;
const NICKNAME_PATTERN = /^[A-Za-z0-9_-]+$/;
// nicknameSchema (Zod) is the source of truth; validateNickname(raw) wraps it →
//   { ok: true; value } | { ok: false; reason }
// Shared by client (instant feedback) and server (authoritative gate).

const MESSAGE_MAX_LENGTH = 2000;
// messageContentSchema (Zod) — trim, non-empty, ≤ MESSAGE_MAX_LENGTH;
// validateMessageContent(raw) wraps it with the same discriminated result.

type UserStatus = 'online' | 'idle';

interface RosterEntry {
    nickname: string;
    connectedAt: string; // ISO 8601
    lastActivityAt: string; // ISO 8601
}

const USER_IDLE_THRESHOLD_MS = 2 * 60 * 1000;
// deriveUserStatus(entry, nowMs) → 'idle' once inactive ≥ threshold, else 'online'.
// Status lives only on the client; the server ships times, the client ages them.
```

`@uxtweet/shared` is the single source of truth for these types and for the wire
protocol below. Both apps import from it; neither redefines a frame locally.

## Wire protocol (WebSocket `/ws`)

### Client → server (`ClientWsMessage`)

| `type` | Fields             | Meaning                                  |
| ------ | ------------------ | ---------------------------------------- |
| `join` | `nickname: string` | Claim a nickname; required before `send` |
| `send` | `content: string`  | Post a message to the room               |

### Server → client (`ServerWsMessage`)

| `type`       | Fields                                                                            | Meaning                                                         |
| ------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `welcome`    | `clientId`, `history: ChatMessage[]`, `userCount: number`, `users: RosterEntry[]` | First frame after connect — identity + backlog + count + roster |
| `joined`     | `nickname: string`                                                                | `join` accepted — client may now post                           |
| `chat`       | `message: ChatMessage`                                                            | A new message to append                                         |
| `user_count` | `count: number`                                                                   | Live count changed (join/leave/new message)                     |
| `user_list`  | `users: RosterEntry[]`                                                            | Roster membership changed (a `join`, or a named leave)          |
| `error`      | `message: string`, `code?: ServerErrorCode`                                       | A handled error; `code` lets the client react                   |

`ServerErrorCode` is one of `nickname_taken`, `invalid_nickname`, `not_joined`,
`invalid_message`. The landing screen keys off `nickname_taken` / `invalid_nickname`
to keep the user on the nickname form instead of entering the chat.

Unknown inbound types and malformed JSON are answered with an `error` frame and
otherwise ignored — never crash the connection.

## Business rules

- **Nickname required before posting**: a `send` from a client that has not
  `join`ed is rejected with `error` code `not_joined`. The transport looks up the
  claimed nickname in `ConnectionManager` and stamps it on each `ChatMessage`.
- **Nickname uniqueness** (authoritative in the `NicknameRegistry`): a name is
  claimed case-insensitively before it is assigned — by `LocalNicknameRegistry`
  per-pod, or `RedisNicknameRegistry` across pods (`SET … NX`); a clash returns
  `error` code `nickname_taken` and the name is released on disconnect.
  `validateNickname` (Zod, in `@uxtweet/shared`) enforces the length/charset rules
  and yields `invalid_nickname`. See [[Decisions]] (ADR-0015).
- **Content validation** (rules in the shared `messageContentSchema`; the single
  domain gate is `MessageService.createMessage`): trimmed content must be non-empty
  and ≤ **2000** characters; violations throw `MessageValidationError` and surface
  to the offending client as an `error` frame with code `invalid_message`. Any
  other failure while creating a message (store or bus) is logged server-side and
  masked behind a generic `error` frame — internal error text never reaches clients.
- **History retention**: PostgreSQL keeps messages for **30 days** (configurable
  via `MESSAGE_HISTORY_RETENTION_DAYS`); expired rows are pruned at startup and
  then hourly — never on the write path — and reads filter by the retention
  cutoff, so an expired row is never served between prune runs. History is
  **durable across restarts** and shared by every process pointed at the same
  database — see [[Decisions]] (ADR-0012).
- **Identity is ephemeral**: a new `clientId` is minted per connection. Reconnects
  get a new id; there is no session continuity. The client does, however, remember
  the chosen nickname (in `localStorage`) and **re-sends `join`** automatically on
  reconnect _and after a page reload_, so a dropped socket or refresh transparently
  re-claims the same name (if still free) — see [[Decisions]] (ADR-0016).
- **Defence in depth**: the client `maxlength=2000` and server `maxPayload` (64
  KiB) guard the same limit, but the shared `messageContentSchema` is the source of
  truth and `MessageService` is the single gate. Add new content rules to the
  schema in `@uxtweet/shared`.
- **Roster fan-out**: a `user_list` is broadcast only when roster membership
  changes — a successful `join` and the disconnect of a _named_ client — never on
  the per-message path. The client keeps a chatting user "online" by freshening
  that entry's `lastActivityAt` from each incoming `chat` frame. See [[Decisions]]
  (ADR-0011).

## Non-goals (today)

No authentication, no private rooms/DMs, no message editing/deletion. See [[Decisions]] for
what it would take to add these.

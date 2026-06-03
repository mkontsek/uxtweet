# UI Guide — UXTweet chat client

UXTweet is a focused real-time chat UI, not a marketing site. Keep the interface
calm, legible, and out of the way of the conversation. This maps 1:1 to the
Quasar (Vue 3) component tree in `apps/web/src`.

## 1. Component structure

One Quasar concern per `.vue` file, named in PascalCase:

- `MainLayout` — app shell: header bar, connection status, `<router-view>`.
- `ChatPage` — composes the message list and input for the `/` route.
- `MessageList` — scrollable history; own-vs-other message alignment.
- `MessageInput` — text field + send button, disabled while disconnected.
- `ConnectionStatus` — live connection state + user count indicator.

State (messages, status, userCount, clientId) comes from the `useChat`
composable via `inject('chat')`. Components stay presentational — they render
props and emit intent (`@send`), they do not own sockets.

## 2. Visual language

- Use Quasar components (`q-page`, `q-input`, `q-btn`, `q-separator`, `q-item`)
  and the Material icon set (`extras: ['material-icons']`). Do not handcraft SVG
  icons unless explicitly requested.
- Colour: lean on Quasar's `primary` for actions and the default surface
  palette. Distinguish own messages from others by alignment + a subtle tint,
  not loud colour.
- Density: prefer `dense` inputs and tight gutters (`q-gutter-sm`,
  `q-pa-sm`) — the message stream is the hero, chrome is minimal.

## 3. State feedback

- **Connection** is always visible (`ConnectionStatus`): `connecting`, `open`,
  `closed`, `error` map to clear text + colour; never leave the user guessing
  whether the socket is live.
- **Disabled affordances**: the send button and input disable when the socket is
  not `open` and when the trimmed message is empty (`canSend`).
- **Transient errors** (`error` frames, parse failures) surface via Quasar
  `Notify`, not console-only — but never block the input.

## 4. Motion

Keep motion minimal and functional:

- New messages append without layout jank; keep the list scrolled to newest.
- Use Quasar's built-in transitions; durations 150–250 ms. No decorative
  parallax or scroll-reveal — this is a live tool, not a landing page.

## 5. Accessibility & testability

- Every interactive element carries a stable `data-cy` (e.g.
  `message-input-field`, `message-send-button`, `chat-page`) for e2e selectors.
- Inputs are reachable and submittable by keyboard (Enter to send).

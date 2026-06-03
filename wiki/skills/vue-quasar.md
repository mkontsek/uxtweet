# Vue + Quasar Skill

Conventions for the `apps/web` SPA (Vue 3 + Quasar 2, Vite). Cross-cutting TS
rules live in `typescript.md`; UI/visual rules in `.github/design-guide.md`.

## Components

- **One component per `.vue` file**, named in `PascalCase`. The filename matches
  the component (`MessageList.vue` → `MessageList`).
- Composition API with **`<script lang="ts" setup>`** only — no Options API, no
  `defineComponent` boilerplate.
- Type props and emits with the generic forms; do **not** hand-roll runtime
  objects:

    ```ts
    const props = defineProps<{ isConnected: boolean }>();
    const emit = defineEmits<{ send: [content: string] }>();
    ```

- Keep components **presentational**. They render props and emit intent; they do
  not open sockets, fetch, or own cross-view state.
- Derive view state with `computed`; keep template expressions trivial (one-line
  ternaries at most — see `typescript.md`).

## State & data

- **Shared connection/chat state lives in the `useChat` composable**
  (`composables/useChat.ts`), which owns the WebSocket lifecycle and exposes
  **read-only** refs (`readonly(...)`) plus action functions.
- `MainLayout` creates the chat instance once and provides it under a typed
  `CHAT_INJECTION_KEY`; pages read it via the `useChatContext()` accessor (which
  injects and throws if the provider is missing) — never a string key. Do not
  call `useChat` again in child components — there is one socket per tab. See
  the typed provide/inject pattern in `vue-best-practices.md`.
- Pinia is available for additional shared stores; prefer a focused store or
  composable over a monolith. Keep socket ownership in `useChat`.

## Composables

- Name `useXxx`, return an explicit typed interface (`UseChatReturn`).
- Own their teardown: register `onUnmounted` cleanup (close sockets, clear
  timers) inside the composable, not in consumers.
- Side-effecting singletons (the socket) stay inside; expose intent, not the raw
  socket.

## Quasar usage

- Use Quasar components (`q-page`, `q-layout`, `q-input`, `q-btn`, `q-list`,
  `q-scroll-area`, `q-chip`) and the Material icon set (`extras: ['material-icons']`).
- Surface transient errors via the `Notify` plugin (registered in
  `quasar.config.ts`), not `console` alone.
- Config and boot files use `export default` (framework requirement) — the only
  permitted defaults in the client.
- Build/runtime config (e.g. `WS_URL`) flows through `quasar.config.ts` `build.env`
  and `process.env`; do not hardcode the socket URL in components.

## Testing & selectors

- Every interactive or asserted element gets a stable `data-cy` attribute
  (`message-input-field`, `message-send-button`, `chat-page`).
- Test composables and components with Vitest + `@vue/test-utils` + jsdom (see
  `testing.md`).

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

- **Shared connection/chat state lives in the Pinia chat store**
  (`stores/chat.ts`, `useChatStore`), which owns the WebSocket lifecycle and
  exposes reactive state plus action functions. Read state with
  `storeToRefs(useChatStore())`; call actions on the store.
- `MainLayout` reads the store and owns the connection lifecycle (`connect()` on
  `onMounted`, `disconnect()` on `onUnmounted`) — a store has no lifecycle of its
  own. There is one socket per tab; do not open another downstream. See the store
  pattern in `vue-best-practices.md`.
- Add further shared state as focused Pinia stores; prefer a focused store or
  composable over a monolith. Any _non-store_ cross-tree sharing uses a typed
  `InjectionKey`, never a string key.

## Composables & stores

- Name composables `useXxx`, return an explicit typed shape; name Pinia stores
  `useXxxStore` (`defineStore`), e.g. the chat store (`ChatStore`).
- Own their teardown: a composable registers `onUnmounted` cleanup (close sockets,
  clear timers) itself. A Pinia store has **no** lifecycle, so its lifecycle owner
  (`MainLayout` for the chat store) calls the store's teardown action
  (`disconnect`) from `onUnmounted`.
- Side-effecting singletons (the socket) stay inside the store/composable; expose
  intent (actions), not the raw socket.

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

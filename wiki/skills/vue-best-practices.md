# Vue Best Practices Skill

Idiomatic Vue 3 (Composition API) patterns for `apps/web`, beyond the baseline
conventions in [[vue-quasar]]. That file covers _what_ to use (SFC + `<script
setup>`, typed props/emits, composables, Quasar components); this file covers the
_how_ — the patterns that keep components correct, typed, and decoupled. TS rules
live in [[typescript]]. When a rule here is non-obvious, the codebase already
follows it — read the cited file before changing it.

This file is the authoritative source. It is mirrored as an invokable skill at
`.claude/skills/vue-best-practices/SKILL.md`, which carries only a lean summary
and defers here for the full detail — keep the two in sync when this file
changes.

## Typed provide / inject

Cross-tree state is shared with a typed **`InjectionKey`**, never a magic string.
The key carries the value type, so consumers need no per-call generic and no
repeated null-check. Pair every provided value with an **accessor composable**
that injects once and throws a clear error when the provider is missing.

```ts
// composables/useChat.ts
export const CHAT_INJECTION_KEY: InjectionKey<UseChatReturn> = Symbol('chat');

export function useChatContext(): UseChatReturn {
    const chat = inject(CHAT_INJECTION_KEY);
    if (!chat) {
        throw new Error('Chat context not provided. Wrap with MainLayout.');
    }
    return chat;
}
```

```ts
// provider — layouts/MainLayout.vue
provide(CHAT_INJECTION_KEY, chat);

// consumer — any page/component
const chat = useChatContext();
```

- **Never** `provide('chat', …)` / `inject<T>('chat')` with a string key — it is
  untyped and duplicates the missing-provider guard at every call site.
- One provider owns the instance (`MainLayout` creates the single socket); do not
  call `useChat()` again downstream. See [[vue-quasar]] § State & data.

## One-way data flow

- Props are **read-only**. Never mutate a prop or a value reached through one;
  emit an event and let the owner change it (`MessageInput` emits `send`, never
  writes parent state).
- Composables expose `readonly(...)` refs plus action functions. Consumers read
  refs and call actions — they never reassign the refs.
- State flows **down** (props / injected refs), intent flows **up** (emits /
  action calls). A component that needs to "change" shared state calls an action,
  it does not reach in.

## computed vs watch

- Derive values with **`computed`** — pure, cached, no manual syncing
  (`canSend`, `chipLabel`, `headerTitle`).
- Reserve **`watch` / `watchEffect`** for _side effects_ that leave the reactive
  graph: imperative DOM (`document.title`), routing (`router.push` on
  `hasJoined`), scrolling a `q-scroll-area` after new messages.
- Do **not** use a `watch` to copy one ref into another — that is a `computed`.
- Keep template expressions trivial; push any real logic into a `computed`
  (one-line ternaries max — see [[typescript]]).

## Effects own their teardown

- Whatever creates an effect cleans it up: sockets, timers, and listeners are
  closed in `onUnmounted` **inside the composable**, never in consumers
  (`useChat` clears its reconnect timer and closes the socket itself).
- `watch`/`watchEffect` that add external listeners return a cleanup function.
- Lifecycle hooks, `inject`, `provide`, and `useRouter` must be called
  **synchronously at the top of `setup`** — never after `await`, never inside a
  branch or callback, or Vue cannot associate them with the instance.

## Lists and keys

- `v-for` always carries a **stable, unique `:key`** tied to identity
  (`message.id`), never the array index — index keys corrupt state and
  transitions on reorder/insert.
- Transitions (`<transition-group>`) rely on those identity keys to animate
  correctly.

## Template refs and DOM

- Type template refs to the concrete component/element and allow `null`
  (`ref<QScrollArea | null>(null)`); guard before use, since the ref is `null`
  until mount.
- Touch the DOM only after `nextTick()` when it depends on a just-applied reactive
  change (e.g. scroll-to-bottom after appending a message).

## Routing

- Route components are **lazily imported** (`component: () => import(...)`) for
  per-route code-splitting (`router/routes.ts`). Keep new routes lazy.
- Navigation guards live in the router or page setup, not in presentational
  child components.

## Accessibility & motion

- Every interactive or asserted element gets a stable `data-cy` (see
  [[vue-quasar]], [[testing]]).
- Wrap non-essential animation in `@media (prefers-reduced-motion: reduce)` and
  disable it there (landing/message transitions already do).

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

## Shared state: the Pinia store

Cross-tree state (the chat connection + its reactive data) lives in a **Pinia
setup store**, `useChatStore` (`stores/chat.ts`), installed via `boot/pinia.ts`.
Components read it directly — no provide/inject plumbing (ADR-0016).

```ts
// consumer — any page/component
const chat = useChatStore();
const { status, hasJoined } = storeToRefs(chat); // state: keep refs reactive
chat.join(nickname); // actions: call on the store object
```

- Read reactive **state/getters via `storeToRefs`**; only **actions** are safe to
  destructure. `const { status } = chat` snapshots the value and **loses
  reactivity** — don't.
- One store instance owns the single socket. Because a store has no component
  lifecycle, **`MainLayout` drives it**: `connect()` in `onMounted`, `disconnect()`
  in `onUnmounted`. Do not open a second connection downstream.
- If you ever need plain `provide/inject` (not a store), still use a typed
  **`InjectionKey`** symbol with an accessor that throws when the provider is
  missing — **never** a magic string `provide('chat', …)` / `inject<T>('chat')`.
  See [[vue-quasar]] § State & data.

## One-way data flow

- Props are **read-only**. Never mutate a prop or a value reached through one;
  emit an event and let the owner change it (`MessageInput` emits `send`, never
  writes parent state).
- The chat store (and any composable) exposes reactive state plus action
  functions. Consumers read state (via `storeToRefs` for a store) and call actions
  — they never reassign the refs.
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
  closed in `onUnmounted` by the **owner** of the effect. The chat store has no
  lifecycle, so `MainLayout` (its lifecycle owner) calls `disconnect()` in
  `onUnmounted` to close the socket and clear the reconnect timer; a composable
  that creates an effect tears it down in its own `onUnmounted`.
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

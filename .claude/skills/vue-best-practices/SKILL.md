---
name: vue-best-practices
description: Use when writing or reviewing Vue 3 code in apps/web — components, composables, provide/inject, props/emits, watchers, routing. Enforces idiomatic Composition API patterns (typed inject keys, one-way data flow, effect teardown). Triggers on changes to .vue/.ts files under apps/web, or requests like "add a component", "share state across components", "fix this watcher", "review the Vue code".
---

# Vue Best Practices

Idiomatic Vue 3 (Composition API) patterns for `apps/web`, beyond the baseline
conventions in `wiki/skills/vue-quasar.md`. **The authoritative, detailed version
of this skill — with full rationale and examples — lives in
`wiki/skills/vue-best-practices.md`; read it before any non-trivial change.** This
file is the lean, invokable summary.

## The rules at a glance

- **Typed provide/inject.** Share cross-tree state with a typed `InjectionKey`
  symbol, never a magic string. Pair every provided value with an accessor
  composable that injects once and throws if the provider is missing
  (`CHAT_INJECTION_KEY` + `useChatContext()` in `composables/useChat.ts`). Never
  `provide('chat', …)` / `inject<T>('chat')`.
- **One-way data flow.** Props are read-only — never mutate a prop or a value
  reached through one; emit intent and let the owner change it. Composables expose
  `readonly(...)` refs plus actions; state flows down, intent flows up.
- **`computed` over `watch`.** Derive values with `computed`; reserve
  `watch`/`watchEffect` for genuine side effects (DOM title, routing, scrolling).
  Never `watch` to copy one ref into another.
- **Effects own their teardown.** Sockets, timers, and listeners are cleaned up in
  `onUnmounted` inside the composable that created them, never in consumers. Call
  lifecycle hooks, `inject`, `provide`, `useRouter` synchronously at the top of
  `setup` — never after `await` or inside a branch.
- **Stable list keys.** `v-for` always keys on identity (`message.id`), never the
  array index — index keys corrupt state and transitions on insert/reorder.
- **Typed template refs.** Type to the concrete component/element and allow `null`
  (`ref<QScrollArea | null>(null)`); guard before use. Touch the DOM only after
  `nextTick()`.
- **Lazy routes.** Route components stay dynamically imported for code-splitting.
- **Presentational components.** Components render props and emit intent — they do
  not open sockets, fetch, own cross-view state, or call `window.location.reload`.
  Data/connection logic lives in composables.
- **Selectors & motion.** Stable `data-cy` on interactive/asserted elements; wrap
  non-essential animation in `@media (prefers-reduced-motion: reduce)`.

See `wiki/skills/vue-best-practices.md` for the full treatment and
`wiki/skills/vue-quasar.md` for the baseline component/Quasar conventions.

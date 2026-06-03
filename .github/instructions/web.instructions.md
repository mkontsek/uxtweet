---
applyTo: 'apps/web/**'
---

# Web app (apps/web) — Copilot instructions

Frontend SPA: Quasar (Vue 3 + Vite). These rules are enforced; the authoritative
detail lives in `wiki/skills/vue-quasar.md` (conventions) and
`wiki/skills/vue-best-practices.md` (idiomatic patterns). The repo-wide rules in
`CLAUDE.md` also apply.

## Do

- One component per `.vue` file, `<script lang="ts" setup>`, Composition API.
- Type props/emits with the generic forms (`defineProps<...>()` / `defineEmits<...>()`).
- Share cross-tree state with a typed `InjectionKey` + an accessor composable
  (`CHAT_INJECTION_KEY` + `useChatContext()`), never a string inject key.
- Keep components **presentational** — they render props and emit intent.
  Connection/data logic lives in composables (`useChat`).
- One-way data flow: props are read-only; emit to change parent state.
- Derive with `computed`; reserve `watch`/`watchEffect` for genuine side effects
  (DOM title, routing, scrolling). Effects clean up in `onUnmounted` inside the
  composable that owns them.
- `v-for` keys on stable identity (`message.id`), never the array index.
- Type template refs and allow `null`; touch the DOM only after `nextTick()`.
- Keep route components lazily imported. Add a stable `data-cy` to interactive
  elements. Use Quasar components + Material icons.

## Never

- **Never fetch, open sockets, or touch `window.location` in a component** — no
  `window.location.reload()`; refresh state reactively.
- **No test-data generators, "generate N messages" buttons, or feature-flagged
  dev panels** in app/UI code. Unit/component tests are co-located in `__tests__/`
  folders beside the file under test (e.g.
  `src/composables/__tests__/useChat.test.ts`); fixtures belong there.
- **No HTTP/REST calls for chat data.** Messages and history flow over the
  WebSocket (`useChat`); history arrives in the `welcome` frame. A new network
  surface is an architectural change needing an ADR first.
- No `any`, no magic-string inject keys, no loosening `tsconfig`.
- Do not redefine WebSocket frame shapes — import them from `@uxtweet/shared`.

Files are max 300 lines (`.ts`/`.vue`, tests excluded). Named exports only
(`export default` reserved for SFCs / Quasar config).

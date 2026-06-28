# UXTweet — Knowledge Base

Real-time public chat: a Quasar (Vue 3) SPA talks over a WebSocket to a Fastify
server that broadcasts messages and a live user count to everyone connected.
Built as a coding exercise with a local k3s deployment (Redis + PostgreSQL +
kube-prometheus-stack) and a production-shaped build story.

## Map

| Page             | What's in it                                                   |
| ---------------- | -------------------------------------------------------------- |
| [[Architecture]] | Components, the client↔server WebSocket flow, layer boundaries |
| [[Domain]]       | Vocabulary, entities, the wire protocol, validation rules      |
| [[Decisions]]    | ADR log — why PostgreSQL-only, why hexagonal, why k3s/HPA      |
| [[Operations]]   | Local dev, build, test, Docker images, local k3s deploy        |
| [[Conventions]]  | Project-specific naming, structure, and code rules             |

## Skill files (`wiki/skills/`)

Detailed, authoritative implementation rules:

- [[wiki]] — how to maintain this knowledge base
- [[architecture-update]] — when/how to update the wiki on architectural change
- [[vue-quasar]] — Vue 3 + Quasar client conventions
- [[vue-best-practices]] — idiomatic Vue 3 patterns (Pinia store state, data flow, effects)
- [[fastify-websockets]] — server domain/storage/transport conventions
- [[typescript]] — TypeScript rules
- [[testing]] — Vitest patterns
- [[lint-and-format]] — commit-ready gate
- [[locked-versions]] — exact dependency pinning
- [[docker-builds]] — minimal multi-stage images
- [[caveman]] — compressed response mode (on request)

## Current status

Single-room public chat. Users pick a nickname on a landing screen
(case-insensitive uniqueness — per-pod, or cross-pod when Redis backs the
`NicknameRegistry`) before entering the room; messages are labelled by nickname.
The chosen name is remembered in `localStorage`, so a reload re-joins without
retyping. Client state lives in a **Pinia** store; input rules (nickname, message
content) are **Zod** schemas in `@uxtweet/shared`. Messages are always persisted in
PostgreSQL (30-day retention) — `pnpm dev` starts it via Docker Compose, so history
survives restarts; the k3s deploy adds Redis Pub/Sub for cross-pod broadcast. The
deployment scales the **connection** tier horizontally (HPA; 1→4 locally, higher in
prod). Runs on local k3s (`infra/k3s-local/`) with **kube-prometheus-stack**
monitoring and a server `/metrics` endpoint — see [[Operations]].

## Acceptance bar

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — the same gate CI runs.

/**
 * Named WebSocket ready states, so connection checks read as
 * `=== WS_READY_STATE.OPEN` instead of a bare `=== 1 /* OPEN *\/`.
 *
 * The values match the WHATWG `WebSocket.readyState` / `ws` contract. Defining
 * them here (rather than importing the socket library's static constants) keeps
 * the domain transport-agnostic — no `@fastify/websocket` value import below
 * `transport/`.
 */
export const WS_READY_STATE = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
} as const;

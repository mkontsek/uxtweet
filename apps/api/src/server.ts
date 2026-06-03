import { buildApp } from './app';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';

const app = await buildApp();

// How long to keep serving existing WebSocket clients after SIGTERM before
// closing the listener. The pod's readiness flips to failing immediately so no
// new connections arrive; this window lets in-flight clients finish (and lets
// the k8s endpoint removal propagate) before the sockets are dropped. Bound it
// below the manifest's terminationGracePeriodSeconds so k8s never SIGKILLs mid-drain.
const DRAIN_DELAY_MS = parseInt(
    process.env['SHUTDOWN_DRAIN_MS'] ?? '15000',
    10
);

// k8s sends SIGTERM on pod shutdown; mark the pod draining, give existing
// clients a grace window, then close the listener and let the onClose hook
// flush Postgres/Redis connections before the process exits.
let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        app.log.info({ signal, drainMs: DRAIN_DELAY_MS }, 'Shutting down');
        app.markDraining();

        const drainTimer = setTimeout(() => {
            app.close().then(
                () => process.exit(0),
                (err: unknown) => {
                    app.log.error(err, 'Error during shutdown');
                    process.exit(1);
                }
            );
        }, DRAIN_DELAY_MS);
        // Don't let the drain timer alone keep the event loop alive.
        drainTimer.unref();
    });
}

try {
    await app.listen({ port: PORT, host: HOST });
} catch (err) {
    app.log.error(err);
    process.exit(1);
}

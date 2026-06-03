import LogRocket from 'logrocket';
import type { App } from 'vue';

// LogRocket session-replay analytics. The app ID is a public, client-side
// identifier baked in at build time (see quasar.config build.env). Kept behind
// these named helpers so the rest of the app never imports the SDK directly.
const APP_ID = process.env.LOGROCKET_APP_ID;

let initialized = false;

// Only run in production builds — `pnpm dev` should not pollute analytics with
// local sessions. Wires Vue's error handler to capture uncaught component errors.
export function initAnalytics(app: App): void {
    if (initialized || !APP_ID || process.env.NODE_ENV !== 'production') {
        return;
    }

    LogRocket.init(APP_ID);
    initialized = true;

    const previousErrorHandler = app.config.errorHandler;
    app.config.errorHandler = (err, instance, info): void => {
        if (err instanceof Error) {
            LogRocket.captureException(err);
        }
        if (previousErrorHandler) {
            previousErrorHandler(err, instance, info);
        }
    };
}

// Label the anonymous session with the chosen nickname (no account exists).
export function identifyUser(nickname: string): void {
    if (!initialized) {
        return;
    }
    LogRocket.identify(nickname, { nickname });
}

export function trackEvent(name: string): void {
    if (!initialized) {
        return;
    }
    LogRocket.track(name);
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { App } from 'vue';

// LogRocket is the external boundary — fake the whole SDK.
vi.mock('logrocket', () => ({
    default: {
        init: vi.fn(),
        identify: vi.fn(),
        track: vi.fn(),
        captureException: vi.fn(),
    },
}));

async function loadLogRocket(): Promise<{
    init: ReturnType<typeof vi.fn>;
    identify: ReturnType<typeof vi.fn>;
    track: ReturnType<typeof vi.fn>;
    captureException: ReturnType<typeof vi.fn>;
}> {
    const mod = (await import('logrocket')) as unknown as {
        default: {
            init: ReturnType<typeof vi.fn>;
            identify: ReturnType<typeof vi.fn>;
            track: ReturnType<typeof vi.fn>;
            captureException: ReturnType<typeof vi.fn>;
        };
    };
    return mod.default;
}

describe('analytics', () => {
    beforeEach(() => {
        vi.resetModules();
        // The mocked SDK persists across resetModules, so reset call history too.
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('stays inert outside production (no init, no identify/track)', async () => {
        const LogRocket = await loadLogRocket();
        const { initAnalytics, identifyUser, trackEvent } =
            await import('../analytics');

        initAnalytics({ config: {} } as unknown as App);
        identifyUser('alice');
        trackEvent('joined');

        expect(LogRocket.init).not.toHaveBeenCalled();
        expect(LogRocket.identify).not.toHaveBeenCalled();
        expect(LogRocket.track).not.toHaveBeenCalled();
    });

    it('initialises in production and wires the error handler', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('LOGROCKET_APP_ID', 'org/app');
        const LogRocket = await loadLogRocket();
        const { initAnalytics, identifyUser, trackEvent } =
            await import('../analytics');

        const previous = vi.fn();
        const app = {
            config: { errorHandler: previous },
        } as unknown as App;

        initAnalytics(app);
        expect(LogRocket.init).toHaveBeenCalledWith('org/app');

        // The installed handler forwards Errors to LogRocket and chains the prior one.
        const err = new Error('boom');
        app.config.errorHandler?.(err, null, 'info');
        expect(LogRocket.captureException).toHaveBeenCalledWith(err);
        expect(previous).toHaveBeenCalledWith(err, null, 'info');

        // Non-Error values are forwarded to the previous handler but not captured.
        LogRocket.captureException.mockClear();
        app.config.errorHandler?.('oops', null, 'info');
        expect(LogRocket.captureException).not.toHaveBeenCalled();

        identifyUser('alice');
        expect(LogRocket.identify).toHaveBeenCalledWith('alice', {
            nickname: 'alice',
        });

        trackEvent('joined');
        expect(LogRocket.track).toHaveBeenCalledWith('joined');
    });

    it('does not re-initialise on a second call', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('LOGROCKET_APP_ID', 'org/app');
        const LogRocket = await loadLogRocket();
        const { initAnalytics } = await import('../analytics');

        const app = { config: {} } as unknown as App;
        initAnalytics(app);
        initAnalytics(app);

        expect(LogRocket.init).toHaveBeenCalledOnce();
    });
});

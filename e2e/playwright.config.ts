import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Repo root, so the dev servers are spawned from the right place regardless of
// where Playwright is invoked.
const rootDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
);
const WEB_URL = 'http://localhost:9000';

const isCI = Boolean(process.env['CI']);

export default defineConfig({
    testDir: './tests',
    // The chat server holds global state (history, user count), and the
    // broadcast spec drives two clients at once — run serially for determinism.
    fullyParallel: false,
    workers: 1,
    forbidOnly: isCI,
    retries: isCI ? 2 : 0,
    // CI also writes the HTML report (with traces) so a failed run can be
    // inspected from the uploaded artifact.
    reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
    use: {
        baseURL: WEB_URL,
        // The app tags interactive elements with data-cy, not data-testid, so
        // getByTestId() resolves against those.
        testIdAttribute: 'data-cy',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        // `pnpm dev` starts Postgres (Docker Compose), then the web SPA (:9000)
        // and the API (:3000). Docker must be running; history persists in the
        // Postgres volume (run `docker compose down -v` for a clean slate).
        command: 'pnpm dev',
        cwd: rootDir,
        url: WEB_URL,
        timeout: 120_000,
        reuseExistingServer: !isCI,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});

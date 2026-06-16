import { coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**'],
            exclude: [
                ...coverageConfigDefaults.exclude,
                // Re-export barrel and pure-type contracts — no runtime logic
                // of our own, so they would only ever report as uncovered noise.
                'src/index.ts',
                'src/message.ts',
                'src/protocol.ts',
            ],
        },
    },
});

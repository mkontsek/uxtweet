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
                // Entrypoint: only binds the port; the app is built and tested via buildApp().
                'src/server.ts',
                // Pure type contract, no runtime to cover.
                'src/storage/IMessageStore.ts',
            ],
        },
    },
});

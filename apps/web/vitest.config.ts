import { coverageConfigDefaults, defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    plugins: [vue()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./test/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**'],
            exclude: [
                ...coverageConfigDefaults.exclude,
                // Framework wiring with no testable logic of our own.
                'src/App.vue',
                'src/boot/**',
                'src/router/**',
            ],
        },
    },
});

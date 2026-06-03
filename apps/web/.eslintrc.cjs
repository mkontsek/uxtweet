// Client-local ESLint config. `.vue` single-file components need
// `vue-eslint-parser` at the top level, which delegates `<script lang="ts">`
// (and plain `.ts` files) to `@typescript-eslint/parser`. Inherits the root
// config's TypeScript rules; adds Vue 3 correctness rules. Formatting stays with
// Prettier, so we use `vue3-essential` (not the style-heavy `vue3-recommended`).
module.exports = {
    extends: ['plugin:vue/vue3-essential'],
    parser: 'vue-eslint-parser',
    parserOptions: {
        parser: '@typescript-eslint/parser',
        tsconfigRootDir: __dirname,
        project: ['./tsconfig.eslint.json'],
        extraFileExtensions: ['.vue'],
    },
    env: {
        browser: true,
    },
    globals: {
        // Quasar replaces `process.env.*` at build time (see quasar.config.ts).
        process: 'readonly',
    },
};

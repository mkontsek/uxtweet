// Root ESLint config. `tsconfigRootDir: __dirname` pins type-aware linting to
// the repo root so `parserOptions.project` resolves the same regardless of which
// package directory Turborepo runs `eslint` from.
module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        tsconfigRootDir: __dirname,
        project: [
            './apps/web/tsconfig.json',
            './apps/api/tsconfig.eslint.json',
            './packages/shared/tsconfig.eslint.json',
        ],
    },
    plugins: ['@typescript-eslint'],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
    ],
    rules: {
        '@typescript-eslint/explicit-function-return-type': 'warn',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
            'error',
            { argsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/consistent-type-imports': 'error',
        'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
    ignorePatterns: [
        'dist',
        'node_modules',
        '*.config.js',
        '*.config.mjs',
        '*.config.ts',
    ],
};

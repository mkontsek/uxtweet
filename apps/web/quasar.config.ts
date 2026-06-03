import { configure } from 'quasar/wrappers';

export default configure((ctx) => {
    return {
        eslint: {
            fix: false,
            warnings: true,
            errors: true,
        },

        boot: ['logrocket'],

        css: ['app.scss'],

        extras: ['material-icons'],

        build: {
            target: {
                browser: ['es2022'],
                node: 'node20',
            },
            vitePlugins: [],
            env: {
                // Dev points at the standalone server on :3000. In production the
                // value is left empty so the SPA derives the WebSocket URL from
                // its own origin (works behind the ingress without baking a host).
                WS_URL:
                    process.env['WS_URL'] ??
                    (ctx.dev ? 'ws://localhost:3000/ws' : ''),
                LOGROCKET_APP_ID:
                    process.env['LOGROCKET_APP_ID'] ?? 'c36yqy/uxtweet',
            },
        },

        devServer: {
            port: 9000,
            open: false,
        },

        framework: {
            config: {},
            plugins: ['Notify'],
        },

        animations: [],

        sourceFiles: {
            rootComponent: 'src/App.vue',
            router: 'src/router/index',
        },
    };
});

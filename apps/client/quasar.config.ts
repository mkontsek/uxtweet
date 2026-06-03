import { configure } from 'quasar/wrappers';

export default configure((/* ctx */) => {
  return {
    eslint: {
      fix: false,
      warnings: true,
      errors: true,
    },

    boot: [],

    css: ['app.scss'],

    extras: ['material-icons'],

    build: {
      target: {
        browser: ['es2022'],
        node: 'node20',
      },
      vitePlugins: [],
      env: {
        WS_URL: process.env['WS_URL'] ?? 'ws://localhost:3000/ws',
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

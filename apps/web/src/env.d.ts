/* eslint-disable */
// Quasar & project env variables

declare namespace NodeJS {
    interface ProcessEnv {
        NODE_ENV: string;
        VUE_ROUTER_MODE: 'hash' | 'history' | 'abstract' | undefined;
        VUE_ROUTER_BASE: string | undefined;
        WS_URL: string;
        LOGROCKET_APP_ID: string;
    }
}

// Vite-injected build-time env (consumed via `import.meta.env`).
interface ImportMetaEnv {
    readonly BASE_URL: string;
    readonly MODE: string;
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly SSR: boolean;
    readonly WS_URL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

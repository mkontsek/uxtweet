import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
    {
        path: '/',
        component: () => import('../layouts/MainLayout.vue'),
        children: [
            {
                path: '',
                name: 'landing',
                component: () => import('../pages/LandingPage.vue'),
            },
            {
                path: 'chat',
                name: 'chat',
                component: () => import('../pages/ChatPage.vue'),
            },
        ],
    },
    // Catch-all
    {
        path: '/:catchAll(.*)*',
        component: () => import('../pages/ErrorNotFound.vue'),
    },
];

export default routes;

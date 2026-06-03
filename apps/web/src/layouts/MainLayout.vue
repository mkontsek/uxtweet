<template>
    <q-layout view="hHh lpR fFf">
        <q-header elevated class="bg-primary text-white">
            <q-toolbar class="toolbar-shell">
                <q-toolbar-title data-cy="app-title" class="app-title">
                    {{ headerTitle }}
                </q-toolbar-title>
                <q-chip
                    v-if="nickname"
                    data-cy="current-nickname"
                    color="white"
                    text-color="primary"
                    icon="person"
                    :label="nickname"
                    dense
                    class="q-mr-sm"
                />
                <ConnectionStatus
                    :status="status"
                    :user-count="userCount"
                    @retry="chat.connect"
                />
                <q-btn
                    v-if="hasJoined"
                    data-cy="toggle-user-list"
                    flat
                    round
                    dense
                    icon="people"
                    :aria-label="rightDrawerOpen ? 'Hide users' : 'Show users'"
                    class="q-ml-sm"
                    @click="toggleUserList"
                />
            </q-toolbar>
        </q-header>

        <q-drawer
            v-if="hasJoined"
            v-model="rightDrawerOpen"
            side="right"
            overlay
            bordered
            :width="260"
            data-cy="user-list-drawer"
        >
            <UserListPanel :users="users" />
        </q-drawer>

        <q-page-container>
            <router-view />
        </q-page-container>
    </q-layout>
</template>

<script lang="ts" setup>
import { provide, ref } from 'vue';
import ConnectionStatus from '../components/ConnectionStatus.vue';
import UserListPanel from '../components/UserListPanel.vue';
import { useChat, CHAT_INJECTION_KEY } from '../composables/useChat';

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
// In production WS_URL is empty (see quasar.config); derive it from the current
// origin so the socket targets whatever host/ingress served the SPA, at /ws.
const WS_URL =
    process.env.WS_URL || `${wsProtocol}//${window.location.host}/ws`;

const chat = useChat(WS_URL);
chat.connect();

provide(CHAT_INJECTION_KEY, chat);

const { status, userCount, nickname, hasJoined, users } = chat;

// Starts collapsed: the user expands the roster via the header toggle. As an
// overlay drawer it floats above the chat, so expanding it never reflows or
// shifts the message list.
const rightDrawerOpen = ref(false);

function toggleUserList(): void {
    rightDrawerOpen.value = !rightDrawerOpen.value;
}

const headerTitle = 'UXTweet';

document.title = headerTitle;
</script>

<style scoped lang="scss">
/* Keep the header content aligned with the centered chat column on desktop. */
.toolbar-shell {
    width: 100%;
    max-width: 55rem;
    margin: 0 auto;
}

/* Reclaim header space on narrow screens (≤510px) for the chips and toggle. */
@media (max-width: 31.875rem) {
    .app-title {
        display: none;
    }
}
</style>

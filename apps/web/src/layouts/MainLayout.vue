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
import { onMounted, onUnmounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import ConnectionStatus from '../components/ConnectionStatus.vue';
import UserListPanel from '../components/UserListPanel.vue';
import { useChatStore } from '../stores/chat';

// The layout owns the single WebSocket lifecycle: open it once the app mounts,
// close it on teardown. Components just read the shared store.
const chat = useChatStore();
const { status, userCount, nickname, hasJoined, users } = storeToRefs(chat);

onMounted(() => {
    chat.connect();
});

onUnmounted(() => {
    chat.disconnect();
});

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

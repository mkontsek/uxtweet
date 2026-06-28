<template>
    <q-page data-cy="chat-page" class="chat-page">
        <div class="chat-shell column">
            <MessageList
                :messages="messages"
                :current-nickname="nickname"
                class="col"
            />
            <q-separator />
            <MessageInput :is-connected="status === 'open'" @send="onSend" />
        </div>
    </q-page>
</template>

<script lang="ts" setup>
import { watch } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import MessageList from '../components/MessageList.vue';
import MessageInput from '../components/MessageInput.vue';
import { useChatStore } from '../stores/chat';

const chat = useChatStore();
const router = useRouter();
const { messages, status, nickname, hasJoined, isRestoringSession } =
    storeToRefs(chat);

// Guard: nobody reaches the chat without a nickname. A reload restoring a saved
// nickname is still in flight, so wait for it rather than bouncing to landing.
function guardJoined(): void {
    if (!hasJoined.value && !isRestoringSession.value) {
        void router.replace({ name: 'landing' });
    }
}
guardJoined();

// If a session restore ultimately fails (the saved name was rejected or the
// socket gave up), fall back to the landing screen.
watch([hasJoined, isRestoringSession], guardJoined);

function onSend(content: string): void {
    chat.sendMessage(content);
}
</script>

<style scoped lang="scss">
.chat-page {
    // Soft slate-to-white wash with a faint dot grid so the centred chat
    // shell reads as a card on a textured surface — calm, not decorative.
    background-color: #eef2f7;
    background-image:
        radial-gradient(rgba(15, 23, 42, 0.05) 1px, transparent 1px),
        linear-gradient(180deg, #e8eef6 0%, #eef2f7 40%, #f1f5f9 100%);
    background-size:
        1.375rem 1.375rem,
        100% 100%;
    background-attachment: fixed;
}

.chat-shell {
    width: 100%;
    max-width: 55rem;
    margin: 0 auto;
    height: calc(100vh - 3.125rem);
    background: #fff;
    box-shadow: 0 0 2.5rem rgba(15, 23, 42, 0.06);
}
</style>

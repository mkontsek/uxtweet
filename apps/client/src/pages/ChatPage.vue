<template>
  <q-page data-cy="chat-page" class="column" style="height: calc(100vh - 50px)">
    <MessageList
      :messages="messages"
      :current-client-id="clientId"
      class="col"
    />
    <q-separator />
    <MessageInput
      :is-connected="status === 'open'"
      @send="onSend"
    />
  </q-page>
</template>

<script lang="ts" setup>
import { inject } from 'vue';
import MessageList from '../components/MessageList.vue';
import MessageInput from '../components/MessageInput.vue';
import type { UseChatReturn } from '../composables/useChat';

const chat = inject<UseChatReturn>('chat');

if (!chat) {
  throw new Error('Chat context not provided. Wrap with MainLayout.');
}

const { messages, status, clientId, sendMessage } = chat;

function onSend(content: string): void {
  sendMessage(content);
}
</script>

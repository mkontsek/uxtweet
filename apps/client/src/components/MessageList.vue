<template>
  <q-scroll-area
    ref="scrollAreaRef"
    data-cy="message-list-scroll-area"
    class="col"
    style="height: 0; flex: 1"
  >
    <q-list padding>
      <q-item
        v-for="message in messages"
        :key="message.id"
        :class="isOwn(message) ? 'justify-end' : ''"
        data-cy="message-item"
      >
        <q-item-section
          :class="['message-bubble', isOwn(message) ? 'message-bubble--own' : 'message-bubble--other']"
        >
          <q-item-label
            v-if="!isOwn(message)"
            caption
            data-cy="message-author"
            class="text-grey-6"
          >
            {{ shortId(message.clientId) }}
          </q-item-label>
          <q-item-label data-cy="message-content">{{ message.content }}</q-item-label>
          <q-item-label caption data-cy="message-timestamp" class="text-grey-5 text-right">
            {{ formatTime(message.timestamp) }}
          </q-item-label>
        </q-item-section>
      </q-item>

      <q-item v-if="messages.length === 0" data-cy="message-list-empty">
        <q-item-section class="text-center text-grey-5">
          No messages yet. Say hello!
        </q-item-section>
      </q-item>
    </q-list>
  </q-scroll-area>
</template>

<script lang="ts" setup>
import { watch, nextTick, ref } from 'vue';
import type { QScrollArea } from 'quasar';
import type { ChatMessage } from '@uxtweet/shared';

const props = defineProps<{
  messages: ChatMessage[];
  currentClientId: string | null;
}>();

const scrollAreaRef = ref<QScrollArea | null>(null);

watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    scrollAreaRef.value?.setScrollPercentage('vertical', 1.0);
  },
);

function isOwn(message: ChatMessage): boolean {
  return message.clientId === props.currentClientId;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
</script>

<style scoped lang="scss">
.message-bubble {
  max-width: 70%;
  border-radius: 12px;
  padding: 8px 12px;
  margin-bottom: 4px;

  &--own {
    background: #1976d2;
    color: white;
    align-self: flex-end;
  }

  &--other {
    background: #f5f5f5;
    align-self: flex-start;
  }
}
</style>

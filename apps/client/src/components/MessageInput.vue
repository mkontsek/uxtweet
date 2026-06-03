<template>
  <q-form data-cy="message-input-form" class="row q-pa-sm q-gutter-sm" @submit.prevent="submit">
    <q-input
      v-model="text"
      data-cy="message-input-field"
      class="col"
      outlined
      dense
      placeholder="Type a message…"
      autofocus
      :disable="!isConnected"
      maxlength="2000"
      @keydown.enter.exact.prevent="submit"
    />
    <q-btn
      data-cy="message-send-button"
      type="submit"
      icon="send"
      color="primary"
      :disable="!canSend"
      flat
      round
    />
  </q-form>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';

const props = defineProps<{
  isConnected: boolean;
}>();

const emit = defineEmits<{
  send: [content: string];
}>();

const text = ref('');

const canSend = computed(() => props.isConnected && text.value.trim().length > 0);

function submit(): void {
  if (!canSend.value) return;
  emit('send', text.value.trim());
  text.value = '';
}
</script>

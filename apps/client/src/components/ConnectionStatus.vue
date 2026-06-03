<template>
  <q-chip
    data-cy="connection-status-chip"
    :color="chipColor"
    text-color="white"
    :icon="chipIcon"
    :label="chipLabel"
    dense
  />
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { ConnectionStatus } from '../composables/useChat';

const props = defineProps<{
  status: ConnectionStatus;
  userCount: number;
}>();

const chipColor = computed(() => {
  switch (props.status) {
    case 'open':
      return 'positive';
    case 'connecting':
      return 'warning';
    case 'error':
      return 'negative';
    default:
      return 'grey';
  }
});

const chipIcon = computed(() => {
  switch (props.status) {
    case 'open':
      return 'wifi';
    case 'connecting':
      return 'sync';
    case 'error':
      return 'wifi_off';
    default:
      return 'wifi_off';
  }
});

const chipLabel = computed(() => {
  if (props.status === 'open') {
    return `Connected · ${props.userCount} online`;
  }
  if (props.status === 'connecting') {
    return 'Connecting…';
  }
  if (props.status === 'error') {
    return 'Connection error';
  }
  return 'Disconnected';
});
</script>

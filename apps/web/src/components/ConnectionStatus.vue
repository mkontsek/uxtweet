<template>
    <q-chip
        data-cy="connection-status-chip"
        :color="chipColor"
        text-color="white"
        :icon="chipIcon"
        :label="chipLabel"
        :clickable="canRetry"
        :role="canRetry ? 'button' : undefined"
        :tabindex="canRetry ? 0 : undefined"
        :aria-label="canRetry ? 'Reconnect to the chat server' : chipLabel"
        dense
        @click="onChipClick"
        @keyup.enter="onChipClick"
        @keyup.space="onChipClick"
    />
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { ConnectionStatus } from '../composables/useChat';

const props = defineProps<{
    status: ConnectionStatus;
    userCount: number;
}>();

const emit = defineEmits<{
    retry: [];
}>();

// Once auto-reconnect has given up the status rests at 'closed'; the chip
// then doubles as the manual retry control.
const canRetry = computed(() => props.status === 'closed');

function onChipClick(): void {
    if (canRetry.value) {
        emit('retry');
    }
}

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
    return 'Disconnected — retry';
});
</script>

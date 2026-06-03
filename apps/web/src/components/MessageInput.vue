<template>
    <q-form
        data-cy="message-input-form"
        class="row q-pa-sm q-gutter-sm"
        @submit.prevent="submit"
    >
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
            color="primary"
            :disable="!canSend"
            flat
            round
        >
            <MotionConfig reduced-motion="user">
                <motion.span
                    :key="flightKey"
                    class="send-icon"
                    :initial="{ x: 0, opacity: 1 }"
                    :animate="flightKey > 0 ? FLY_ANIMATE : REST"
                    :transition="FLY_TRANSITION"
                >
                    <q-icon name="send" />
                </motion.span>
            </MotionConfig>
        </q-btn>
    </q-form>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { MotionConfig, motion } from 'motion-v';

// Send-icon flight: dart right and fade out, jump off-screen left while
// invisible, then fly back in from the left to rest at centre.
const REST = { x: 0, opacity: 1 };
const FLY_ANIMATE = {
    x: [0, 36, -36, 0],
    opacity: [1, 0, 0, 1],
};
const FLY_TRANSITION = {
    duration: 0.45,
    times: [0, 0.45, 0.55, 1],
    ease: 'easeInOut' as const,
};

const props = defineProps<{
    isConnected: boolean;
}>();

const emit = defineEmits<{
    send: [content: string];
}>();

const text = ref('');
const flightKey = ref(0);

const canSend = computed(
    () => props.isConnected && text.value.trim().length > 0
);

function submit(): void {
    if (!canSend.value) return;
    emit('send', text.value.trim());
    text.value = '';
    flightKey.value += 1;
}
</script>

<style scoped>
.send-icon {
    display: inline-flex;
}
</style>

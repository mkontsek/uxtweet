<template>
    <q-scroll-area
        ref="scrollAreaRef"
        data-cy="message-list-scroll-area"
        class="col"
        style="height: 0; flex: 1"
    >
        <transition-group tag="div" name="msg" class="message-track q-pa-md">
            <div
                v-for="message in messages"
                :key="message.id"
                class="message-row"
                :class="
                    isOwn(message) ? 'message-row--own' : 'message-row--other'
                "
                data-cy="message-item"
            >
                <div
                    class="message-bubble"
                    :class="
                        isOwn(message)
                            ? 'message-bubble--own'
                            : 'message-bubble--other'
                    "
                >
                    <div
                        v-if="!isOwn(message)"
                        class="message-bubble__author text-weight-medium"
                        data-cy="message-author"
                    >
                        {{ message.nickname }}
                    </div>
                    <div
                        class="message-bubble__content"
                        data-cy="message-content"
                    >
                        {{ message.content }}
                    </div>
                    <div
                        class="message-bubble__time"
                        data-cy="message-timestamp"
                    >
                        {{ formatTime(message.timestamp) }}
                    </div>
                </div>
            </div>

            <div
                v-if="messages.length === 0"
                key="empty"
                class="message-empty text-center text-grey-5"
                data-cy="message-list-empty"
            >
                No messages yet. Say hello!
            </div>
        </transition-group>
    </q-scroll-area>
</template>

<script lang="ts" setup>
import { watch, nextTick, ref } from 'vue';
import type { QScrollArea } from 'quasar';
import type { ChatMessage } from '@uxtweet/shared';

const props = defineProps<{
    messages: readonly ChatMessage[];
    currentNickname: string | null;
}>();

const scrollAreaRef = ref<QScrollArea | null>(null);

// Jump to the very bottom. setScrollPercentage(1) maps against q-scroll-area's
// *cached* content height, which a ResizeObserver only refreshes after the new
// message is laid out — so right after an insert it lands one message short.
// Read the live scrollHeight off the scroll target instead, after the DOM and a
// paint frame have settled, so the latest bubble is always fully visible.
function scrollToBottom(): void {
    const area = scrollAreaRef.value;
    if (!area) {
        return;
    }
    const target = area.getScrollTarget();
    target.scrollTop = target.scrollHeight;
}

// Key on count *and* the last id so a whole-array replacement of the same length
// (e.g. the history swap on reconnect) still scrolls to the latest message.
watch(
    () => {
        const last = props.messages[props.messages.length - 1];
        return `${props.messages.length}:${last?.id ?? ''}`;
    },
    async () => {
        await nextTick();
        scrollToBottom();
        // A second pass after the next frame covers the ResizeObserver-driven
        // content resize that can land just after nextTick.
        requestAnimationFrame(scrollToBottom);
    }
);

// Identity here is the nickname the user joined with, not the per-connection
// clientId (which is reissued on every reconnect). Matching on nickname means
// a user's earlier messages still render as their own after re-joining.
function isOwn(message: ChatMessage): boolean {
    const current = props.currentNickname;
    if (current === null) {
        return false;
    }
    return message.nickname.toLowerCase() === current.toLowerCase();
}

const DAY_MS = 24 * 60 * 60 * 1000;

function formatTime(iso: string): string {
    const date = new Date(iso);
    const time = date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    });
    // Older than a day → prefix the calendar date so the time isn't ambiguous.
    if (Date.now() - date.getTime() < DAY_MS) {
        return time;
    }
    const month = date.toLocaleDateString([], { month: 'short' });
    const day = `${date.getDate()}. ${month}`;
    return `${day}, ${time}`;
}
</script>

<style scoped lang="scss">
.message-track {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
}

.message-row {
    display: flex;

    &--own {
        justify-content: flex-end;
    }

    &--other {
        justify-content: flex-start;
    }
}

.message-bubble {
    max-width: 70%;
    border-radius: 0.875rem;
    padding: 0.5rem 0.75rem;
    box-shadow: 0 1px 0.125rem rgba(15, 23, 42, 0.08);
    word-break: break-word;

    &--own {
        background: #1976d2;
        color: #fff;
        border-bottom-right-radius: 0.25rem;
    }

    &--other {
        background: #f1f5f9;
        color: #0f172a;
        border-bottom-left-radius: 0.25rem;
    }

    &__author {
        font-size: 0.75rem;
        color: #2563eb;
        margin-bottom: 0.125rem;
    }

    &__time {
        font-size: 0.68rem;
        opacity: 0.7;
        text-align: right;
        margin-top: 0.125rem;
    }
}

.message-empty {
    padding: 1.5rem 0;
}

/* New-message entrance animation */
.msg-enter-active {
    transition:
        transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
        opacity 0.28s ease;
}

.msg-enter-from {
    opacity: 0;
    transform: translateY(0.75rem) scale(0.98);
}

.msg-move {
    transition: transform 0.28s ease;
}

@media (prefers-reduced-motion: reduce) {
    .msg-enter-active,
    .msg-move {
        transition: none;
    }
}
</style>

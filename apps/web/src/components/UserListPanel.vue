<template>
    <div class="user-panel" data-cy="user-list-panel">
        <div class="user-panel__header text-subtitle2 text-weight-medium">
            <q-icon name="people" size="1.25rem" class="q-mr-xs" />
            Online — {{ users.length }}
        </div>
        <q-separator />

        <q-scroll-area class="user-panel__scroll col">
            <MotionConfig reduced-motion="user">
                <AnimatePresence>
                    <motion.div
                        v-for="user in sortedUsers"
                        :key="user.nickname"
                        class="user-row"
                        data-cy="user-list-item"
                        layout
                        :initial="{ opacity: 0, x: 24 }"
                        :animate="{ opacity: 1, x: 0 }"
                        :exit="{ opacity: 0, x: 24 }"
                        :transition="{
                            duration: 0.28,
                            ease: [0.22, 1, 0.36, 1],
                        }"
                    >
                        <span
                            class="user-row__dot"
                            :class="`user-row__dot--${statusOf(user)}`"
                            data-cy="user-status-dot"
                            role="img"
                            :aria-label="`${user.nickname} is ${statusLabel(user)}`"
                        />
                        <div class="user-row__body">
                            <div
                                class="user-row__name text-weight-medium"
                                data-cy="user-nickname"
                            >
                                {{ user.nickname }}
                            </div>
                            <div class="user-row__meta text-grey-6">
                                {{ statusLabel(user) }} · {{ loginAgo(user) }}
                            </div>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </MotionConfig>

            <div
                v-if="users.length === 0"
                class="user-empty text-center text-grey-5"
                data-cy="user-list-empty"
            >
                No one here yet.
            </div>
        </q-scroll-area>
    </div>
</template>

<script lang="ts" setup>
import { computed, onUnmounted, ref } from 'vue';
import { AnimatePresence, MotionConfig, motion } from 'motion-v';
import { deriveUserStatus } from '@uxtweet/shared';
import type { RosterEntry, UserStatus } from '@uxtweet/shared';

const props = defineProps<{
    users: readonly RosterEntry[];
}>();

// A ticking clock so derived status and relative login times age live without
// the server pushing anything. Cleaned up when the panel unmounts.
const TICK_MS = 15 * 1000;
const now = ref(Date.now());
const timer = setInterval(() => {
    now.value = Date.now();
}, TICK_MS);
onUnmounted(() => {
    clearInterval(timer);
});

// Online users first, then longest-connected first within each group.
const sortedUsers = computed(() => {
    return [...props.users].sort((a, b) => {
        const statusA = deriveUserStatus(a, now.value);
        const statusB = deriveUserStatus(b, now.value);
        if (statusA !== statusB) {
            return statusA === 'online' ? -1 : 1;
        }
        return Date.parse(a.connectedAt) - Date.parse(b.connectedAt);
    });
});

function statusOf(user: RosterEntry): UserStatus {
    return deriveUserStatus(user, now.value);
}

function statusLabel(user: RosterEntry): string {
    return statusOf(user) === 'online' ? 'Online' : 'Idle';
}

function loginAgo(user: RosterEntry): string {
    return formatAgo(Date.parse(user.connectedAt), now.value);
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

function formatAgo(thenMs: number, nowMs: number): string {
    const diff = Math.max(0, nowMs - thenMs);
    if (diff < MINUTE_MS) {
        return 'joined just now';
    }
    if (diff < HOUR_MS) {
        return `joined ${Math.floor(diff / MINUTE_MS)}m ago`;
    }
    return `joined ${Math.floor(diff / HOUR_MS)}h ago`;
}
</script>

<style scoped lang="scss">
.user-panel {
    display: flex;
    flex-direction: column;
    height: 100%;

    &__header {
        display: flex;
        align-items: center;
        padding: 0.75rem 1rem;
        color: #0f172a;
    }

    &__scroll {
        height: 0;
        flex: 1;
    }
}

.user-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 1rem;

    &__dot {
        flex: 0 0 auto;
        width: 0.625rem;
        height: 0.625rem;
        border-radius: 50%;
        background: #cbd5e1;

        &--online {
            background: #21ba45;
            box-shadow: 0 0 0 0.1875rem rgba(33, 186, 69, 0.18);
        }

        &--idle {
            background: #cbd5e1;
        }
    }

    &__body {
        min-width: 0;
    }

    &__name {
        font-size: 0.875rem;
        color: #0f172a;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    &__meta {
        font-size: 0.68rem;
    }
}

.user-empty {
    padding: 1.5rem 1rem;
}
</style>

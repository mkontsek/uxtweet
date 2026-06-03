<template>
    <q-page class="landing column flex-center" data-cy="landing-page">
        <div class="landing__panel q-pa-lg">
            <div class="landing__logo text-center">
                <q-icon name="forum" size="4rem" color="primary" />
            </div>

            <h1
                class="landing__title text-center text-weight-bold q-mt-md q-mb-xs"
            >
                UXTweet
            </h1>
            <p class="landing__subtitle text-center text-grey-7 q-mb-lg">
                Pick a nickname to join the conversation.
            </p>

            <q-form data-cy="nickname-form" @submit.prevent="submit">
                <q-input
                    v-model="nicknameInput"
                    data-cy="nickname-input"
                    outlined
                    autofocus
                    label="Your nickname"
                    :maxlength="NICKNAME_MAX_LENGTH"
                    :error="Boolean(errorMessage)"
                    :error-message="errorMessage ?? undefined"
                    hint="3–20 letters, numbers, underscores or hyphens"
                    @update:model-value="clearError"
                >
                    <template #prepend>
                        <q-icon name="alternate_email" />
                    </template>
                </q-input>

                <q-btn
                    data-cy="nickname-submit"
                    type="submit"
                    class="full-width q-mt-md"
                    color="primary"
                    size="lg"
                    unelevated
                    no-caps
                    :loading="isJoining"
                    :disable="!canSubmit"
                    :label="buttonLabel"
                />
            </q-form>

            <div v-if="status !== 'open'" class="text-center q-mt-md">
                <p
                    class="landing__hint text-caption text-grey-6 q-mb-none"
                    data-cy="landing-connection-hint"
                >
                    {{ connectionHint }}
                </p>
                <q-btn
                    v-if="canReconnect"
                    data-cy="landing-retry"
                    flat
                    no-caps
                    color="primary"
                    icon="refresh"
                    label="Try again"
                    class="q-mt-xs"
                    @click="connect"
                />
            </div>
        </div>
    </q-page>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { NICKNAME_MAX_LENGTH, validateNickname } from '@uxtweet/shared';
import { useChatContext } from '../composables/useChat';

const chat = useChatContext();
const router = useRouter();
const { status, hasJoined, joinError, join, connect } = chat;

const nicknameInput = ref('');
const localError = ref<string | null>(null);
const isJoining = ref(false);

// Already joined (e.g. navigated back to landing) → go straight to chat.
if (hasJoined.value) {
    void router.replace({ name: 'chat' });
}

const errorMessage = computed(() => localError.value ?? joinError.value);

const canSubmit = computed(
    () =>
        status.value === 'open' &&
        nicknameInput.value.trim().length > 0 &&
        !isJoining.value
);

const buttonLabel = computed(() =>
    isJoining.value ? 'Joining…' : 'Join chat'
);

// Auto-reconnect rests at 'closed' once it has given up (see useChat). Offer a
// manual retry there rather than a misleading perpetual "Connecting…".
const canReconnect = computed(() => status.value === 'closed');

const connectionHint = computed(() => {
    if (status.value === 'closed') {
        return "Couldn't reach the chat server.";
    }
    if (status.value === 'error') {
        return 'Connection lost — retrying…';
    }
    return 'Connecting to the chat server…';
});

function clearError(): void {
    localError.value = null;
}

function submit(): void {
    const result = validateNickname(nicknameInput.value);
    if (!result.ok) {
        localError.value = result.reason;
        return;
    }
    localError.value = null;
    isJoining.value = true;
    join(result.value);
}

// Server accepted the nickname → enter the chat.
watch(hasJoined, (joined) => {
    if (joined) {
        void router.push({ name: 'chat' });
    }
});

// Server rejected the nickname → stop the spinner so the user can retry.
watch(joinError, (err) => {
    if (err) {
        isJoining.value = false;
    }
});

// The socket dropped before the server replied (no `joined`, no `error`) → clear
// the spinner so the button isn't stuck on "Joining…" once we reconnect.
watch(status, (current) => {
    if (current !== 'open') {
        isJoining.value = false;
    }
});
</script>

<style scoped lang="scss">
.landing {
    background: linear-gradient(160deg, #e3f2fd 0%, #f8fafc 55%, #ffffff 100%);
}

.landing__panel {
    width: 100%;
    max-width: 26.25rem;
    background: #fff;
    border-radius: 1.125rem;
    box-shadow: 0 1.125rem 3rem rgba(15, 23, 42, 0.12);
    animation: landing-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.landing__logo {
    animation: landing-float 4s ease-in-out infinite;
}

.landing__title {
    font-size: 2rem;
    letter-spacing: 0.0312rem;
}

.landing__subtitle {
    margin: 0;
}

@keyframes landing-rise {
    from {
        opacity: 0;
        transform: translateY(1.5rem) scale(0.98);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

@keyframes landing-float {
    0%,
    100% {
        transform: translateY(0);
    }
    50% {
        transform: translateY(-8px);
    }
}

@media (prefers-reduced-motion: reduce) {
    .landing__panel,
    .landing__logo {
        animation: none;
    }
}
</style>

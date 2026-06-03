import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h, ref, nextTick } from 'vue';
import type { VNode } from 'vue';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import type { UseChatReturn } from '../../composables/useChat';
import { CHAT_INJECTION_KEY } from '../../composables/useChat';
import LandingPage from '../LandingPage.vue';

const { router } = vi.hoisted(
    (): {
        router: {
            push: ReturnType<typeof vi.fn>;
            replace: ReturnType<typeof vi.fn>;
        };
    } => ({
        router: { push: vi.fn(), replace: vi.fn() },
    })
);
vi.mock('vue-router', () => ({ useRouter: (): typeof router => router }));

function makeChat(over: Partial<UseChatReturn> = {}): UseChatReturn {
    return {
        messages: ref([]),
        status: ref('open'),
        clientId: ref(null),
        userCount: ref(0),
        users: ref([]),
        nickname: ref(null),
        hasJoined: ref(false),
        joinError: ref(null),
        join: vi.fn(),
        sendMessage: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        ...over,
    } as UseChatReturn;
}

const stubs = {
    QPage: { template: '<div><slot /></div>' },
    QIcon: true,
    QForm: defineComponent({
        name: 'QForm',
        emits: ['submit'],
        setup(_, { slots, emit }): () => VNode {
            return (): VNode =>
                h(
                    'form',
                    {
                        'data-cy': 'nickname-form',
                        onSubmit: (e: Event) => {
                            e.preventDefault();
                            emit('submit', e);
                        },
                    },
                    slots['default']?.()
                );
        },
    }),
    QInput: defineComponent({
        name: 'QInput',
        props: {
            modelValue: String,
            error: Boolean,
            errorMessage: String,
        },
        emits: ['update:modelValue'],
        setup(props, { emit }): () => VNode {
            return (): VNode =>
                h('input', {
                    'data-cy': 'nickname-input',
                    value: props.modelValue,
                    'data-error': String(Boolean(props.error)),
                    'data-error-message': props.errorMessage ?? '',
                    onInput: (e: Event) =>
                        emit(
                            'update:modelValue',
                            (e.target as HTMLInputElement).value
                        ),
                });
        },
    }),
    QBtn: defineComponent({
        name: 'QBtn',
        props: {
            label: String,
            loading: Boolean,
            disable: Boolean,
            icon: String,
        },
        emits: ['click'],
        setup(props, { attrs, emit }): () => VNode {
            return (): VNode =>
                h('button', {
                    'data-cy': attrs['data-cy'],
                    'data-label': props.label,
                    'data-disable': String(Boolean(props.disable)),
                    onClick: () => emit('click'),
                });
        },
    }),
};

function mountPage(chat: UseChatReturn): VueWrapper {
    return mount(LandingPage, {
        global: {
            provide: { [CHAT_INJECTION_KEY as symbol]: chat },
            stubs,
        },
    }) as VueWrapper;
}

describe('LandingPage', () => {
    beforeEach(() => {
        router.push.mockClear();
        router.replace.mockClear();
    });

    it('redirects an already-joined visitor straight to chat', () => {
        const wrapper = mountPage(makeChat({ hasJoined: ref(true) }));
        expect(router.replace).toHaveBeenCalledWith({ name: 'chat' });
        wrapper.unmount();
    });

    it('joins with a valid nickname on submit', async () => {
        const chat = makeChat();
        const wrapper = mountPage(chat);
        await wrapper.find('[data-cy="nickname-input"]').setValue('alice');
        await wrapper.find('[data-cy="nickname-form"]').trigger('submit');

        expect(chat.join).toHaveBeenCalledWith('alice');
        expect(
            wrapper.find('[data-cy="nickname-submit"]').attributes('data-label')
        ).toBe('Joining…');
        wrapper.unmount();
    });

    it('shows a validation error and does not join an invalid nickname', async () => {
        const chat = makeChat();
        const wrapper = mountPage(chat);
        await wrapper.find('[data-cy="nickname-input"]').setValue('a');
        await wrapper.find('[data-cy="nickname-form"]').trigger('submit');

        expect(chat.join).not.toHaveBeenCalled();
        expect(
            wrapper.find('[data-cy="nickname-input"]').attributes('data-error')
        ).toBe('true');
        wrapper.unmount();
    });

    it('navigates to chat once the server confirms the join', async () => {
        const hasJoined = ref(false);
        const wrapper = mountPage(makeChat({ hasJoined }));
        hasJoined.value = true;
        await nextTick();
        expect(router.push).toHaveBeenCalledWith({ name: 'chat' });
        wrapper.unmount();
    });

    it('stops the joining spinner when the server rejects the nickname', async () => {
        const joinError = ref<string | null>(null);
        const chat = makeChat({ joinError });
        const wrapper = mountPage(chat);
        await wrapper.find('[data-cy="nickname-input"]').setValue('alice');
        await wrapper.find('[data-cy="nickname-form"]').trigger('submit');
        expect(
            wrapper.find('[data-cy="nickname-submit"]').attributes('data-label')
        ).toBe('Joining…');

        joinError.value = 'taken';
        await nextTick();
        expect(
            wrapper.find('[data-cy="nickname-submit"]').attributes('data-label')
        ).toBe('Join chat');
        wrapper.unmount();
    });

    it('offers a manual reconnect when the socket has given up', async () => {
        const status = ref<'connecting' | 'open' | 'closed' | 'error'>(
            'closed'
        );
        const chat = makeChat({ status });
        const wrapper = mountPage(chat);

        expect(
            wrapper.find('[data-cy="landing-connection-hint"]').text()
        ).toContain("Couldn't reach");
        await wrapper.find('[data-cy="landing-retry"]').trigger('click');
        expect(chat.connect).toHaveBeenCalled();
        wrapper.unmount();
    });
});

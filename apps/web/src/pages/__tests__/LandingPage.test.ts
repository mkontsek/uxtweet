import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import type { VNode } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import type { Pinia } from 'pinia';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { useChatStore } from '../../stores/chat';
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

let pinia: Pinia;
let store: ReturnType<typeof useChatStore>;

function mountPage(): VueWrapper {
    return mount(LandingPage, {
        global: {
            plugins: [pinia],
            stubs,
        },
    }) as VueWrapper;
}

describe('LandingPage', () => {
    beforeEach(() => {
        window.localStorage.clear();
        pinia = createPinia();
        setActivePinia(pinia);
        store = useChatStore();
        store.status = 'open';
        router.push.mockClear();
        router.replace.mockClear();
    });

    it('redirects an already-joined visitor straight to chat', () => {
        store.hasJoined = true;
        const wrapper = mountPage();
        expect(router.replace).toHaveBeenCalledWith({ name: 'chat' });
        wrapper.unmount();
    });

    it('joins with a valid nickname on submit', async () => {
        const join = vi.spyOn(store, 'join');
        const wrapper = mountPage();
        await wrapper.find('[data-cy="nickname-input"]').setValue('alice');
        await wrapper.find('[data-cy="nickname-form"]').trigger('submit');

        expect(join).toHaveBeenCalledWith('alice');
        expect(
            wrapper.find('[data-cy="nickname-submit"]').attributes('data-label')
        ).toBe('Joining…');
        wrapper.unmount();
    });

    it('shows a validation error and does not join an invalid nickname', async () => {
        const join = vi.spyOn(store, 'join');
        const wrapper = mountPage();
        await wrapper.find('[data-cy="nickname-input"]').setValue('a');
        await wrapper.find('[data-cy="nickname-form"]').trigger('submit');

        expect(join).not.toHaveBeenCalled();
        expect(
            wrapper.find('[data-cy="nickname-input"]').attributes('data-error')
        ).toBe('true');
        wrapper.unmount();
    });

    it('navigates to chat once the server confirms the join', async () => {
        const wrapper = mountPage();
        store.hasJoined = true;
        await nextTick();
        expect(router.push).toHaveBeenCalledWith({ name: 'chat' });
        wrapper.unmount();
    });

    it('stops the joining spinner when the server rejects the nickname', async () => {
        const wrapper = mountPage();
        await wrapper.find('[data-cy="nickname-input"]').setValue('alice');
        await wrapper.find('[data-cy="nickname-form"]').trigger('submit');
        expect(
            wrapper.find('[data-cy="nickname-submit"]').attributes('data-label')
        ).toBe('Joining…');

        store.joinError = 'taken';
        await nextTick();
        expect(
            wrapper.find('[data-cy="nickname-submit"]').attributes('data-label')
        ).toBe('Join chat');
        wrapper.unmount();
    });

    it('offers a manual reconnect when the socket has given up', async () => {
        store.status = 'closed';
        const connect = vi.spyOn(store, 'connect').mockImplementation(() => {});
        const wrapper = mountPage();

        expect(
            wrapper.find('[data-cy="landing-connection-hint"]').text()
        ).toContain("Couldn't reach");
        await wrapper.find('[data-cy="landing-retry"]').trigger('click');
        expect(connect).toHaveBeenCalled();
        wrapper.unmount();
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h } from 'vue';
import type { VNode } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import type { Pinia } from 'pinia';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { useChatStore } from '../../stores/chat';
import ChatPage from '../ChatPage.vue';

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

// Stand-in for MessageInput that lets a test fire its `send` intent.
const MessageInputStub = defineComponent({
    name: 'MessageInput',
    emits: ['send'],
    setup(_, { emit }): () => VNode {
        return (): VNode =>
            h('button', {
                'data-cy': 'stub-send',
                onClick: () => emit('send', 'hi'),
            });
    },
});

let pinia: Pinia;
let store: ReturnType<typeof useChatStore>;

function mountPage(): VueWrapper {
    return mount(ChatPage, {
        global: {
            plugins: [pinia],
            stubs: {
                QPage: { template: '<div><slot /></div>' },
                QSeparator: true,
                MessageList: true,
                MessageInput: MessageInputStub,
            },
        },
    }) as VueWrapper;
}

describe('ChatPage', () => {
    beforeEach(() => {
        window.localStorage.clear();
        pinia = createPinia();
        setActivePinia(pinia);
        store = useChatStore();
        router.push.mockClear();
        router.replace.mockClear();
    });

    it('renders the chat shell for a joined user', () => {
        store.hasJoined = true;
        store.nickname = 'alice';
        const wrapper = mountPage();
        expect(wrapper.find('[data-cy="chat-page"]').exists()).toBe(true);
        expect(router.replace).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('forwards a send intent to sendMessage', async () => {
        store.hasJoined = true;
        const sendMessage = vi.spyOn(store, 'sendMessage');
        const wrapper = mountPage();
        await wrapper.find('[data-cy="stub-send"]').trigger('click');
        expect(sendMessage).toHaveBeenCalledWith('hi');
        wrapper.unmount();
    });

    it('redirects to the landing page when not joined', () => {
        store.hasJoined = false;
        const wrapper = mountPage();
        expect(router.replace).toHaveBeenCalledWith({ name: 'landing' });
        wrapper.unmount();
    });

    it('waits on the landing redirect while a saved session is restoring', () => {
        store.hasJoined = false;
        store.isRestoringSession = true;
        const wrapper = mountPage();
        // A restore is in flight, so don't bounce to landing yet.
        expect(router.replace).not.toHaveBeenCalled();
        wrapper.unmount();
    });
});

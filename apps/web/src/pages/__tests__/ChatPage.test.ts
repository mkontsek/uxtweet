import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import type { VNode } from 'vue';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import type { ChatMessage } from '@uxtweet/shared';
import type { UseChatReturn } from '../../composables/useChat';
import { CHAT_INJECTION_KEY } from '../../composables/useChat';
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

function makeChat(over: Partial<UseChatReturn> = {}): UseChatReturn {
    return {
        messages: ref<ChatMessage[]>([]),
        status: ref('open'),
        clientId: ref(null),
        userCount: ref(0),
        users: ref([]),
        nickname: ref('alice'),
        hasJoined: ref(true),
        joinError: ref(null),
        join: vi.fn(),
        sendMessage: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        ...over,
    } as UseChatReturn;
}

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

function mountPage(chat: UseChatReturn): VueWrapper {
    return mount(ChatPage, {
        global: {
            provide: { [CHAT_INJECTION_KEY as symbol]: chat },
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
        router.push.mockClear();
        router.replace.mockClear();
    });

    it('renders the chat shell for a joined user', () => {
        const wrapper = mountPage(makeChat());
        expect(wrapper.find('[data-cy="chat-page"]').exists()).toBe(true);
        expect(router.replace).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('forwards a send intent to sendMessage', async () => {
        const chat = makeChat();
        const wrapper = mountPage(chat);
        await wrapper.find('[data-cy="stub-send"]').trigger('click');
        expect(chat.sendMessage).toHaveBeenCalledWith('hi');
        wrapper.unmount();
    });

    it('redirects to the landing page when not joined', () => {
        const wrapper = mountPage(makeChat({ hasJoined: ref(false) }));
        expect(router.replace).toHaveBeenCalledWith({ name: 'landing' });
        wrapper.unmount();
    });
});

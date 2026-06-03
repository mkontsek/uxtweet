import { describe, it, expect, beforeAll } from 'vitest';
import { defineComponent, h } from 'vue';
import type { VNode } from 'vue';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import type { ChatMessage } from '@uxtweet/shared';
import MessageList from '../MessageList.vue';

// The scroll-on-new-message effect reads the live scroll target; a stub that
// exposes getScrollTarget keeps the watcher from throwing under jsdom.
const QScrollAreaStub = defineComponent({
    name: 'QScrollArea',
    setup(_, { slots, expose }): () => VNode {
        expose({
            getScrollTarget: (): {
                scrollTop: number;
                scrollHeight: number;
            } => ({
                scrollTop: 0,
                scrollHeight: 100,
            }),
        });
        return (): VNode => h('div', slots['default']?.());
    },
});

function message(over: Partial<ChatMessage>): ChatMessage {
    return {
        id: 'id',
        clientId: 'c',
        nickname: 'someone',
        content: 'text',
        timestamp: new Date().toISOString(),
        ...over,
    };
}

function mountList(
    messages: ChatMessage[],
    currentNickname: string | null
): VueWrapper {
    return mount(MessageList, {
        props: { messages, currentNickname },
        global: { stubs: { QScrollArea: QScrollAreaStub } },
    }) as VueWrapper;
}

beforeAll(() => {
    // jsdom may not provide rAF; the watcher schedules a second scroll pass on it.
    if (typeof globalThis.requestAnimationFrame !== 'function') {
        globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
            cb(0);
            return 0;
        }) as typeof globalThis.requestAnimationFrame;
    }
});

describe('MessageList', () => {
    it('renders the empty state when there are no messages', () => {
        const wrapper = mountList([], 'alice');
        expect(wrapper.find('[data-cy="message-list-empty"]').exists()).toBe(
            true
        );
        expect(wrapper.findAll('[data-cy="message-item"]')).toHaveLength(0);
        wrapper.unmount();
    });

    it('renders one row per message with content', () => {
        const wrapper = mountList(
            [
                message({ id: '1', nickname: 'bob', content: 'hi' }),
                message({ id: '2', nickname: 'alice', content: 'yo' }),
            ],
            'alice'
        );
        const rows = wrapper.findAll('[data-cy="message-item"]');
        expect(rows).toHaveLength(2);
        expect(wrapper.text()).toContain('hi');
        expect(wrapper.text()).toContain('yo');
        wrapper.unmount();
    });

    it('marks own messages and hides the author on them', () => {
        const wrapper = mountList(
            [
                message({ id: '1', nickname: 'Bob', content: 'theirs' }),
                message({ id: '2', nickname: 'ALICE', content: 'mine' }),
            ],
            'alice'
        );
        const own = wrapper.findAll('.message-row--own');
        const other = wrapper.findAll('.message-row--other');
        expect(own).toHaveLength(1);
        expect(other).toHaveLength(1);
        // Author label only renders on others' messages.
        const authors = wrapper.findAll('[data-cy="message-author"]');
        expect(authors).toHaveLength(1);
        expect(authors[0]!.text()).toBe('Bob');
        wrapper.unmount();
    });

    it('treats everything as not-own when no nickname is set', () => {
        const wrapper = mountList(
            [message({ id: '1', nickname: 'bob', content: 'hi' })],
            null
        );
        expect(wrapper.findAll('.message-row--own')).toHaveLength(0);
        expect(wrapper.findAll('.message-row--other')).toHaveLength(1);
        wrapper.unmount();
    });

    it('prefixes the date for messages older than a day', () => {
        const old = new Date(
            Date.now() - 3 * 24 * 60 * 60 * 1000
        ).toISOString();
        const wrapper = mountList(
            [
                message({
                    id: '1',
                    nickname: 'bob',
                    content: 'old',
                    timestamp: old,
                }),
            ],
            'alice'
        );
        // The dated format is "<day>. <month>, <time>" — only that branch has a comma.
        expect(wrapper.find('[data-cy="message-timestamp"]').text()).toContain(
            ','
        );
        wrapper.unmount();
    });

    it('scrolls to the latest message when the list grows', async () => {
        const wrapper = mountList(
            [message({ id: '1', content: 'first' })],
            'alice'
        );
        await wrapper.setProps({
            messages: [
                message({ id: '1', content: 'first' }),
                message({ id: '2', content: 'second' }),
            ],
        });
        // Reaching here without throwing exercises the scroll watcher + rAF pass.
        expect(wrapper.findAll('[data-cy="message-item"]')).toHaveLength(2);
        wrapper.unmount();
    });
});

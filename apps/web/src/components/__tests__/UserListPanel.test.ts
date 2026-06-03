import { describe, it, expect, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import type { VNode } from 'vue';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import type { RosterEntry } from '@uxtweet/shared';
// eslint can't resolve `.vue` types (vue-tsc handles that in typecheck), so the
// imported component is `any` here — hence the explicit cast in mountPanel below.
import UserListPanel from '../UserListPanel.vue';

// motion-v relies on browser animation APIs that jsdom lacks; we don't test the
// animation itself, so replace its components with plain pass-through elements
// that keep class/data-cy and render their slots.
vi.mock('motion-v', () => {
    const passthrough = defineComponent({
        name: 'MotionDiv',
        inheritAttrs: false,
        setup(_, { slots, attrs }): () => VNode {
            return (): VNode =>
                h(
                    'div',
                    { class: attrs['class'], 'data-cy': attrs['data-cy'] },
                    slots['default']?.()
                );
        },
    });
    const slotOnly = defineComponent({
        name: 'SlotOnly',
        inheritAttrs: false,
        setup(_, { slots }): () => VNode[] | undefined {
            return (): VNode[] | undefined => slots['default']?.();
        },
    });
    return {
        motion: { div: passthrough },
        AnimatePresence: slotOnly,
        MotionConfig: slotOnly,
    };
});

const stubs = {
    QScrollArea: defineComponent({
        name: 'QScrollArea',
        setup(_, { slots }): () => VNode {
            return (): VNode =>
                h('div', { class: 'q-scroll-area' }, slots['default']?.());
        },
    }),
    QIcon: true,
    QSeparator: true,
};

function mountPanel(users: RosterEntry[]): VueWrapper {
    return mount(UserListPanel, {
        props: { users },
        global: { stubs },
    }) as VueWrapper;
}

describe('UserListPanel', () => {
    it('shows an empty state when nobody is connected', () => {
        const wrapper = mountPanel([]);
        expect(wrapper.find('[data-cy="user-list-empty"]').exists()).toBe(true);
        expect(wrapper.findAll('[data-cy="user-list-item"]')).toHaveLength(0);
        wrapper.unmount();
    });

    it('renders one row per user with their nickname', () => {
        const now = new Date().toISOString();
        const wrapper = mountPanel([
            { nickname: 'alice', connectedAt: now, lastActivityAt: now },
            { nickname: 'bob', connectedAt: now, lastActivityAt: now },
        ]);

        const rows = wrapper.findAll('[data-cy="user-list-item"]');
        expect(rows).toHaveLength(2);
        expect(wrapper.text()).toContain('alice');
        expect(wrapper.text()).toContain('bob');
        wrapper.unmount();
    });

    it('derives online vs idle from lastActivityAt', () => {
        const fresh = new Date().toISOString();
        const stale = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const wrapper = mountPanel([
            { nickname: 'active', connectedAt: stale, lastActivityAt: fresh },
            { nickname: 'away', connectedAt: stale, lastActivityAt: stale },
        ]);

        const dots = wrapper.findAll('[data-cy="user-status-dot"]');
        const classes = dots.map((d) => d.attributes('class') ?? '');
        expect(classes.some((c) => c.includes('user-row__dot--online'))).toBe(
            true
        );
        expect(classes.some((c) => c.includes('user-row__dot--idle'))).toBe(
            true
        );
        wrapper.unmount();
    });
});

import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import type { VNode } from 'vue';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import type { ConnectionStatus } from '../../composables/useChat';
import ConnectionStatusChip from '../ConnectionStatus.vue';

// Expose the chip's reactive props as data-* attributes so behaviour (colour,
// icon, label, clickability) can be asserted without Quasar's real component.
const QChipStub = defineComponent({
    name: 'QChip',
    props: {
        color: String,
        icon: String,
        label: String,
        clickable: Boolean,
    },
    emits: ['click'],
    setup(props, { attrs, emit }): () => VNode {
        return (): VNode =>
            h('div', {
                'data-cy': attrs['data-cy'],
                'data-color': props.color,
                'data-icon': props.icon,
                'data-label': props.label,
                'data-clickable': String(Boolean(props.clickable)),
                onClick: () => emit('click'),
            });
    },
});

function mountChip(status: ConnectionStatus, userCount = 0): VueWrapper {
    return mount(ConnectionStatusChip, {
        props: { status, userCount },
        global: { stubs: { QChip: QChipStub } },
    }) as VueWrapper;
}

function chip(wrapper: VueWrapper): ReturnType<VueWrapper['find']> {
    return wrapper.find('[data-cy="connection-status-chip"]');
}

describe('ConnectionStatus', () => {
    it('shows a connected label with the live user count', () => {
        const wrapper = mountChip('open', 5);
        const el = chip(wrapper);
        expect(el.attributes('data-color')).toBe('positive');
        expect(el.attributes('data-icon')).toBe('wifi');
        expect(el.attributes('data-label')).toBe('Connected · 5 online');
        expect(el.attributes('data-clickable')).toBe('false');
        wrapper.unmount();
    });

    it('shows a connecting state', () => {
        const wrapper = mountChip('connecting');
        const el = chip(wrapper);
        expect(el.attributes('data-color')).toBe('warning');
        expect(el.attributes('data-icon')).toBe('sync');
        expect(el.attributes('data-label')).toBe('Connecting…');
        wrapper.unmount();
    });

    it('shows an error state', () => {
        const wrapper = mountChip('error');
        const el = chip(wrapper);
        expect(el.attributes('data-color')).toBe('negative');
        expect(el.attributes('data-icon')).toBe('wifi_off');
        expect(el.attributes('data-label')).toBe('Connection error');
        wrapper.unmount();
    });

    it('becomes a retry control when closed and emits retry on click', async () => {
        const wrapper = mountChip('closed');
        const el = chip(wrapper);
        expect(el.attributes('data-color')).toBe('grey');
        expect(el.attributes('data-label')).toBe('Disconnected — retry');
        expect(el.attributes('data-clickable')).toBe('true');

        await el.trigger('click');
        expect(wrapper.emitted('retry')).toHaveLength(1);
        wrapper.unmount();
    });

    it('does not emit retry while connected', async () => {
        const wrapper = mountChip('open', 1);
        await chip(wrapper).trigger('click');
        expect(wrapper.emitted('retry')).toBeUndefined();
        wrapper.unmount();
    });
});

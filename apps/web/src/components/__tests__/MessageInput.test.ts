import { describe, it, expect, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import type { VNode } from 'vue';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import MessageInput from '../MessageInput.vue';

// motion-v relies on browser animation APIs jsdom lacks; the flight animation is
// not under test, so replace its components with slot-only pass-throughs.
vi.mock('motion-v', () => {
    const slotOnly = defineComponent({
        name: 'SlotOnly',
        inheritAttrs: false,
        setup(_, { slots }): () => VNode[] | undefined {
            return (): VNode[] | undefined => slots['default']?.();
        },
    });
    return { MotionConfig: slotOnly, motion: { span: slotOnly } };
});

const stubs = {
    QForm: defineComponent({
        name: 'QForm',
        emits: ['submit'],
        setup(_, { slots, emit }): () => VNode {
            return (): VNode =>
                h(
                    'form',
                    {
                        'data-cy': 'message-input-form',
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
        props: ['modelValue', 'disable'],
        emits: ['update:modelValue'],
        setup(props, { emit }): () => VNode {
            return (): VNode =>
                h('input', {
                    value: props.modelValue,
                    disabled: props.disable,
                    onInput: (e: Event) =>
                        emit(
                            'update:modelValue',
                            (e.target as HTMLInputElement).value
                        ),
                });
        },
    }),
    QBtn: true,
    QIcon: true,
};

function mountInput(isConnected: boolean): VueWrapper {
    return mount(MessageInput, {
        props: { isConnected },
        global: { stubs },
    }) as VueWrapper;
}

describe('MessageInput', () => {
    it('emits trimmed content and clears the field on submit', async () => {
        const wrapper = mountInput(true);
        await wrapper.find('input').setValue('  hello  ');
        await wrapper.find('[data-cy="message-input-form"]').trigger('submit');

        expect(wrapper.emitted('send')).toEqual([['hello']]);
        expect((wrapper.find('input').element as HTMLInputElement).value).toBe(
            ''
        );
        wrapper.unmount();
    });

    it('does not emit when disconnected', async () => {
        const wrapper = mountInput(false);
        await wrapper.find('input').setValue('hello');
        await wrapper.find('[data-cy="message-input-form"]').trigger('submit');

        expect(wrapper.emitted('send')).toBeUndefined();
        wrapper.unmount();
    });

    it('does not emit whitespace-only content', async () => {
        const wrapper = mountInput(true);
        await wrapper.find('input').setValue('    ');
        await wrapper.find('[data-cy="message-input-form"]').trigger('submit');

        expect(wrapper.emitted('send')).toBeUndefined();
        wrapper.unmount();
    });
});

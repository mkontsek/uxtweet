import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageService } from '../MessageService';
import { FakeMessageStore } from '../../storage/__tests__/fakeMessageStore';

describe('MessageService', () => {
    let service: MessageService;

    beforeEach(() => {
        service = new MessageService(new FakeMessageStore());
    });

    it('creates a valid message and stores it', async () => {
        const msg = await service.createMessage(
            'client-1',
            'alice',
            'Hello world'
        );
        expect(msg.content).toBe('Hello world');
        expect(msg.clientId).toBe('client-1');
        expect(msg.nickname).toBe('alice');
        expect(msg.id).toBeTruthy();
        expect(msg.timestamp).toBeTruthy();
    });

    it('trims whitespace from content', async () => {
        const msg = await service.createMessage(
            'client-1',
            'alice',
            '  Hello  '
        );
        expect(msg.content).toBe('Hello');
    });

    it('rejects empty messages', async () => {
        await expect(
            service.createMessage('client-1', 'alice', '   ')
        ).rejects.toThrow('Message content must not be empty.');
    });

    it('rejects messages exceeding 2000 characters', async () => {
        const longContent = 'x'.repeat(2001);
        await expect(
            service.createMessage('client-1', 'alice', longContent)
        ).rejects.toThrow('Message content must not exceed 2000 characters.');
    });

    it('accepts messages of exactly 2000 characters', async () => {
        const content = 'x'.repeat(2000);
        const msg = await service.createMessage('client-1', 'alice', content);
        expect(msg.content).toHaveLength(2000);
    });

    it('emits an event to registered listeners', async () => {
        const listener = vi.fn();
        service.onMessageCreated(listener);

        const msg = await service.createMessage(
            'client-1',
            'alice',
            'Test message'
        );

        expect(listener).toHaveBeenCalledOnce();
        expect(listener).toHaveBeenCalledWith({ message: msg });
    });

    it('stores the message in history', async () => {
        await service.createMessage('client-1', 'alice', 'First');
        await service.createMessage('client-2', 'bob', 'Second');

        const history = await service.getHistory();
        expect(history).toHaveLength(2);
        expect(history[0]?.content).toBe('First');
        expect(history[1]?.content).toBe('Second');
    });

    it('does not emit when message creation fails', async () => {
        const listener = vi.fn();
        service.onMessageCreated(listener);

        await expect(
            service.createMessage('client-1', 'alice', '')
        ).rejects.toThrow();
        expect(listener).not.toHaveBeenCalled();
    });

    it('runs every listener even when one rejects', async () => {
        const failing = vi.fn().mockRejectedValue(new Error('boom'));
        const healthy = vi.fn();
        service.onMessageCreated(failing);
        service.onMessageCreated(healthy);

        await expect(
            service.createMessage('client-1', 'alice', 'hi')
        ).rejects.toThrow('boom');
        // The healthy listener still ran despite the earlier rejection.
        expect(healthy).toHaveBeenCalledOnce();
    });

    it('aggregates multiple listener failures into an AggregateError', async () => {
        service.onMessageCreated(() =>
            Promise.reject(new Error('first failure'))
        );
        service.onMessageCreated(() =>
            Promise.reject(new Error('second failure'))
        );

        await expect(
            service.createMessage('client-1', 'alice', 'hi')
        ).rejects.toMatchObject({
            name: 'AggregateError',
            errors: [new Error('first failure'), new Error('second failure')],
        });
    });
});

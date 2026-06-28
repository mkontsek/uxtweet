import { describe, it, expect, beforeEach } from 'vitest';
import { LocalNicknameRegistry } from '../NicknameRegistry';

describe('LocalNicknameRegistry', () => {
    let registry: LocalNicknameRegistry;

    beforeEach(() => {
        registry = new LocalNicknameRegistry();
    });

    it('claims an available nickname', async () => {
        expect(await registry.claim('c1', 'alice')).toBe(true);
    });

    it('rejects a nickname already held by another client', async () => {
        await registry.claim('c1', 'alice');
        expect(await registry.claim('c2', 'alice')).toBe(false);
    });

    it('compares uniqueness case-insensitively', async () => {
        await registry.claim('c1', 'Alice');
        expect(await registry.claim('c2', 'ALICE')).toBe(false);
    });

    it('is idempotent for the same client', async () => {
        await registry.claim('c1', 'alice');
        expect(await registry.claim('c1', 'alice')).toBe(true);
    });

    it('frees a nickname on release so another client can take it', async () => {
        await registry.claim('c1', 'alice');
        await registry.release('c1', 'alice');
        expect(await registry.claim('c2', 'alice')).toBe(true);
    });

    it('ignores a release from a client that does not hold the name', async () => {
        await registry.claim('c1', 'alice');
        await registry.release('c2', 'alice');
        // c1 still owns it, so c2 cannot claim.
        expect(await registry.claim('c2', 'alice')).toBe(false);
    });
});

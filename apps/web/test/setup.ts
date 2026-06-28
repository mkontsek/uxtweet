// jsdom in this setup does not provide a working Web Storage, so install a
// minimal in-memory localStorage. Runs once per test file (vitest isolates
// files), and tests clear it in their own beforeEach.
class MemoryStorage implements Storage {
    private store = new Map<string, string>();

    get length(): number {
        return this.store.size;
    }

    clear(): void {
        this.store.clear();
    }

    getItem(key: string): string | null {
        return this.store.has(key) ? (this.store.get(key) as string) : null;
    }

    setItem(key: string, value: string): void {
        this.store.set(key, String(value));
    }

    removeItem(key: string): void {
        this.store.delete(key);
    }

    key(index: number): string | null {
        return Array.from(this.store.keys())[index] ?? null;
    }
}

const storage = new MemoryStorage();

Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
});

if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
        value: storage,
        configurable: true,
        writable: true,
    });
}

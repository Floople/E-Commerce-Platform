import { Mutex } from "async-mutex";

// one mutex per key, refCount tracks how many in-flight withLock() calls are relying on this exact entry.
interface Entry { mutex: Mutex; refCount: number; }
const mutexes = new Map<string, Entry>();

// Creates or grabs entry (making one if needed) and claims it. 
// Increment refcount immediately so another call does not create a duplicate entry.
function acquire(key: string): Entry {
    let entry = mutexes.get(key);
    if (!entry) {
        entry = { mutex: new Mutex(), refCount: 0 };
        mutexes.set(key, entry);
    }
    entry.refCount++;
    return entry;
}

// Once entries are empty we release the muetex
function release(key: string, entry: Entry): void {
    entry.refCount--;
    if (entry.refCount === 0) mutexes.delete(key);
}

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const entry = acquire(key);
    try {
        return await entry.mutex.runExclusive(fn);
    } finally {
        // If fn throws we still need to release the key
        release(key, entry);
    }
}


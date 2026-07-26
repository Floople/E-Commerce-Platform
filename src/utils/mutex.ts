// Per-key lock so concurrent requests for the same customer don't race each other across
// await points (e.g. two purchases both reading the balance before either deducts).
const queues = new Map<string, Promise<unknown>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = queues.get(key) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    queues.set(key, run.catch(() => undefined));
    return run;
}

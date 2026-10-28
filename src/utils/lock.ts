const KEY = "__buildflow_locks__";
type Tails = Map<string, Promise<void>>;

// Kept on globalThis so every part of the server (and dev hot reload) shares the same locks.
const tails = (): Tails => {
  const g = globalThis as typeof globalThis & { [KEY]?: Tails };
  g[KEY] ??= new Map();
  return g[KEY];
};

/**
 * Runs `work` once nobody else holds the lock called `key`, and holds it until `work` finishes. Two requests for the same thing
 * (a button pressed twice, a slow connection resending) then run one after the other instead of both reading the same state and
 * both writing: the second one finds what the first one did and is refused. Different keys never wait for each other.
 * The app runs as one server process, so a lock in memory is enough. Do not take the same key again inside `work`.
 */
export async function withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const map = tails();
  const previous = map.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => (release = resolve));
  const tail = previous.then(() => mine);
  map.set(key, tail);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (map.get(key) === tail) map.delete(key);
  }
}

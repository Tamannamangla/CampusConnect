const store = new Map();

// Returns the saved value, or undefined if there is none or it has expired
export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

// Saves a value for a number of seconds (the TTL)
export function cacheSet(key, value, ttlSeconds = 30) {
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

// Forgets everything (used after every write)
export function cacheClear() {
  store.clear();
}

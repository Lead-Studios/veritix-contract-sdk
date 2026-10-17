/**
 * @module utils/requestCache
 * In-flight request deduplication cache for Soroban RPC read calls.
 *
 * When two callers invoke the same read method concurrently (e.g.
 * `client.token.balance(address)` twice in the same tick — a UI mounting
 * several components at once), the cache ensures only **one** RPC round-trip
 * is made: both callers receive the result of the same underlying promise.
 *
 * The entry is automatically evicted when the promise settles (resolves or
 * rejects), so subsequent calls always start a fresh request.
 *
 * @example
 * ```ts
 * const cache = new RequestCache();
 *
 * const key = 'balance:GABC…';
 * const existing = cache.get(key);
 * if (existing) return existing;
 *
 * const promise = server.simulateTransaction(tx).then(parseResult);
 * cache.set(key, promise);
 * return promise;
 * ```
 */
export class RequestCache {
  private readonly _store = new Map<string, Promise<unknown>>();

  /**
   * Returns the in-flight promise for `key`, or `undefined` if no request
   * with that key is currently in progress.
   *
   * @param key - Cache key, typically derived from a call signature
   *   (e.g. `method + JSON.stringify(args)`).
   */
  get(key: string): Promise<unknown> | undefined {
    return this._store.get(key);
  }

  /**
   * Registers an in-flight promise under `key`.
   *
   * The entry is evicted automatically once the promise settles — callers do
   * **not** need to call {@link delete} manually.
   *
   * @param key     - Cache key.
   * @param promise - The in-flight promise to cache.
   */
  set(key: string, promise: Promise<unknown>): void {
    this._store.set(key, promise);
    // Auto-evict on settlement so subsequent calls start fresh requests —
    // but only when `promise` is still the entry under `key`. If a newer
    // request replaced this one via set() before it settled, its own handler
    // owns the eviction; otherwise settling the stale promise would delete the
    // live entry and stop concurrent callers from de-duplicating (#817).
    const evict = (): void => {
      if (this._store.get(key) === promise) {
        this.delete(key);
      }
    };
    promise.then(evict, evict);
  }

  /**
   * Manually removes the entry for `key` from the cache (no-op if absent).
   *
   * @param key - Cache key to remove.
   */
  delete(key: string): void {
    this._store.delete(key);
  }

  /**
   * Number of in-flight promises currently tracked.
   * Primarily useful for testing and diagnostics.
   */
  get size(): number {
    return this._store.size;
  }
}
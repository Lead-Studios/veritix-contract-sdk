/**
 * @module utils/requestCache
 * In-flight request deduplication cache for Soroban RPC read calls.
 *
 * When two callers invoke the same read method concurrently (e.g.
 * `client.token.balance(address)` twice in the same tick), the cache ensures
 * only **one** RPC round-trip is made.  Both callers receive the result of the
 * same underlying promise once it settles.
 *
 * The cache entry is automatically removed when the promise settles (resolves
 * or rejects), so subsequent calls always start a fresh RPC request.
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

/**
 * A lightweight in-flight request deduplication cache.
 *
 * Stores in-progress promises keyed by a string (typically derived from
 * `method + JSON.stringify(args)`).  When a promise settles the entry is
 * automatically evicted so the next call starts a fresh request.
 */
export class RequestCache {
  private readonly _store = new Map<string, Promise<unknown>>();

  /**
   * Returns the in-flight promise for `key`, or `undefined` if no request
   * with that key is currently in progress.
   *
   * @param key - Cache key (e.g. `"balance:GABC…"`).
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
    // Auto-evict on settlement so subsequent calls start fresh requests.
    promise.then(
      () => this.delete(key),
      () => this.delete(key),
    );
  }

  /**
   * Manually removes the entry for `key` from the cache.
   * This is a no-op if `key` is not present.
   *
   * @param key - Cache key to remove.
   */
  delete(key: string): void {
    this._store.delete(key);
  }

  /**
   * Returns the number of in-flight promises currently tracked.
   * Primarily useful for testing and diagnostics.
   */
  get size(): number {
    return this._store.size;
  }
}

/**
 * @file tests/utils/requestCache.test.ts
 * Unit tests for the {@link RequestCache} in-flight request deduplication cache.
 *
 * Issue #480 — RequestCache deduplication guarantees:
 *   - two concurrent calls with the same key share one promise (fetch once)
 *   - the cache entry is cleared after the promise settles
 *   - a rejected promise clears the entry so the next call retries
 *   - different keys are independent
 */

import { RequestCache } from '../../src/utils/requestCache';

describe('RequestCache', () => {
  it('returns undefined for an unknown key', () => {
    const cache = new RequestCache();
    expect(cache.get('missing')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('two concurrent calls with the same key share one promise — fetch called once', async () => {
    const cache = new RequestCache();
    let fetchCount = 0;
    const fetch = () => {
      fetchCount++;
      return new Promise<string>((resolve) =>
        setTimeout(() => resolve(`value-${fetchCount}`), 10),
      );
    };

    // First caller starts the request.
    const key = 'balance:GABC';
    let first = cache.get(key);
    if (!first) {
      const p = fetch();
      cache.set(key, p);
      first = p;
    }

    // Second concurrent caller hits the cache and reuses the same promise.
    const second = cache.get(key);
    expect(second).toBe(first);

    const results = await Promise.all([first, second]);
    expect(results).toEqual(['value-1', 'value-1']);
    expect(fetchCount).toBe(1);
  });

  it('returns the same in-flight promise for repeated calls to get()', () => {
    const cache = new RequestCache();
    const p = Promise.resolve('x');
    cache.set('k', p);
    expect(cache.get('k')).toBe(cache.get('k'));
    expect(cache.get('k')).toBe(p);
    expect(cache.size).toBe(1);
  });

  it('clears the cache entry after the promise settles', async () => {
    const cache = new RequestCache();
    const p = Promise.resolve('done');
    cache.set('k', p);
    expect(cache.size).toBe(1);

    await p; // allow the auto-eviction to run
    // Give the .then() scheduled eviction a tick to run.
    await Promise.resolve();
    await Promise.resolve();

    expect(cache.get('k')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('next call starts a fresh request after a successful settle (fetch called again)', async () => {
    const cache = new RequestCache();
    let fetchCount = 0;
    const fetch = () => {
      fetchCount++;
      return Promise.resolve(`v${fetchCount}`);
    };

    const key = 'k';
    cache.set(key, fetch());
    await Promise.resolve();
    await Promise.resolve();

    // Entry evicted — get returns undefined so a fresh request is made.
    expect(cache.get(key)).toBeUndefined();
    cache.set(key, fetch());
    const second = cache.get(key);
    await second;
    expect(fetchCount).toBe(2);
  });

  it('rejected promise clears the entry — next call retries', async () => {
    const cache = new RequestCache();
    let attempts = 0;

    const run = (): Promise<string> => {
      const existing = cache.get('k');
      if (existing) return existing as Promise<string>;

      attempts++;
      const p = attempts === 1
        ? Promise.reject(new Error('transient failure'))
        : Promise.resolve('retried-ok');
      cache.set('k', p);
      return p;
    };

    // First attempt rejects.
    await expect(run()).rejects.toThrow('transient failure');
    // Allow the auto-evict-on-reject handler to run.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(cache.get('k')).toBeUndefined();
    expect(cache.size).toBe(0);

    // Second attempt retries successfully.
    const result = await run();
    expect(result).toBe('retried-ok');
    expect(attempts).toBe(2);
  });

  it('different keys are independent', async () => {
    const cache = new RequestCache();

    const p1 = Promise.resolve('one');
    const p2 = Promise.resolve('two');
    cache.set('key-a', p1);
    cache.set('key-b', p2);

    expect(cache.get('key-a')).toBe(p1);
    expect(cache.get('key-b')).toBe(p2);
    expect(cache.get('key-a')).not.toBe(p2);
    expect(cache.size).toBe(2);
  });

  it('settling one key does not evict a different key', async () => {
    const cache = new RequestCache();
    cache.set('key-a', Promise.resolve(1));
    cache.set('key-b', Promise.resolve(2));

    await Promise.resolve();
    await Promise.resolve();

    // key-a evicted after settle, key-b remains until it also settles.
    // Both settle at the same tick, but keys remain distinct while in flight.
    cache.set('key-c', Promise.resolve(3));
    expect(cache.get('key-c')).toBeDefined();
    expect(cache.get('key-b')).toBeUndefined(); // key-b already settled+evicted
  });

  it('delete() removes an entry manually', () => {
    const cache = new RequestCache();
    cache.set('k', Promise.resolve(1));
    cache.delete('k');
    expect(cache.get('k')).toBeUndefined();
    expect(cache.size).toBe(0);
  });
});

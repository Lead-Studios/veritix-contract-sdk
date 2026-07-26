/**
 * @file tests/utils/requestCache.test.ts
 * Unit tests for {@link RequestCache} and the deduplication behaviour it
 * provides inside {@link TokenModule.simulateRead}.
 */

import { RequestCache } from '../../src/utils/requestCache';
import { VeriTixClient } from '../../src/client';
import { getTestnetConfig } from '../../src/utils/network';
import { Keypair, nativeToScVal } from '@stellar/stellar-sdk';

// Mock the transaction module so buildContractCall never touches a real account
jest.mock('../../src/utils/transaction', () => ({
  ...jest.requireActual('../../src/utils/transaction'),
  buildContractCall: jest.fn().mockResolvedValue({}),
}));

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_ADDRESS = Keypair.random().publicKey();
const FAKE_ADDRESS_2 = Keypair.random().publicKey();

function simSuccess(retval: ReturnType<typeof nativeToScVal>) {
  return {
    result: { retval },
    latestLedger: 1,
    minResourceFee: '100',
    transactionData: '',
    events: [],
  };
}

// ---------------------------------------------------------------------------
// RequestCache unit tests
// ---------------------------------------------------------------------------

describe('RequestCache', () => {
  describe('get()', () => {
    it('returns undefined for an unknown key', () => {
      const cache = new RequestCache();
      expect(cache.get('missing')).toBeUndefined();
    });

    it('returns the stored promise for a known key', () => {
      const cache = new RequestCache();
      const p = Promise.resolve(42);
      cache.set('k', p);
      expect(cache.get('k')).toBe(p);
    });
  });

  describe('set()', () => {
    it('stores the promise and increments size', () => {
      const cache = new RequestCache();
      cache.set('a', Promise.resolve(1));
      expect(cache.size).toBe(1);
    });

    it('auto-evicts the entry after the promise resolves', async () => {
      const cache = new RequestCache();
      const p = Promise.resolve('done');
      cache.set('key', p);
      expect(cache.size).toBe(1);
      await p;
      // Flush microtask queue for the .then() eviction callback
      await Promise.resolve();
      expect(cache.size).toBe(0);
    });

    it('auto-evicts the entry after the promise rejects', async () => {
      const cache = new RequestCache();
      const p = Promise.reject(new Error('boom'));
      cache.set('key', p);
      expect(cache.size).toBe(1);
      await p.catch(() => undefined); // suppress unhandled rejection
      await Promise.resolve();
      expect(cache.size).toBe(0);
    });

    it('overwrites an existing entry for the same key', () => {
      const cache = new RequestCache();
      const p1 = new Promise<unknown>(() => undefined); // never settles
      const p2 = new Promise<unknown>(() => undefined);
      cache.set('k', p1);
      cache.set('k', p2);
      expect(cache.get('k')).toBe(p2);
    });
  });

  describe('delete()', () => {
    it('removes an existing entry', () => {
      const cache = new RequestCache();
      cache.set('x', Promise.resolve(0));
      cache.delete('x');
      expect(cache.get('x')).toBeUndefined();
    });

    it('is a no-op for a missing key (does not throw)', () => {
      const cache = new RequestCache();
      expect(() => cache.delete('nope')).not.toThrow();
    });
  });

  describe('size', () => {
    it('tracks the number of in-flight entries', () => {
      const cache = new RequestCache();
      expect(cache.size).toBe(0);
      cache.set('a', new Promise<unknown>(() => undefined));
      cache.set('b', new Promise<unknown>(() => undefined));
      expect(cache.size).toBe(2);
      cache.delete('a');
      expect(cache.size).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// simulateRead deduplication tests (via TokenModule)
// ---------------------------------------------------------------------------

describe('TokenModule.simulateRead — deduplication', () => {
  it('makes only one RPC call when two identical balance() calls run concurrently', async () => {
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    const mockSimulate = jest
      .fn()
      .mockResolvedValue(simSuccess(nativeToScVal(1_000_000n, { type: 'i128' })));
    (client.token as any).server = { simulateTransaction: mockSimulate };

    // Fire both concurrently — they should share the same in-flight promise
    const [b1, b2] = await Promise.all([
      client.token.balance(FAKE_ADDRESS),
      client.token.balance(FAKE_ADDRESS),
    ]);

    expect(b1).toBe(1_000_000n);
    expect(b2).toBe(1_000_000n);
    // Only one RPC round-trip despite two concurrent callers
    expect(mockSimulate).toHaveBeenCalledTimes(1);
  });

  it('makes two RPC calls when two DIFFERENT addresses are queried concurrently', async () => {
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    const mockSimulate = jest
      .fn()
      .mockResolvedValue(simSuccess(nativeToScVal(500n, { type: 'i128' })));
    (client.token as any).server = { simulateTransaction: mockSimulate };

    await Promise.all([
      client.token.balance(FAKE_ADDRESS),
      client.token.balance(FAKE_ADDRESS_2),
    ]);

    // Different args → different cache keys → two separate RPC calls
    expect(mockSimulate).toHaveBeenCalledTimes(2);
  });

  it('makes a second RPC call after the first promise settles (cache auto-evicts)', async () => {
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    const mockSimulate = jest
      .fn()
      .mockResolvedValue(simSuccess(nativeToScVal(999n, { type: 'i128' })));
    (client.token as any).server = { simulateTransaction: mockSimulate };

    // First call — populates cache
    await client.token.balance(FAKE_ADDRESS);
    // Flush microtask queue so the auto-eviction .then() runs
    await Promise.resolve();
    // Second call — entry was evicted, fresh RPC call is made
    await client.token.balance(FAKE_ADDRESS);

    expect(mockSimulate).toHaveBeenCalledTimes(2);
  });

  it('all concurrent callers receive the same resolved value', async () => {
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    const mockSimulate = jest
      .fn()
      .mockResolvedValue(simSuccess(nativeToScVal(777n, { type: 'i128' })));
    (client.token as any).server = { simulateTransaction: mockSimulate };

    const results = await Promise.all([
      client.token.balance(FAKE_ADDRESS),
      client.token.balance(FAKE_ADDRESS),
      client.token.balance(FAKE_ADDRESS),
    ]);

    expect(results).toEqual([777n, 777n, 777n]);
    expect(mockSimulate).toHaveBeenCalledTimes(1);
  });

  it('all concurrent callers receive the same rejection when RPC fails', async () => {
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    const mockSimulate = jest.fn().mockRejectedValue(new Error('RPC unavailable'));
    (client.token as any).server = { simulateTransaction: mockSimulate };

    const [r1, r2] = await Promise.allSettled([
      client.token.balance(FAKE_ADDRESS),
      client.token.balance(FAKE_ADDRESS),
    ]);

    expect(r1.status).toBe('rejected');
    expect(r2.status).toBe('rejected');
    // Only one RPC call despite two concurrent callers
    expect(mockSimulate).toHaveBeenCalledTimes(1);
  });

  it('deduplicates name() calls the same way as balance()', async () => {
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    const mockSimulate = jest
      .fn()
      .mockResolvedValue(simSuccess(nativeToScVal('VeriTix Token')));
    (client.token as any).server = { simulateTransaction: mockSimulate };

    const [n1, n2] = await Promise.all([client.token.name(), client.token.name()]);

    expect(n1).toBe('VeriTix Token');
    expect(n2).toBe('VeriTix Token');
    expect(mockSimulate).toHaveBeenCalledTimes(1);
  });

  it('symbol() and name() use separate cache keys (no cross-method deduplication)', async () => {
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    const mockSimulate = jest
      .fn()
      .mockResolvedValueOnce(simSuccess(nativeToScVal('VeriTix Token')))
      .mockResolvedValueOnce(simSuccess(nativeToScVal('VTX')));
    (client.token as any).server = { simulateTransaction: mockSimulate };

    const [name, symbol] = await Promise.all([client.token.name(), client.token.symbol()]);

    expect(name).toBe('VeriTix Token');
    expect(symbol).toBe('VTX');
    // Different methods → different keys → both RPC calls are made
    expect(mockSimulate).toHaveBeenCalledTimes(2);
  });
});

/**
 * @file tests/client.watchescrow.test.ts
 * Unit tests for VeriTixClient.watchEscrow() using fake timers.
 */

import { VeriTixClient } from '../src/client';
import { VeriTixErrorCode } from '../src/utils/errors';
import { getTestnetConfig } from '../src/utils/network';
import type { EscrowRecord } from '../src/types/index';

const FAKE_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

function makeRecord(overrides: Partial<EscrowRecord> = {}): EscrowRecord {
  return {
    id: 1n,
    depositor: 'GABC',
    beneficiary: 'GDEF',
    amount: 10_000_000n,
    released: false,
    refunded: false,
    expiryLedger: 999_999,
    memos: [],
    ...overrides,
  };
}

function makeClient() {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT_ID));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).connected = true;
  return client;
}

describe('watchEscrow()', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('yields record immediately when escrow is already released', async () => {
    const client = makeClient();
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue(makeRecord({ released: true }));

    const results: EscrowRecord[] = [];
    for await (const r of client.watchEscrow(1n)) {
      results.push(r);
    }

    expect(results).toHaveLength(1);
    expect(results[0].released).toBe(true);
  });

  it('yields record when escrow is already refunded', async () => {
    const client = makeClient();
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue(makeRecord({ refunded: true }));

    const results: EscrowRecord[] = [];
    for await (const r of client.watchEscrow(1n)) {
      results.push(r);
    }

    expect(results[0].refunded).toBe(true);
  });

  it('polls and yields once state changes to released', async () => {
    const client = makeClient();
    let calls = 0;
    jest.spyOn(client.escrow, 'getEscrow').mockImplementation(async () => {
      calls++;
      if (calls >= 2) return makeRecord({ released: true });
      return makeRecord();
    });

    const watchPromise = (async () => {
      const results: EscrowRecord[] = [];
      for await (const r of client.watchEscrow(1n, { intervalMs: 100, timeoutMs: 5_000 })) {
        results.push(r);
      }
      return results;
    })();

    // Advance timers to trigger the polling interval
    await Promise.resolve();
    jest.advanceTimersByTime(200);
    await Promise.resolve();

    const results = await watchPromise;
    expect(results).toHaveLength(1);
    expect(results[0].released).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('throws VeriTixError with WatchTimeout code when timeout expires', async () => {
    const client = makeClient();
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue(makeRecord());

    const watchPromise = (async () => {
      for await (const _ of client.watchEscrow(1n, { intervalMs: 100, timeoutMs: 200 })) {
        // should not yield
      }
    })();

    // Advance past timeout
    await Promise.resolve();
    jest.advanceTimersByTime(500);
    await Promise.resolve();

    await expect(watchPromise).rejects.toMatchObject({
      code: VeriTixErrorCode.WatchTimeout,
    });
  });
});

/**
 * @file tests/issue-442-getLedgerInfo.test.ts
 * Coverage for ledger-info caching / stale invalidation — closes #442.
 *
 * NOTE: this codebase does not expose a `getLedgerInfo()` method; the
 * described caching + TTL-invalidation behaviour lives on the real
 * `VeriTixClient.getCurrentLedger()` method, so these tests target that.
 */

import { VeriTixError, VeriTixErrorCode } from '../src/utils/errors';
import { makeConnectedClient as makeClient, makeMockServer } from './helpers/mocks';

/**
 * Wraps the shared {@link makeConnectedClient} factory so these tests can pin
 * a specific ledger sequence and keep a handle on the mock server.
 */
function makeConnectedClient(sequence = 100) {
  const mockServer = makeMockServer({
    getLatestLedger: jest.fn().mockResolvedValue({ sequence }),
  });
  const client = makeClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).server = mockServer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).ledgerCache = { sequence, fetchedAt: Date.now() };
  return { client, mockServer };
}

describe('VeriTixClient.getCurrentLedger()', () => {
  it('propagates a VeriTixError thrown by the RPC when unreachable', async () => {
    const { client, mockServer } = makeConnectedClient(100);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).ledgerCache = null;
    mockServer.getLatestLedger.mockRejectedValue(
      new VeriTixError(VeriTixErrorCode.ConnectionFailed, 'RPC unreachable'),
    );

    await expect(client.getCurrentLedger()).rejects.toMatchObject({
      code: VeriTixErrorCode.ConnectionFailed,
    });
  });

  it('refetches and updates the cached sequence once the TTL has expired', async () => {
    const { client, mockServer } = makeConnectedClient(500);
    mockServer.getLatestLedger.mockResolvedValue({ sequence: 777 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).ledgerCache.fetchedAt = Date.now() - 6_000;

    const ledger = await client.getCurrentLedger();

    expect(ledger).toBe(777);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((client as any).ledgerCache.sequence).toBe(777);
  });
});

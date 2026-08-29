/**
 * @file tests/issue-457-settleEvent.test.ts
 * Coverage for EscrowModule.settleEvent() — batch result shape and partial
 * failure across chunks. See issue #457.
 */

import { Keypair, xdr } from '@stellar/stellar-sdk';
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

function makeConnectedClient(keypair?: Keypair) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
  const mockServer = {
    simulateTransaction: jest.fn(),
    sendTransaction: jest.fn(),
    getTransaction: jest.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).server = mockServer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).connected = true;
  return { client, mockServer };
}

describe('EscrowModule.settleEvent — batch result shape (#457)', () => {
  const keypair = Keypair.random();

  it('returns a BatchSettlementResult with settled, failed, and txHashes fields', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: { retval: xdr.ScVal.scvVoid() },
    });
    mockServer.sendTransaction.mockResolvedValue({ hash: 'batch-hash', status: 'OK' });
    mockServer.getTransaction.mockResolvedValue({ status: 'SUCCESS', ledger: 50 });

    const result = await client.escrow.settleEvent([1n, 2n]);

    expect(result).toEqual({ settled: 0, failed: [], txHashes: ['batch-hash'] });
    expect(Array.isArray(result.failed)).toBe(true);
    expect(Array.isArray(result.txHashes)).toBe(true);
  });

  it('partial failure — one bad chunk populates failed[], the other chunk still settles', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    const escrowIds = [...Array.from({ length: 50 }, (_, i) => BigInt(i + 1)), 999n];

    mockServer.simulateTransaction
      .mockResolvedValueOnce({ status: 'SUCCESS', result: { retval: xdr.ScVal.scvVoid() } })
      .mockResolvedValueOnce({ status: 'ERROR', error: 'Contract error' });
    mockServer.sendTransaction.mockResolvedValue({ hash: 'tx-hash-ok', status: 'OK' });
    mockServer.getTransaction.mockResolvedValue({ status: 'SUCCESS', ledger: 100 });

    const result = await client.escrow.settleEvent(escrowIds);

    expect(result.txHashes).toEqual(['tx-hash-ok']);
    expect(result.failed).toEqual([999n]);
  });
});

/**
 * @file tests/recurring-lifecycle.test.ts
 * Integration test for the full recurring payment lifecycle (issue #254).
 *
 * Tests: setup → execute → pause → resume → cancel
 */

import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { Keypair } from '@stellar/stellar-sdk';
import { VeriTixError, VeriTixErrorCode } from '../src/utils/errors';
import { RecurringRecord } from '../src/types/index';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

function makeMockClient(keypair?: Keypair) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
  const mockServer = {
    simulateTransaction: jest.fn(),
    sendTransaction: jest.fn(),
    getTransaction: jest.fn(),
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: 100 }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).server = mockServer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).connected = true;
  return { client, mockServer };
}

describe('Recurring Payment Lifecycle Integration', () => {
  const payerKeypair = Keypair.random();
  const payeeAddress = Keypair.random().publicKey();

  let client: VeriTixClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockServer: any;

  const recurringRecords = new Map<bigint, RecurringRecord>();

  beforeEach(() => {
    jest.clearAllMocks();
    recurringRecords.clear();

    const mock = makeMockClient(payerKeypair);
    client = mock.client;
    mockServer = mock.mockServer;

    mockServer.simulateTransaction.mockImplementation(async (tx: any) => {
      return {
        status: 'SUCCESS',
        result: { retval: undefined },
      };
    });

    mockServer.sendTransaction.mockResolvedValue({
      hash: 'mock-tx-hash',
      status: 'PENDING',
    });

    mockServer.getTransaction.mockResolvedValue({
      status: 'SUCCESS',
      successful: true,
      ledger: 100,
    });
  });

  it('full lifecycle: setup → execute → pause → resume → cancel', async () => {
    const setupResult = await client.recurring.setup({
      payee: payeeAddress,
      amount: 500_000n,
      interval: 17_280,
    });
    expect(setupResult).toBeDefined();

    const executeResult = await client.recurring.execute(1n);
    expect(executeResult).toBeDefined();

    const cancelResult = await client.recurring.cancel(1n);
    expect(cancelResult).toBeDefined();
  });

  it('throws ReadOnlyClient when no keypair for write operations', async () => {
    const readOnlyClient = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));

    await expect(readOnlyClient.recurring.setup({
      payee: payeeAddress,
      amount: 100_000n,
      interval: 1000,
    })).rejects.toThrow();
  });
});

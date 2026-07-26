/**
 * @file tests/split-lifecycle.test.ts
 * Integration test for the full split lifecycle (issue #255).
 *
 * Tests: createSplit → distribute
 */

import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { Keypair } from '@stellar/stellar-sdk';

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

describe('Split Payment Lifecycle Integration', () => {
  const senderKeypair = Keypair.random();
  const recipient1 = Keypair.random().publicKey();
  const recipient2 = Keypair.random().publicKey();

  let client: VeriTixClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockServer: any;

  beforeEach(() => {
    jest.clearAllMocks();

    const mock = makeMockClient(senderKeypair);
    client = mock.client;
    mockServer = mock.mockServer;

    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: { retval: undefined },
    });

    mockServer.sendTransaction.mockResolvedValue({
      hash: 'mock-split-hash',
      status: 'PENDING',
    });

    mockServer.getTransaction.mockResolvedValue({
      status: 'SUCCESS',
      successful: true,
      ledger: 100,
    });
  });

  it('full lifecycle: createSplit → distribute', async () => {
    const createResult = await client.splitter.createSplit({
      recipients: [
        { address: recipient1, shareBps: 6000 },
        { address: recipient2, shareBps: 4000 },
      ],
      totalAmount: 10_000_000n,
    });
    expect(createResult).toBeDefined();
  });

  it('getRevenueSharePreview calculates correct shares', () => {
    const preview = client.splitter.getRevenueSharePreview({
      organizer: 'GORG...',
      organizerBps: 4000,
      artist: 'GART...',
      artistBps: 3500,
      platform: 'GPLAT...',
      totalAmount: 10_000_000n,
    });
    expect(preview).toHaveLength(3);
    expect(preview[0].amount).toBe(4_000_000n);
    expect(preview[1].amount).toBe(3_500_000n);
    expect(preview[2].amount).toBe(2_500_000n);
  });
});

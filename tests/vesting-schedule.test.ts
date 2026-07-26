/**
 * @file tests/vesting-schedule.test.ts
 * Unit tests for TokenModule vestingSchedule operations (issue #257).
 *
 * Tests: createVestingSchedule, claimVesting, getVestingsByHolder
 */

import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { Keypair } from '@stellar/stellar-sdk';
import { VeriTixErrorCode } from '../src/utils/errors';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_HOLDER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

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

beforeEach(() => jest.clearAllMocks());

describe('TokenModule.vestingSchedule', () => {
  describe('createVestingSchedule()', () => {
    it('throws ReadOnlyClient when no keypair', async () => {
      const { client } = makeMockClient();
      await expect(
        client.token.createVestingSchedule({
          holder: FAKE_HOLDER,
          totalAmount: 1_000_000n,
          startLedger: 100,
          endLedger: 200,
        })
      ).rejects.toThrow();
    });

    it('calls contract method on success', async () => {
      const kp = Keypair.random();
      const { client, mockServer } = makeMockClient(kp);

      mockServer.getAccount = jest.fn().mockResolvedValue({
        accountId: () => kp.publicKey(),
        sequenceNumber: () => '0',
        incrementSequenceNumber: () => {},
      });

      mockServer.simulateTransaction.mockResolvedValue({
        status: 'SUCCESS',
        result: { retval: undefined },
      });

      mockServer.sendTransaction.mockResolvedValue({
        hash: 'vesting-hash',
        status: 'PENDING',
      });

      mockServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
        successful: true,
        ledger: 100,
      });

      const result = await client.token.createVestingSchedule({
        holder: FAKE_HOLDER,
        totalAmount: 1_000_000n,
        startLedger: 100,
        endLedger: 200,
      });

      expect(result.successful).toBe(true);
    });
  });

  describe('claimVesting()', () => {
    it('throws ReadOnlyClient when no keypair', async () => {
      const { client } = makeMockClient();
      await expect(client.token.claimVesting(1n)).rejects.toThrow();
    });

    it('calls contract method on success', async () => {
      const kp = Keypair.random();
      const { client, mockServer } = makeMockClient(kp);

      mockServer.getAccount = jest.fn().mockResolvedValue({
        accountId: () => kp.publicKey(),
        sequenceNumber: () => '0',
        incrementSequenceNumber: () => {},
      });

      mockServer.simulateTransaction.mockResolvedValue({
        status: 'SUCCESS',
        result: { retval: undefined },
      });

      mockServer.sendTransaction.mockResolvedValue({
        hash: 'claim-hash',
        status: 'PENDING',
      });

      mockServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
        successful: true,
        ledger: 150,
      });

      const result = await client.token.claimVesting(1n);
      expect(result.successful).toBe(true);
    });
  });

  describe('getVestingsByHolder()', () => {
    it('returns empty array when no vestings', async () => {
      const { client, mockServer } = makeMockClient();
      mockServer.simulateTransaction.mockResolvedValue({
        status: 'SUCCESS',
        result: { retval: undefined },
      });

      const result = await client.token.getVestingsByHolder(FAKE_HOLDER);
      expect(result).toEqual([]);
    });
  });
});

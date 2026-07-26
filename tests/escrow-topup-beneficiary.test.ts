/**
 * @file tests/escrow-topup-beneficiary.test.ts
 * Unit tests for EscrowModule.topupEscrow and transferBeneficiary (issue #258).
 *
 * These tests verify the methods added in PRs #354 and #355.
 */

import { Keypair } from '@stellar/stellar-sdk';
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { VeriTixErrorCode } from '../src/utils/errors';

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

beforeEach(() => jest.clearAllMocks());

describe('EscrowModule.topupEscrow()', () => {
  it('throws ReadOnlyClient when no keypair', async () => {
    const { client } = makeMockClient();
    await expect(
      client.escrow.topupEscrow(1n, 500_000n)
    ).rejects.toThrow();
  });

  it('returns a TransactionResult on success', async () => {
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
      hash: 'topup-hash',
      status: 'PENDING',
    });

    mockServer.getTransaction.mockResolvedValue({
      status: 'SUCCESS',
      successful: true,
      ledger: 100,
    });

    const result = await client.escrow.topupEscrow(1n, 500_000n);
    expect(result.successful).toBe(true);
    expect(result.hash).toBe('topup-hash');
  });
});

describe('EscrowModule.transferBeneficiary()', () => {
  it('throws ReadOnlyClient when no keypair', async () => {
    const { client } = makeMockClient();
    await expect(
      client.escrow.transferBeneficiary(1n, 'GNEWBENEFICIARY')
    ).rejects.toThrow();
  });

  it('returns a TransactionResult on success', async () => {
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
      hash: 'transfer-beneficiary-hash',
      status: 'PENDING',
    });

    mockServer.getTransaction.mockResolvedValue({
      status: 'SUCCESS',
      successful: true,
      ledger: 101,
    });

    const result = await client.escrow.transferBeneficiary(2n, 'GNEWBENEFICIARY');
    expect(result.successful).toBe(true);
    expect(result.hash).toBe('transfer-beneficiary-hash');
  });
});

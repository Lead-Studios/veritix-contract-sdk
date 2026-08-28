/**
 * @file tests/issue-453-createEscrow.test.ts
 * Coverage for EscrowModule.createEscrow() pre-flight checks. Closes #453.
 */

import { Keypair } from '@stellar/stellar-sdk';
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { VeriTixErrorCode } from '../src/utils/errors';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_ADDRESS = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

function makeConnectedClient(keypair?: Keypair, currentLedger = 100) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT), keypair);
  const mockServer = {
    simulateTransaction: jest.fn(),
    sendTransaction: jest.fn(),
    getTransaction: jest.fn(),
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: currentLedger }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).server = mockServer;
  return { client, mockServer };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('EscrowModule.createEscrow — pre-flight checks (#453)', () => {
  it('throws ReadOnlyClient when no keypair is provided', async () => {
    const { client } = makeConnectedClient();
    await expect(
      client.escrow.createEscrow({ beneficiary: FAKE_ADDRESS, amount: 1_000_000n, expiryLedger: 101 }),
    ).rejects.toMatchObject({ code: VeriTixErrorCode.ReadOnlyClient });
  });

  it('throws InvalidBeneficiary when beneficiary equals the caller', async () => {
    const keypair = Keypair.random();
    const { client } = makeConnectedClient(keypair, 100);
    await expect(
      client.escrow.createEscrow({ beneficiary: keypair.publicKey(), amount: 1_000_000n, expiryLedger: 101 }),
    ).rejects.toMatchObject({ code: VeriTixErrorCode.InvalidBeneficiary });
  });

  it('throws InvalidExpiryLedger when expiryLedger is in the past', async () => {
    const { client } = makeConnectedClient(Keypair.random(), 100);
    await expect(
      client.escrow.createEscrow({ beneficiary: FAKE_ADDRESS, amount: 1_000_000n, expiryLedger: 50 }),
    ).rejects.toMatchObject({ code: VeriTixErrorCode.InvalidExpiryLedger });
  });
});

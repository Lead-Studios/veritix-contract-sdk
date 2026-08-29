/**
 * @file tests/issue-460-openDispute.test.ts
 * Coverage for DisputeModule.openDispute() — evidence length (byte-counted,
 * not character-counted) and resolver pre-flight checks. See issue #460.
 */

import { Keypair } from '@stellar/stellar-sdk';
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';

const FAKE_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_ESCROW_ID = 123n;

function makeConnectedClient(keypair?: Keypair) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT_ID), keypair);
  const mockServer = { simulateTransaction: jest.fn(), sendTransaction: jest.fn(), getTransaction: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).server = mockServer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).connected = true;
  return { client, mockServer };
}

describe('DisputeModule.openDispute — evidence length and resolver pre-flight (#460)', () => {
  it('byte-counts emoji evidence correctly and throws when it exceeds 128 bytes', async () => {
    const keypair = Keypair.random();
    const { client } = makeConnectedClient(keypair);
    // 33 grinning-face emoji = 33 chars but 4 bytes each in UTF-8 = 132 bytes (> 128).
    const emojiEvidence = '\u{1F600}'.repeat(33);

    await expect(
      client.dispute.openDispute(FAKE_ESCROW_ID, Keypair.random().publicKey(), emojiEvidence),
    ).rejects.toThrow('evidence must be 128 bytes or less');
  });

  it('throws when the resolver is the same address as the caller', async () => {
    const keypair = Keypair.random();
    const { client } = makeConnectedClient(keypair);

    await expect(
      client.dispute.openDispute(FAKE_ESCROW_ID, keypair.publicKey(), 'evidence'),
    ).rejects.toThrow('resolver cannot be the claimant');
  });

  it('throws when no signing keypair is available', async () => {
    const { client } = makeConnectedClient();

    await expect(
      client.dispute.openDispute(FAKE_ESCROW_ID, Keypair.random().publicKey(), 'evidence'),
    ).rejects.toThrow('signing keypair required');
  });
});

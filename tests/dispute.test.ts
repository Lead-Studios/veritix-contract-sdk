import { Keypair, xdr } from '@stellar/stellar-sdk';
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';

const FAKE_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_ESCROW_ID = 123n;

function makeConnectedClient(keypair: Keypair) {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT_ID), keypair);
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

describe('DisputeModule', () => {
  const keypair = Keypair.random();
  const resolver = Keypair.random().publicKey();

  it('rejects when resolver is the same as the claimant', async () => {
    const { client } = makeConnectedClient(keypair);

    await expect(client.dispute.openDispute(FAKE_ESCROW_ID, keypair.publicKey())).rejects.toThrow(
      'resolver cannot be the caller',
    );
  });

  it('rejects evidence that exceeds 128 bytes', async () => {
    const { client } = makeConnectedClient(keypair);
    const longEvidence = 'a'.repeat(129);

    await expect(
      client.dispute.openDispute(FAKE_ESCROW_ID, resolver, longEvidence),
    ).rejects.toThrow('evidence must be 128 bytes or less');
  });

  it('returns null when getDispute returns no result', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: {
        retval: undefined,
      },
    });

    const dispute = await client.dispute.getDispute(FAKE_ESCROW_ID);

    expect(dispute).toBeNull();
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
  });
});

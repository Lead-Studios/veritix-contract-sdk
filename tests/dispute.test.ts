import { Keypair, xdr } from '@stellar/stellar-sdk';
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import { DisputeStatus } from '../src/types/index';
import { VeriTixError, VeriTixErrorCode } from '../src/utils/errors';

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

  it('returns true when isDisputeOpen finds an open dispute', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: {
        retval: xdr.ScVal.scvBool(true),
      },
    });

    const isOpen = await client.dispute.isDisputeOpen(FAKE_ESCROW_ID);

    expect(isOpen).toBe(true);
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns false when isDisputeOpen finds no open dispute', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: {
        retval: xdr.ScVal.scvBool(false),
      },
    });

    const isOpen = await client.dispute.isDisputeOpen(FAKE_ESCROW_ID);

    expect(isOpen).toBe(false);
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns false when isDisputeOpen returns no result', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: {
        retval: undefined,
      },
    });

    const isOpen = await client.dispute.isDisputeOpen(FAKE_ESCROW_ID);

    expect(isOpen).toBe(false);
  });

  it('throws DisputeNotFound when resolving a non-existent dispute', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.dispute, 'getDispute').mockResolvedValue(null);

    await expect(client.dispute.resolveDispute(FAKE_ESCROW_ID, true)).rejects.toMatchObject({
      code: VeriTixErrorCode.DisputeNotFound,
    });
  });

  it('throws DisputeAlreadyResolved for a dispute that is not open', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.dispute, 'getDispute').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      escrowId: 321n,
      claimant: 'GB6...SOME',
      resolver: keypair.publicKey(),
      status: DisputeStatus.ResolvedForDepositor,
      openedAt: 1,
    });

    await expect(client.dispute.resolveDispute(FAKE_ESCROW_ID, false)).rejects.toMatchObject({
      code: VeriTixErrorCode.DisputeAlreadyResolved,
    });
  });

  it('resolves an open dispute and submits the transaction', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    jest.spyOn(client.dispute, 'getDispute').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      escrowId: 321n,
      claimant: 'GB6...SOME',
      resolver: keypair.publicKey(),
      status: DisputeStatus.Open,
      openedAt: 1,
    });

    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: {
        retval: 456n,
      },
    });
    mockServer.sendTransaction.mockResolvedValue({
      hash: 'fake-hash',
      status: 'OK',
    });
    mockServer.getTransaction.mockResolvedValue({
      status: 'SUCCESS',
      ledger: 100,
    });

    const result = await client.dispute.resolveDispute(FAKE_ESCROW_ID, true, 'valid note');

    expect(result).toMatchObject({
      hash: 'fake-hash',
      ledger: 100,
      successful: true,
      returnValue: 456n,
    });
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
    expect(mockServer.sendTransaction).toHaveBeenCalledTimes(1);
    expect(mockServer.getTransaction).toHaveBeenCalledTimes(1);
  });
});

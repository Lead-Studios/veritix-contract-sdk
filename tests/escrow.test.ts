/**
 * @file tests/escrow.test.ts
 * Unit tests for {@link EscrowModule}.
 *
 * All tests currently verify that the stub methods throw "not implemented".
 * Replace with real assertions once the implementation is complete.
 */

import { Keypair, xdr } from '@stellar/stellar-sdk';
import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_ADDRESS  = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

function makeConnectedClient(keypair: Keypair) {
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

describe('EscrowModule (stubs)', () => {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));

  it('getEscrow() throws "not implemented"', async () => {
    await expect(client.escrow.getEscrow(1n)).rejects.toThrow('not implemented');
  });

  it('createEscrow() throws "not implemented"', async () => {
    await expect(
      client.escrow.createEscrow({
        beneficiary: FAKE_ADDRESS,
        amount: 1_000_000n,
        expiryLedger: 1_000_000,
        memos: ['test memo'],
      }),
    ).rejects.toThrow('not implemented');
  });

  it('createTicketEscrow() builds the ticket escrow and returns the escrow ID', async () => {
    const spy = jest
      .spyOn(client.escrow, 'createEscrow')
      .mockResolvedValue({
        hash: 'fake-hash',
        ledger: 42,
        successful: true,
        returnValue: 99n,
      });

    const escrowId = await client.escrow.createTicketEscrow({
      organizer: FAKE_ADDRESS,
      ticketPrice: 2_000_000n,
      eventLedger: 1_000_000,
      ticketRef: 'ticket-uuid-123',
    });

    expect(escrowId).toBe(99n);
    expect(spy).toHaveBeenCalledWith({
      beneficiary: FAKE_ADDRESS,
      amount: 2_000_000n,
      expiryLedger: 1_005_000,
      memos: ['ticket-uuid-123'],
    });

    spy.mockRestore();
  });

  it('releaseEscrow() throws "not implemented"', async () => {
    await expect(client.escrow.releaseEscrow(1n)).rejects.toThrow('not implemented');
  });

  it('refundEscrow() throws "not implemented"', async () => {
    await expect(client.escrow.refundEscrow(1n)).rejects.toThrow('not implemented');
  });
});

describe('EscrowModule.settleEvent', () => {
  const keypair = Keypair.random();

  it('throws error when no signing keypair is available', async () => {
    const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));
    await expect(client.escrow.settleEvent([1n, 2n, 3n])).rejects.toThrow(
      'signing keypair required',
    );
  });

  it('returns empty result for empty escrow array', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    const result = await client.escrow.settleEvent([]);
    expect(result).toEqual({
      settled: 0,
      failed: [],
      txHashes: [],
    });
    expect(mockServer.simulateTransaction).not.toHaveBeenCalled();
  });

  it('successfully settles a single chunk of escrows', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    const escrowIds = [1n, 2n, 3n];

    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: { retval: xdr.ScVal.scvU64(xdr.Uint64.fromString('3')) },
    });
    mockServer.sendTransaction.mockResolvedValue({
      hash: 'tx-hash-1',
      status: 'OK',
    });
    mockServer.getTransaction.mockResolvedValue({
      status: 'SUCCESS',
      ledger: 100,
    });

    const result = await client.escrow.settleEvent(escrowIds);

    expect(result.txHashes).toContain('tx-hash-1');
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
    expect(mockServer.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('splits large escrow array into multiple transactions', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);

    // Create 125 escrow IDs (will split into 3 chunks: 50, 50, 25)
    const escrowIds = Array.from({ length: 125 }, (_, i) => BigInt(i + 1));

    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: { retval: xdr.ScVal.scvU64(xdr.Uint64.fromString('50')) },
    });
    mockServer.sendTransaction.mockResolvedValue({
      hash: 'tx-hash',
      status: 'OK',
    });
    mockServer.getTransaction.mockResolvedValue({
      status: 'SUCCESS',
      ledger: 100,
    });

    const result = await client.escrow.settleEvent(escrowIds);

    expect(result.txHashes.length).toBe(3);
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(3);
    expect(mockServer.sendTransaction).toHaveBeenCalledTimes(3);
  });

  it('collects transaction hashes from all chunks', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    const escrowIds = Array.from({ length: 75 }, (_, i) => BigInt(i + 1));

    let hashCounter = 0;
    mockServer.sendTransaction.mockImplementation(() => {
      hashCounter++;
      return Promise.resolve({
        hash: `tx-hash-${hashCounter}`,
        status: 'OK',
      });
    });
    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: { retval: xdr.ScVal.scvU64(xdr.Uint64.fromString('50')) },
    });
    mockServer.getTransaction.mockResolvedValue({
      status: 'SUCCESS',
      ledger: 100,
    });

    const result = await client.escrow.settleEvent(escrowIds);

    expect(result.txHashes).toEqual(['tx-hash-1', 'tx-hash-2']);
  });

  it('handles chunk failure gracefully', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    const escrowIds = [1n, 2n, 3n];

    mockServer.simulateTransaction.mockResolvedValue({
      status: 'ERROR',
      error: 'Contract error',
    });

    const result = await client.escrow.settleEvent(escrowIds);

    expect(result.failed).toEqual(escrowIds);
    expect(result.settled).toBe(0);
    expect(result.txHashes.length).toBe(0);
  });

  it('aggregates results across multiple successful chunks', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    const escrowIds = Array.from({ length: 101 }, (_, i) => BigInt(i + 1));

    let callCount = 0;
    mockServer.sendTransaction.mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        hash: `tx-hash-${callCount}`,
        status: 'OK',
      });
    });

    mockServer.simulateTransaction.mockResolvedValue({
      status: 'SUCCESS',
      result: { retval: xdr.ScVal.scvU64(xdr.Uint64.fromString('50')) },
    });
    mockServer.getTransaction.mockResolvedValue({
      status: 'SUCCESS',
      ledger: 100,
    });

    const result = await client.escrow.settleEvent(escrowIds);

    expect(result.txHashes.length).toBe(3);
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(3);
    expect(mockServer.sendTransaction).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// parseSorobanError integration
// ---------------------------------------------------------------------------

import { parseSorobanError, VeriTixError, VeriTixErrorCode } from '../src/utils/errors';

describe('parseSorobanError', () => {
  it('maps "escrow not found" panic to EscrowNotFound', () => {
    const err = parseSorobanError('Contract panic: escrow not found');
    expect(err).toBeInstanceOf(VeriTixError);
    expect(err.code).toBe(VeriTixErrorCode.EscrowNotFound);
  });

  it('maps "DisputeAlreadyOpen" panic to DisputeAlreadyOpen', () => {
    const err = parseSorobanError('DisputeAlreadyOpen');
    expect(err.code).toBe(VeriTixErrorCode.DisputeAlreadyOpen);
  });

  it('maps "already settled" panic to EscrowAlreadySettled', () => {
    const err = parseSorobanError('already settled');
    expect(err.code).toBe(VeriTixErrorCode.EscrowAlreadySettled);
  });

  it('maps "account frozen" panic to AccountFrozen', () => {
    const err = parseSorobanError('account frozen');
    expect(err.code).toBe(VeriTixErrorCode.AccountFrozen);
  });

  it('returns Unknown for unrecognised panic strings', () => {
    const err = parseSorobanError('something totally unrecognised xyz');
    expect(err.code).toBe(VeriTixErrorCode.Unknown);
    expect(err.rawMessage).toBe('something totally unrecognised xyz');
  });

  it('accepts an Error object as input', () => {
    const err = parseSorobanError(new Error('contract paused'));
    expect(err.code).toBe(VeriTixErrorCode.ContractPaused);
  });
});

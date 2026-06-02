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
import type { EscrowRecord } from '../src/types/index';
import { VeriTixError, VeriTixErrorCode } from '../src/utils/errors';

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

  it('getEscrowsBatch() throws "not implemented"', async () => {
    await expect(client.escrow.getEscrowsBatch([1n, 2n])).rejects.toThrow('not implemented');
  });
});

// ---------------------------------------------------------------------------
// getEscrowsBatch validation tests
// ---------------------------------------------------------------------------

describe('EscrowModule.getEscrowsBatch', () => {
  const client = new VeriTixClient(getTestnetConfig(FAKE_CONTRACT));

  it('throws BATCH_TOO_LARGE error when more than 50 IDs are provided', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => BigInt(i + 1));
    await expect(client.escrow.getEscrowsBatch(ids)).rejects.toThrow(
      'Batch request exceeded maximum allowed size (50 items). Received 51 IDs.',
    );
  });

  it('throws BATCH_TOO_LARGE error with VeriTixErrorCode when more than 50 IDs are provided', async () => {
    const ids = Array.from({ length: 100 }, (_, i) => BigInt(i + 1));
    try {
      await client.escrow.getEscrowsBatch(ids);
      fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(VeriTixError);
      expect((error as VeriTixError).code).toBe(VeriTixErrorCode.BatchTooLarge);
    }
  });

  it('returns an empty array for empty batch', async () => {
    const result = await client.escrow.getEscrowsBatch([]);
    expect(result).toEqual([]);
  });

  it('falls back to individual getEscrow calls when contract method is not implemented', async () => {
    const ids = [1n, 2n, 3n];
    const mockEscrowRecord: EscrowRecord = {
      id: 1n,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 1_000_000n,
      released: false,
      refunded: false,
      expiryLedger: 1_000_000,
      memos: [],
    };

    const spy = jest
      .spyOn(client.escrow, 'getEscrow')
      .mockResolvedValueOnce(mockEscrowRecord)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockEscrowRecord);

    const results = await client.escrow.getEscrowsBatch(ids);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual(mockEscrowRecord);
    expect(results[1]).toBeNull();
    expect(results[2]).toEqual(mockEscrowRecord);
    expect(spy).toHaveBeenCalledTimes(3);

    spy.mockRestore();
  });

  it('preserves order of results matching input IDs', async () => {
    const ids = [5n, 3n, 7n, 1n];
    const record1: EscrowRecord = {
      id: 5n,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 500_000n,
      released: false,
      refunded: false,
      expiryLedger: 1_000_000,
      memos: [],
    };
    const record2: EscrowRecord = {
      id: 7n,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 700_000n,
      released: true,
      refunded: false,
      expiryLedger: 1_000_000,
      memos: [],
    };

    const spy = jest
      .spyOn(client.escrow, 'getEscrow')
      .mockResolvedValueOnce(record1)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(record2)
      .mockResolvedValueOnce(null);

    const results = await client.escrow.getEscrowsBatch(ids);

    expect(results).toHaveLength(4);
    expect(results[0]?.id).toBe(5n);
    expect(results[1]).toBeNull();
    expect(results[2]?.id).toBe(7n);
    expect(results[3]).toBeNull();

    spy.mockRestore();
  });

  it('accepts exactly 50 IDs without throwing', async () => {
    const ids = Array.from({ length: 50 }, (_, i) => BigInt(i + 1));
    const mockEscrowRecord: EscrowRecord = {
      id: 1n,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 1_000_000n,
      released: false,
      refunded: false,
      expiryLedger: 1_000_000,
      memos: [],
    };

    const spy = jest
      .spyOn(client.escrow, 'getEscrow')
      .mockResolvedValue(mockEscrowRecord);

    const results = await client.escrow.getEscrowsBatch(ids);

    expect(results).toHaveLength(50);
    expect(spy).toHaveBeenCalledTimes(50);

    spy.mockRestore();
  });
});

describe('EscrowModule.isSettled', () => {
  const keypair = Keypair.random();
  const FAKE_ESCROW_ID = 1n;

  it('returns true when escrow is released', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 1_000_000n,
      released: true,
      refunded: false,
      expiryLedger: 1_000_000,
      memos: [],
    });

    const settled = await client.escrow.isSettled(FAKE_ESCROW_ID);

    expect(settled).toBe(true);
  });

  it('returns true when escrow is refunded', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 1_000_000n,
      released: false,
      refunded: true,
      expiryLedger: 1_000_000,
      memos: [],
    });

    const settled = await client.escrow.isSettled(FAKE_ESCROW_ID);

    expect(settled).toBe(true);
  });

  it('returns false when escrow is neither released nor refunded', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 1_000_000n,
      released: false,
      refunded: false,
      expiryLedger: 1_000_000,
      memos: [],
    });

    const settled = await client.escrow.isSettled(FAKE_ESCROW_ID);

    expect(settled).toBe(false);
  });

  it('throws error when escrow does not exist', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue(null);

    await expect(client.escrow.isSettled(FAKE_ESCROW_ID)).rejects.toThrow('escrow 1 not found');
  });
});

describe('EscrowModule.isExpired', () => {
  const keypair = Keypair.random();
  const FAKE_ESCROW_ID = 1n;
  const EXPIRY_LEDGER = 1_000_000;

  it('returns true when current ledger >= expiry ledger', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 1_000_000n,
      released: false,
      refunded: false,
      expiryLedger: EXPIRY_LEDGER,
      memos: [],
    });

    const expired = await client.escrow.isExpired(FAKE_ESCROW_ID, EXPIRY_LEDGER);

    expect(expired).toBe(true);
  });

  it('returns true when current ledger > expiry ledger', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 1_000_000n,
      released: false,
      refunded: false,
      expiryLedger: EXPIRY_LEDGER,
      memos: [],
    });

    const expired = await client.escrow.isExpired(FAKE_ESCROW_ID, EXPIRY_LEDGER + 1);

    expect(expired).toBe(true);
  });

  it('returns false when current ledger < expiry ledger', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 1_000_000n,
      released: false,
      refunded: false,
      expiryLedger: EXPIRY_LEDGER,
      memos: [],
    });

    const expired = await client.escrow.isExpired(FAKE_ESCROW_ID, EXPIRY_LEDGER - 1);

    expect(expired).toBe(false);
  });

  it('fetches current ledger when not provided', async () => {
    const { client, mockServer } = makeConnectedClient(keypair);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue({
      id: FAKE_ESCROW_ID,
      depositor: FAKE_ADDRESS,
      beneficiary: FAKE_ADDRESS,
      amount: 1_000_000n,
      released: false,
      refunded: false,
      expiryLedger: EXPIRY_LEDGER,
      memos: [],
    });
    mockServer.getLatestLedger = jest
      .fn()
      .mockResolvedValue({ sequence: EXPIRY_LEDGER + 1000 });

    const expired = await client.escrow.isExpired(FAKE_ESCROW_ID);

    expect(expired).toBe(true);
    expect(mockServer.getLatestLedger).toHaveBeenCalledTimes(1);
  });

  it('throws error when escrow does not exist', async () => {
    const { client } = makeConnectedClient(keypair);
    jest.spyOn(client.escrow, 'getEscrow').mockResolvedValue(null);

    await expect(client.escrow.isExpired(FAKE_ESCROW_ID, 1_000_000)).rejects.toThrow(
      'escrow 1 not found',
    );
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

import { parseSorobanError } from '../src/utils/errors';

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

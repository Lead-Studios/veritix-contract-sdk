/**
 * @file tests/escrow.test.ts
 * Unit tests for {@link EscrowModule}.
 *
 * All tests currently verify that the stub methods throw "not implemented".
 * Replace with real assertions once the implementation is complete.
 */

import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';
import type { EscrowRecord } from '../src/types/index';
import { VeriTixError, VeriTixErrorCode } from '../src/utils/errors';

const FAKE_CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const FAKE_ADDRESS  = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

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

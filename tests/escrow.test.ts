/**
 * @file tests/escrow.test.ts
 * Unit tests for {@link EscrowModule}.
 *
 * All tests currently verify that the stub methods throw "not implemented".
 * Replace with real assertions once the implementation is complete.
 */

import { VeriTixClient } from '../src/client';
import { getTestnetConfig } from '../src/utils/network';

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

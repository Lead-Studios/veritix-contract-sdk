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

/**
 * @file tests/utils/errors.test.ts
 * Systematic unit tests for parseSorobanError and the VeriTixError class.
 * Every VeriTixErrorCode value that can originate from a Soroban panic string
 * is asserted to round-trip through parseSorobanError.
 */

import { parseSorobanError, VeriTixError, VeriTixErrorCode } from '../../src/utils/errors';

// ---------------------------------------------------------------------------
// VeriTixError class shape
// ---------------------------------------------------------------------------

describe('VeriTixError', () => {
  it('extends Error', () => {
    const err = new VeriTixError(VeriTixErrorCode.Unknown, 'test message');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(VeriTixError);
  });

  it('exposes code and message', () => {
    const err = new VeriTixError(VeriTixErrorCode.EscrowNotFound, 'not found');
    expect(err.code).toBe(VeriTixErrorCode.EscrowNotFound);
    expect(err.message).toBe('not found');
  });

  it('sets name to VeriTixError', () => {
    const err = new VeriTixError(VeriTixErrorCode.Unknown, 'msg');
    expect(err.name).toBe('VeriTixError');
  });

  it('exposes rawMessage and the raw alias when provided', () => {
    const err = new VeriTixError(VeriTixErrorCode.Unknown, 'msg', 'raw panic string');
    expect(err.rawMessage).toBe('raw panic string');
    expect(err.raw).toBe('raw panic string');
  });

  it('rawMessage is undefined when not provided', () => {
    const err = new VeriTixError(VeriTixErrorCode.Unknown, 'msg');
    expect(err.rawMessage).toBeUndefined();
  });

  it('populates cause when the wrapped original error is provided', () => {
    const original = new Error('escrow not found');
    const err = new VeriTixError(VeriTixErrorCode.EscrowNotFound, 'msg', undefined, original);
    expect(err.cause).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// Systematic parseSorobanError mapping
// ---------------------------------------------------------------------------

describe('parseSorobanError — systematic mapping', () => {
  // One panic string per VeriTixErrorCode value that parseSorobanError can
  // produce. Codes without a string (Unknown, UnknownContractError and
  // UnexpectedTransactionHash) are catch-all / throw-only codes and are
  // exercised by their own dedicated tests below.
  const PANIC_STRINGS: Partial<Record<VeriTixErrorCode, string>> = {
    [VeriTixErrorCode.EscrowNotFound]: 'escrow not found',
    [VeriTixErrorCode.EscrowAlreadySettled]: 'escrow already settled',
    [VeriTixErrorCode.EscrowNotExpired]: 'escrow not expired',
    [VeriTixErrorCode.EscrowUnauthorized]: 'escrow unauthorized',
    [VeriTixErrorCode.DisputeAlreadyOpen]: 'DisputeAlreadyOpen',
    [VeriTixErrorCode.DisputeNotFound]: 'dispute not found',
    [VeriTixErrorCode.DisputeAlreadyResolved]: 'dispute already resolved',
    [VeriTixErrorCode.DisputeInvalidState]: 'dispute invalid state',
    [VeriTixErrorCode.SplitNotFound]: 'split not found',
    [VeriTixErrorCode.SplitInvalidShares]: 'split invalid shares',
    [VeriTixErrorCode.SplitAlreadyDistributed]: 'split already distributed',
    [VeriTixErrorCode.RecurringNotFound]: 'recurring not found',
    [VeriTixErrorCode.RecurringIntervalNotElapsed]: 'recurring interval not elapsed',
    [VeriTixErrorCode.RecurringAlreadyPaused]: 'recurring already paused',
    [VeriTixErrorCode.RecurringNotPaused]: 'recurring not paused',
    [VeriTixErrorCode.AdminUnauthorized]: 'admin unauthorized',
    [VeriTixErrorCode.AccountFrozen]: 'account frozen',
    [VeriTixErrorCode.ContractAlreadyPaused]: 'contract paused',
    [VeriTixErrorCode.ContractNotPaused]: 'contract not paused',
    [VeriTixErrorCode.InvalidAmount]: 'invalid amount',
    [VeriTixErrorCode.InvalidExpiryLedger]: 'invalid expiry ledger',
    [VeriTixErrorCode.InvalidAddress]: 'invalid address',
    [VeriTixErrorCode.InvalidBeneficiary]: 'invalid beneficiary',
    [VeriTixErrorCode.InsufficientAllowance]: 'insufficient allowance',
    [VeriTixErrorCode.InsufficientBalance]: 'insufficient balance',
    [VeriTixErrorCode.Unauthorized]: 'not authorized',
    [VeriTixErrorCode.CollaboratorNotFound]: 'collaborator not found',
    [VeriTixErrorCode.CollaboratorAlreadyExists]: 'collaborator already exists',
    [VeriTixErrorCode.MaxCollaboratorsReached]: 'max collaborators reached',
    [VeriTixErrorCode.InvalidInput]: 'invalid input',
    [VeriTixErrorCode.NotImplemented]: 'method not implemented',
    [VeriTixErrorCode.TransactionFailed]: 'transaction failed',
    [VeriTixErrorCode.WatchTimeout]: 'watch timed out',
    [VeriTixErrorCode.ConnectionFailed]: 'connection failed',
    [VeriTixErrorCode.BatchTooLarge]: 'batch too large',
    [VeriTixErrorCode.ReadOnlyClient]: 'read-only client',
    [VeriTixErrorCode.FreighterNotFound]: 'freighter not found',
    [VeriTixErrorCode.ClientNotConnected]: 'client not connected',
    [VeriTixErrorCode.HostError]: 'HostError',
    [VeriTixErrorCode.TrappedVmError]: 'TrappedVmError',
  };

  it('maps every parseable VeriTixErrorCode value to itself', () => {
    const values = Object.values(VeriTixErrorCode) as VeriTixErrorCode[];

    for (const code of values) {
      const panicString = PANIC_STRINGS[code];
      if (panicString === undefined) {
        // Catch-all / throw-only codes — covered by dedicated tests below.
        continue;
      }
      const parsed = parseSorobanError(panicString);
      expect(parsed).toBeInstanceOf(VeriTixError);
      expect(parsed.code).toBe(code);
      expect(parsed.rawMessage).toBe(panicString);
    }
  });

  it('covers the full enum (no parseable code is silently missing)', () => {
    const values = Object.values(VeriTixErrorCode) as VeriTixErrorCode[];
    const covered = values.filter((code) => PANIC_STRINGS[code] !== undefined);
    // 3 codes are catch-all / throw-only and intentionally have no panic
    // string: Unknown, UnknownContractError (they share the catch-all value)
    // and UnexpectedTransactionHash.
    expect(covered.length).toBe(values.length - 3);
  });
});

// ---------------------------------------------------------------------------
// Unknown / catch-all behaviour
// ---------------------------------------------------------------------------

describe('parseSorobanError — unknown input', () => {
  it('returns UnknownContractError for an unknown string', () => {
    const err = parseSorobanError('some totally unrecognised panic xdr');
    expect(err.code).toBe(VeriTixErrorCode.UnknownContractError);
    expect(err.rawMessage).toBe('some totally unrecognised panic xdr');
  });

  it('returns UnknownContractError for the empty string', () => {
    const err = parseSorobanError('');
    expect(err.code).toBe(VeriTixErrorCode.UnknownContractError);
    expect(err.rawMessage).toBe('');
  });

  it('keeps Unknown as a value-compatible legacy alias', () => {
    expect(VeriTixErrorCode.Unknown).toBe(VeriTixErrorCode.UnknownContractError);
  });
});

// ---------------------------------------------------------------------------
// Matching behaviour
// ---------------------------------------------------------------------------

describe('parseSorobanError — matching behaviour', () => {
  it('matches case-insensitively', () => {
    expect(parseSorobanError('ESCROW NOT FOUND').code).toBe(VeriTixErrorCode.EscrowNotFound);
    expect(parseSorobanError('DisputeAlreadyOpen').code).toBe(VeriTixErrorCode.DisputeAlreadyOpen);
  });

  it('maps the camelCase "InvalidInput" form (no space) to InvalidInput', () => {
    expect(parseSorobanError('InvalidInput').code).toBe(VeriTixErrorCode.InvalidInput);
    expect(parseSorobanError('invalidinput').code).toBe(VeriTixErrorCode.InvalidInput);
  });

  it('matches a pattern embedded in a longer diagnostic string', () => {
    const raw = 'HostError: Value(ContractError) escrow not found at ledger 12345';
    const err = parseSorobanError(raw);
    expect(err.code).toBe(VeriTixErrorCode.EscrowNotFound);
    expect(err.rawMessage).toBe(raw);
  });

  it('maps "the contract paused operations today" to ContractAlreadyPaused', () => {
    const err = parseSorobanError('the contract paused operations today');
    expect(err.code).toBe(VeriTixErrorCode.ContractAlreadyPaused);
  });

  it('maps HostError / TrappedVmError to their generic codes', () => {
    expect(parseSorobanError('HostError').code).toBe(VeriTixErrorCode.HostError);
    expect(parseSorobanError('TrappedVmError').code).toBe(VeriTixErrorCode.TrappedVmError);
  });

  it('does not double-wrap an existing VeriTixError', () => {
    const original = parseSorobanError('HostError');
    const rewrapped = parseSorobanError(original);
    expect(rewrapped).toBe(original);
  });

  it('populates cause when an Error is wrapped', () => {
    const original = new Error('escrow not found');
    const err = parseSorobanError(original);
    expect(err.code).toBe(VeriTixErrorCode.EscrowNotFound);
    expect(err.cause).toBe(original);
    expect(err.rawMessage).toBe('escrow not found');
  });
});

// ---------------------------------------------------------------------------
// Human-readable messages
// ---------------------------------------------------------------------------

describe('parseSorobanError — messages', () => {
  it('produces a descriptive message for a known code', () => {
    const err = parseSorobanError('escrow not found');
    expect(err.message.toLowerCase()).toContain('escrow');
  });

  it('includes the raw string in the UnknownContractError message', () => {
    const raw = 'totally_alien_panic_string';
    const err = parseSorobanError(raw);
    expect(err.message).toContain(raw);
  });
});
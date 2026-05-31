import { parseSorobanError, VeriTixError, VeriTixErrorCode } from '../../src/utils/errors';

describe('parseSorobanError', () => {
  // Helper: assert result is a VeriTixError with expected code and rawMessage
  function assertError(
    raw: unknown,
    expectedCode: VeriTixErrorCode,
    expectedRaw?: string,
  ): VeriTixError {
    const err = parseSorobanError(raw);
    expect(err).toBeInstanceOf(VeriTixError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe(expectedCode);
    expect(err.name).toBe('VeriTixError');
    if (expectedRaw !== undefined) {
      expect(err.rawMessage).toBe(expectedRaw);
    }
    return err;
  }

  // ---------------------------------------------------------------------------
  // VeriTixError class shape
  // ---------------------------------------------------------------------------
  describe('VeriTixError class', () => {
    it('extends Error', () => {
      const e = new VeriTixError(VeriTixErrorCode.Unknown, 'test');
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(VeriTixError);
    });

    it('sets name to "VeriTixError"', () => {
      const e = new VeriTixError(VeriTixErrorCode.EscrowNotFound, 'msg');
      expect(e.name).toBe('VeriTixError');
    });

    it('exposes code and message', () => {
      const e = new VeriTixError(VeriTixErrorCode.EscrowAlreadySettled, 'already done');
      expect(e.code).toBe(VeriTixErrorCode.EscrowAlreadySettled);
      expect(e.message).toBe('already done');
    });

    it('rawMessage is undefined when not provided', () => {
      const e = new VeriTixError(VeriTixErrorCode.Unknown, 'msg');
      expect(e.rawMessage).toBeUndefined();
    });

    it('stores rawMessage when provided', () => {
      const e = new VeriTixError(VeriTixErrorCode.Unknown, 'msg', 'raw panic string');
      expect(e.rawMessage).toBe('raw panic string');
    });

    it('maintains correct prototype chain', () => {
      const e = new VeriTixError(VeriTixErrorCode.Unknown, 'test');
      expect(Object.getPrototypeOf(e)).toBe(VeriTixError.prototype);
    });
  });

  // ---------------------------------------------------------------------------
  // Escrow mappings
  // ---------------------------------------------------------------------------
  describe('escrow errors', () => {
    it('maps "escrow not found" → EscrowNotFound', () => {
      assertError('escrow not found', VeriTixErrorCode.EscrowNotFound, 'escrow not found');
    });

    it('maps "already settled" → EscrowAlreadySettled', () => {
      assertError('already settled', VeriTixErrorCode.EscrowAlreadySettled);
    });

    it('maps "escrow not expired" → EscrowNotExpired', () => {
      assertError('escrow not expired', VeriTixErrorCode.EscrowNotExpired);
    });

    it('maps "not expired" → EscrowNotExpired', () => {
      assertError('not expired', VeriTixErrorCode.EscrowNotExpired);
    });

    it('maps "not authorized" → EscrowUnauthorized', () => {
      assertError('not authorized', VeriTixErrorCode.EscrowUnauthorized);
    });

    it('is case-insensitive for escrow patterns', () => {
      assertError('ESCROW NOT FOUND', VeriTixErrorCode.EscrowNotFound);
      assertError('Escrow Not Found', VeriTixErrorCode.EscrowNotFound);
    });

    it('matches pattern embedded in longer XDR diagnostic string', () => {
      const raw = 'HostError: Value(ContractError) escrow not found at ledger 12345';
      assertError(raw, VeriTixErrorCode.EscrowNotFound, raw);
    });
  });

  // ---------------------------------------------------------------------------
  // Dispute mappings
  // ---------------------------------------------------------------------------
  describe('dispute errors', () => {
    it('maps "DisputeAlreadyOpen" → DisputeAlreadyOpen', () => {
      assertError('DisputeAlreadyOpen', VeriTixErrorCode.DisputeAlreadyOpen);
    });

    it('matches DisputeAlreadyOpen case-insensitively', () => {
      assertError('disputealreadyopen', VeriTixErrorCode.DisputeAlreadyOpen);
    });

    it('maps "dispute not found" → DisputeNotFound', () => {
      assertError('dispute not found', VeriTixErrorCode.DisputeNotFound);
    });

    it('maps "dispute invalid state" → DisputeInvalidState', () => {
      assertError('dispute invalid state', VeriTixErrorCode.DisputeInvalidState);
    });
  });

  // ---------------------------------------------------------------------------
  // Split mappings
  // ---------------------------------------------------------------------------
  describe('split errors', () => {
    it('maps "split not found" → SplitNotFound', () => {
      assertError('split not found', VeriTixErrorCode.SplitNotFound);
    });

    it('maps "invalid shares" → SplitInvalidShares', () => {
      assertError('invalid shares', VeriTixErrorCode.SplitInvalidShares);
    });

    it('maps "already distributed" → SplitAlreadyDistributed', () => {
      assertError('already distributed', VeriTixErrorCode.SplitAlreadyDistributed);
    });
  });

  // ---------------------------------------------------------------------------
  // Recurring mappings
  // ---------------------------------------------------------------------------
  describe('recurring errors', () => {
    it('maps "recurring not found" → RecurringNotFound', () => {
      assertError('recurring not found', VeriTixErrorCode.RecurringNotFound);
    });

    it('maps "interval not elapsed" → RecurringIntervalNotElapsed', () => {
      assertError('interval not elapsed', VeriTixErrorCode.RecurringIntervalNotElapsed);
    });
  });

  // ---------------------------------------------------------------------------
  // Admin mappings
  // ---------------------------------------------------------------------------
  describe('admin errors', () => {
    it('maps "admin unauthorized" → AdminUnauthorized', () => {
      assertError('admin unauthorized', VeriTixErrorCode.AdminUnauthorized);
    });

    it('maps "account frozen" → AccountFrozen', () => {
      assertError('account frozen', VeriTixErrorCode.AccountFrozen);
    });

    it('maps "contract paused" → ContractPaused', () => {
      assertError('contract paused', VeriTixErrorCode.ContractPaused);
    });
  });

  // ---------------------------------------------------------------------------
  // Unknown / catch-all
  // ---------------------------------------------------------------------------
  describe('unknown errors', () => {
    it('maps unrecognised string → Unknown, preserving rawMessage', () => {
      const raw = 'some completely unknown panic XDR blob';
      const err = assertError(raw, VeriTixErrorCode.Unknown, raw);
      expect(err.message).toContain(raw);
    });

    it('handles empty string → Unknown', () => {
      assertError('', VeriTixErrorCode.Unknown);
    });

    it('handles an Error object — uses .message as raw', () => {
      const nativeErr = new Error('escrow not found');
      const err = parseSorobanError(nativeErr);
      expect(err.code).toBe(VeriTixErrorCode.EscrowNotFound);
      expect(err.rawMessage).toBe('escrow not found');
    });

    it('handles a plain object by JSON-stringifying it → Unknown', () => {
      const err = parseSorobanError({ code: 42, detail: 'xdr stuff' });
      expect(err.code).toBe(VeriTixErrorCode.Unknown);
      expect(err.rawMessage).toContain('"code":42');
    });

    it('handles null → Unknown', () => {
      assertError(null, VeriTixErrorCode.Unknown);
    });

    it('handles undefined → Unknown', () => {
      assertError(undefined, VeriTixErrorCode.Unknown);
    });

    it('handles a number → Unknown', () => {
      assertError(404, VeriTixErrorCode.Unknown);
    });
  });

  // ---------------------------------------------------------------------------
  // Human-readable messages
  // ---------------------------------------------------------------------------
  describe('human-readable messages', () => {
    it('EscrowNotFound message is descriptive', () => {
      const { message } = parseSorobanError('escrow not found');
      expect(message.toLowerCase()).toContain('escrow');
    });

    it('EscrowAlreadySettled message is descriptive', () => {
      const { message } = parseSorobanError('already settled');
      expect(message.toLowerCase()).toContain('escrow');
    });

    it('DisputeAlreadyOpen message is descriptive', () => {
      const { message } = parseSorobanError('DisputeAlreadyOpen');
      expect(message.toLowerCase()).toContain('dispute');
    });

    it('Unknown message includes the raw string', () => {
      const raw = 'totally_alien_panic_string';
      const { message } = parseSorobanError(raw);
      expect(message).toContain(raw);
    });
  });
});

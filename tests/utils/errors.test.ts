import { parseSorobanError, VeriTixError, VeriTixErrorCode } from '../../src/utils/errors';

describe('VeriTixError', () => {
  it('extends Error', () => {
    const err = new VeriTixError(VeriTixErrorCode.Unknown, 'test message');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(VeriTixError);
  });

  it('has code property', () => {
    const err = new VeriTixError(VeriTixErrorCode.EscrowNotFound, 'not found');
    expect(err.code).toBe(VeriTixErrorCode.EscrowNotFound);
  });

  it('has raw property (rawMessage) when provided', () => {
    const err = new VeriTixError(VeriTixErrorCode.Unknown, 'msg', 'raw panic string');
    expect(err.rawMessage).toBe('raw panic string');
  });

  it('rawMessage is undefined when not provided', () => {
    const err = new VeriTixError(VeriTixErrorCode.Unknown, 'msg');
    expect(err.rawMessage).toBeUndefined();
  });

  it('sets name to VeriTixError', () => {
    const err = new VeriTixError(VeriTixErrorCode.Unknown, 'msg');
    expect(err.name).toBe('VeriTixError');
  });
});

describe('parseSorobanError', () => {
  it('maps "escrow not found" → ESCROW_NOT_FOUND', () => {
    const err = parseSorobanError('escrow not found');
    expect(err).toBeInstanceOf(VeriTixError);
    expect(err.code).toBe(VeriTixErrorCode.EscrowNotFound);
  });

  it('maps "DisputeAlreadyOpen" → DISPUTE_ALREADY_OPEN', () => {
    const err = parseSorobanError('DisputeAlreadyOpen');
    expect(err).toBeInstanceOf(VeriTixError);
    expect(err.code).toBe(VeriTixErrorCode.DisputeAlreadyOpen);
  });

  it('maps unknown message → UNKNOWN_CONTRACT_ERROR with raw preserved', () => {
    const err = parseSorobanError('some unknown message');
    expect(err).toBeInstanceOf(VeriTixError);
    expect(err.code).toBe(VeriTixErrorCode.Unknown);
    expect(err.rawMessage).toBe('some unknown message');
  });

  it('throws an actual VeriTixError instance, not a plain Error', () => {
    const err = parseSorobanError('escrow not found');
    expect(err).toBeInstanceOf(VeriTixError);
    expect(err.constructor.name).toBe('VeriTixError');
  });

  // Issue #203: ContractPaused has been removed; both "contract paused" and
  // "contract is already paused" map to ContractAlreadyPaused.
  it('maps "contract is already paused" → CONTRACT_ALREADY_PAUSED', () => {
    const err = parseSorobanError('contract is already paused');
    expect(err.code).toBe(VeriTixErrorCode.ContractAlreadyPaused);
  });

  it('maps the older "contract paused" panic → CONTRACT_ALREADY_PAUSED (canonical)', () => {
    const err = parseSorobanError('the contract paused operations today');
    expect(err.code).toBe(VeriTixErrorCode.ContractAlreadyPaused);
  });

  it('ContractPaused enum member is no longer exported', () => {
    expect((VeriTixErrorCode as unknown as Record<string, unknown>).ContractPaused).toBeUndefined();
  });
});

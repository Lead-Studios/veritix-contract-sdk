// Property-based tests for parseSorobanError
import { describe, it, expect } from '@jest/globals';
import { parseSorobanError, VeriTixErrorCode } from '../../src';

describe('parseSorobanError property tests', () => {
  it('parses all known error codes correctly', () => {
    const errorMap: Record<string, VeriTixErrorCode> = {
      'HostError': VeriTixErrorCode.HostError,
      'TrappedVmError': VeriTixErrorCode.TrappedVmError,
      'InvalidInput': VeriTixErrorCode.InvalidInput,
    };

    for (const [panic, code] of Object.entries(errorMap)) {
      const error = parseSorobanError(panic);
      expect(error.code).toBe(code);
    }
  });

  it('returns UnknownContractError for unknown strings', () => {
    const error = parseSorobanError('unknown error string');
    expect(error.code).toBe(VeriTixErrorCode.UnknownContractError);
    expect(error.raw).toBe('unknown error string');
  });

  it('returns UnknownContractError for empty string', () => {
    const error = parseSorobanError('');
    expect(error.code).toBe(VeriTixErrorCode.UnknownContractError);
  });

  it('does not double-wrap existing errors', () => {
    const original = parseSorobanError('HostError');
    const rewrapped = parseSorobanError(original as any);
    expect(rewrapped).toEqual(original);
  });
});

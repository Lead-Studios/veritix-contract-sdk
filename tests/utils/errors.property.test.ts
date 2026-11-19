// Tests for parseSorobanError: example-based cases plus property checks over
// generated inputs (seeded PRNG, so failures are reproducible).
import { describe, it, expect } from '@jest/globals';
import { parseSorobanError, VeriTixErrorCode } from '../../src';

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomString(rng: () => number): string {
  const len = Math.floor(rng() * 40);
  let out = '';
  for (let i = 0; i < len; i++) out += String.fromCharCode(32 + Math.floor(rng() * 95));
  return out;
}

describe('parseSorobanError property tests', () => {
  it('property: for any string input it returns an error with a valid code and the raw input', () => {
    const rng = makeRng(42);
    const validCodes = new Set<unknown>(Object.values(VeriTixErrorCode));
    for (let i = 0; i < 500; i++) {
      const input = randomString(rng);
      const error = parseSorobanError(input);
      expect(validCodes.has(error.code)).toBe(true);
      expect(error.raw).toBe(input);
    }
  });

  it('property: parsing is idempotent for any string input', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 200; i++) {
      const first = parseSorobanError(randomString(rng));
      expect(parseSorobanError(first as any)).toEqual(first);
    }
  });

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

// Fuzz tests for ScVal round-trip encoding/decoding
import { describe, it, expect } from '@jest/globals';
import { nativeToScVal, scValToNative } from '@stellar/stellar-sdk';

describe('ScVal fuzz tests', () => {
  it('bigint round-trip for i128 values', () => {
    const values = [0n, 1n, 100n, 1000000n, 9223372036854775807n];
    for (const v of values) {
      const encoded = nativeToScVal(v);
      const decoded = scValToNative(encoded) as bigint;
      expect(decoded).toBe(v);
    }
  });

  it('string round-trip for various lengths', () => {
    const strings = ['', 'a', 'hello', 'test string', 'a'.repeat(100)];
    for (const s of strings) {
      const encoded = nativeToScVal(s);
      const decoded = scValToNative(encoded) as string;
      expect(decoded).toBe(s);
    }
  });

  it('negative bigint round-trip', () => {
    const values = [-1n, -100n, -1000000n, -9223372036854775808n];
    for (const v of values) {
      const encoded = nativeToScVal(v);
      const decoded = scValToNative(encoded) as bigint;
      expect(decoded).toBe(v);
    }
  });
});

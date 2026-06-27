/**
 * @file tests/utils/format.test.ts
 * Unit tests for stroopsToXLM, xlmToStroops, and formatXLM.
 */

import { stroopsToXLM, xlmToStroops, formatXLM } from '../../src/utils/format';

describe('stroopsToXLM', () => {
  it('converts zero', () => {
    expect(stroopsToXLM(0n)).toBe('0.0000000');
  });

  it('converts exactly 1 XLM', () => {
    expect(stroopsToXLM(10_000_000n)).toBe('1.0000000');
  });

  it('converts 1.5 XLM', () => {
    expect(stroopsToXLM(15_000_000n)).toBe('1.5000000');
  });

  it('pads fractional part to 7 digits', () => {
    expect(stroopsToXLM(1n)).toBe('0.0000001');
  });

  it('handles large values', () => {
    expect(stroopsToXLM(1_000_000_000_000_000n)).toBe('100000000.0000000');
  });

  it('throws TypeError for negative stroops', () => {
    expect(() => stroopsToXLM(-1n)).toThrow(TypeError);
  });

  it('throws TypeError for non-bigint input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => stroopsToXLM(123 as any)).toThrow(TypeError);
  });
});

describe('xlmToStroops', () => {
  it('converts "1" to 10_000_000n', () => {
    expect(xlmToStroops('1')).toBe(10_000_000n);
  });

  it('converts "1.5" to 15_000_000n', () => {
    expect(xlmToStroops('1.5')).toBe(15_000_000n);
  });

  it('converts "0.0000001" to 1n', () => {
    expect(xlmToStroops('0.0000001')).toBe(1n);
  });

  it('converts number input', () => {
    expect(xlmToStroops(2)).toBe(20_000_000n);
  });

  it('truncates extra decimal places beyond 7', () => {
    expect(xlmToStroops('1.12345678')).toBe(xlmToStroops('1.1234567'));
  });

  it('converts "0" to 0n', () => {
    expect(xlmToStroops('0')).toBe(0n);
  });

  it('throws TypeError for negative string', () => {
    expect(() => xlmToStroops('-1')).toThrow(TypeError);
  });

  it('throws TypeError for non-numeric string', () => {
    expect(() => xlmToStroops('abc')).toThrow(TypeError);
  });

  it('throws TypeError for non-string/number input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => xlmToStroops(null as any)).toThrow(TypeError);
  });
});

describe('formatXLM', () => {
  it('formats with commas and 7 decimals by default', () => {
    expect(formatXLM(1_234_567_890_000n)).toBe('123,456.7890000');
  });

  it('formats zero', () => {
    expect(formatXLM(0n)).toBe('0.0000000');
  });

  it('formats with custom decimal places', () => {
    expect(formatXLM(10_000_000n, 2)).toBe('1.00');
  });

  it('formats with 0 decimals', () => {
    expect(formatXLM(10_000_000n, 0)).toBe('1');
  });

  it('formats large amounts with commas', () => {
    expect(formatXLM(1_000_000_000_000_000n, 0)).toBe('100,000,000');
  });

  it('throws TypeError for negative stroops', () => {
    expect(() => formatXLM(-1n)).toThrow(TypeError);
  });

  it('throws TypeError for invalid decimals', () => {
    expect(() => formatXLM(10_000_000n, 8)).toThrow(TypeError);
    expect(() => formatXLM(10_000_000n, -1)).toThrow(TypeError);
  });
});

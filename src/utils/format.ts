/**
 * @module utils/format
 * Value conversions between XLM and the SDK's integer stroop unit.
 *
 * Stellar uses "stroops" as its smallest unit: 1 XLM = 10,000,000 stroops
 * (7 decimal places). All amounts in the SDK are expressed in stroops as
 * `bigint` to avoid floating-point precision loss. These two helpers convert
 * between the display unit (XLM) and the wire unit (stroops).
 *
 * `formatXLM` (display formatting with configurable precision) is scoped to
 * issue #595 and is intentionally not included here.
 */

/** Number of stroops in one XLM (7 decimal places). */
const STROOPS_PER_XLM = 10_000_000n;

/**
 * Converts a stroop amount to an XLM string with exactly 7 decimal places.
 *
 * @example
 * ```ts
 * stroopsToXLM(15_000_000n) // "1.5000000"
 * stroopsToXLM(1n)          // "0.0000001"
 * ```
 *
 * @param stroops - Amount in stroops.
 * @throws {TypeError} if `stroops` is not a `bigint` or is negative.
 */
export function stroopsToXLM(stroops: bigint): string {
  if (typeof stroops !== 'bigint') {
    throw new TypeError('stroopsToXLM: stroops must be a bigint');
  }
  if (stroops < 0n) {
    throw new TypeError('stroopsToXLM: stroops must be non-negative');
  }

  const whole = stroops / STROOPS_PER_XLM;
  const frac = stroops % STROOPS_PER_XLM;
  return `${whole}.${frac.toString().padStart(7, '0')}`;
}

/**
 * Converts an XLM amount (string or number) to stroops (`bigint`) without
 * ever going through a float.
 *
 * @example
 * ```ts
 * xlmToStroops('1.5')       // 15_000_000n
 * xlmToStroops('0.0000001') // 1n
 * xlmToStroops(2)           // 20_000_000n
 * ```
 *
 * Values with more than 7 decimal places are truncated (never rounded).
 *
 * @param xlm - XLM amount as a string of digits with an optional fraction.
 * @throws {TypeError} if `xlm` is neither a string nor a number, is not a
 *   non-negative decimal, or parses to a negative value.
 */
export function xlmToStroops(xlm: string | number): bigint {
  if (typeof xlm !== 'string' && typeof xlm !== 'number') {
    throw new TypeError('xlmToStroops: xlm must be a string or number');
  }

  const str = String(xlm).trim();
  if (!/^\d+(\.\d+)?$/.test(str)) {
    throw new TypeError(`xlmToStroops: invalid XLM value — expected a non-negative decimal, got "${str}"`);
  }

  const [wholePart, fracPart = ''] = str.split('.');
  if (wholePart === undefined) {
    throw new TypeError(`xlmToStroops: invalid XLM value — expected a non-negative decimal, got "${str}"`);
  }
  const frac = fracPart.slice(0, 7).padEnd(7, '0');
  return BigInt(wholePart) * STROOPS_PER_XLM + BigInt(frac);
}
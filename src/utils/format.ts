/**
 * @module utils/format
 * XLM ↔ stroop conversion and display-formatting helpers.
 *
 * 1 XLM = 10_000_000 stroops (7 decimal places).
 */

const STROOPS_PER_XLM = 10_000_000n;

/**
 * Converts a stroop amount to an XLM string with exactly 7 decimal places.
 *
 * @example stroopsToXLM(15_000_000n) // "1.5000000"
 */
export function stroopsToXLM(stroops: bigint): string {
  if (typeof stroops !== 'bigint') throw new TypeError('stroops must be a bigint');
  if (stroops < 0n) throw new TypeError('stroops must be non-negative');

  const whole = stroops / STROOPS_PER_XLM;
  const frac = stroops % STROOPS_PER_XLM;
  return `${whole}.${frac.toString().padStart(7, '0')}`;
}

/**
 * Converts an XLM amount (string or number) to stroops (bigint).
 *
 * @example xlmToStroops("1.5") // 15_000_000n
 */
export function xlmToStroops(xlm: string | number): bigint {
  if (typeof xlm !== 'string' && typeof xlm !== 'number') {
    throw new TypeError('xlm must be a string or number');
  }
  const str = String(xlm).trim();
  if (!/^\d+(\.\d+)?$/.test(str)) throw new TypeError(`Invalid XLM value: "${str}"`);

  const [wholePart, fracPart = ''] = str.split('.');
  const frac = fracPart.slice(0, 7).padEnd(7, '0');
  return BigInt(wholePart) * STROOPS_PER_XLM + BigInt(frac);
}

/**
 * Formats a stroop amount as a human-readable XLM string with commas.
 *
 * @param stroops  - Amount in stroops.
 * @param decimals - Number of decimal places (default 7, max 7).
 *
 * @example formatXLM(1_234_567_890_000n) // "123,456.7890000"
 */
export function formatXLM(stroops: bigint, decimals = 7): string {
  if (typeof stroops !== 'bigint') throw new TypeError('stroops must be a bigint');
  if (stroops < 0n) throw new TypeError('stroops must be non-negative');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 7) {
    throw new TypeError('decimals must be an integer between 0 and 7');
  }

  const raw = stroopsToXLM(stroops); // e.g. "123456.7890000"
  const [whole, frac] = raw.split('.');
  const truncatedFrac = frac.slice(0, decimals);

  // Add thousands separators to the whole part
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimals > 0 ? `${withCommas}.${truncatedFrac}` : withCommas;
}

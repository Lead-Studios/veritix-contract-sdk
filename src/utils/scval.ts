/**
 * @module utils/scval
 * Helpers for converting between TypeScript primitives and Soroban `xdr.ScVal`.
 *
 * Each helper is a thin, focused adapter over the `@stellar/stellar-sdk` XDR
 * types so that module implementations never duplicate conversion logic.
 */
import {
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// TypeScript → ScVal
// ---------------------------------------------------------------------------

/**
 * Converts a Stellar account or contract address string to an `ScVal` of
 * type `Address`.
 *
 * @param address - A valid Stellar account (G…) or contract (C…) address.
 * @throws {Error} if the address is not parseable by the Stellar SDK.
 */
export function addressToScVal(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

/**
 * Converts a `bigint` to an `ScVal` of the requested numeric type.
 *
 * @param value - The integer value.
 * @param type  - `"i128"` for signed 128-bit, `"u64"` for unsigned 64-bit.
 */
export function bigintToScVal(value: bigint, type: 'i128' | 'u64'): xdr.ScVal {
  return nativeToScVal(value, { type });
}

/**
 * Converts a `boolean` to an `ScVal` of type `Bool`.
 */
export function boolToScVal(value: boolean): xdr.ScVal {
  return xdr.ScVal.scvBool(value);
}

/**
 * Converts a UTF-8 `string` to an `ScVal` of type `String`.
 */
export function stringToScVal(value: string): xdr.ScVal {
  return xdr.ScVal.scvString(value);
}

// ---------------------------------------------------------------------------
// ScVal → TypeScript
// ---------------------------------------------------------------------------

/**
 * Extracts a UTF-8 string from an `ScVal` of type `String` or `Symbol`.
 *
 * @throws {Error} if the `ScVal` is not a string/symbol type.
 */
export function scValToString(val: xdr.ScVal): string {
  const native = scValToNative(val);
  if (typeof native !== 'string') {
    throw new Error(
      `Expected ScVal of type String or Symbol, got switch: ${val.switch().name}`,
    );
  }
  return native;
}

/**
 * Extracts a `bigint` from an `ScVal` of any integer type
 * (`i64`, `u64`, `i128`, `u128`, `i256`, `u256`).
 *
 * @throws {Error} if the native value is not a `bigint` or `number`.
 */
export function scValToBigint(val: xdr.ScVal): bigint {
  const native = scValToNative(val);
  if (typeof native === 'bigint') return native;
  if (typeof native === 'number') return BigInt(native);
  throw new Error(
    `Expected ScVal to be a numeric type, got switch: ${val.switch().name}`,
  );
}

/**
 * Extracts a `boolean` from an `ScVal` of type `Bool`.
 *
 * @throws {Error} if the `ScVal` is not a boolean type.
 */
export function scValToBoolean(val: xdr.ScVal): boolean {
  const native = scValToNative(val);
  if (typeof native !== 'boolean') {
    throw new Error(
      `Expected ScVal of type Bool, got switch: ${val.switch().name}`,
    );
  }
  return native;
}

/**
 * Extracts a JavaScript `number` from an `ScVal` of any integer type.
 *
 * > **Warning:** values exceeding `Number.MAX_SAFE_INTEGER` will lose
 * > precision.  For large amounts, prefer {@link scValToBigint}.
 *
 * @throws {Error} if the native value is not numeric.
 */
export function scValToNumber(val: xdr.ScVal): number {
  const native = scValToNative(val);
  if (typeof native === 'number') return native;
  if (typeof native === 'bigint') return Number(native);
  throw new Error(
    `Expected ScVal to be a numeric type, got switch: ${val.switch().name}`,
  );
}

/**
 * @file tests/utils/scval.test.ts
 * Unit tests for all ScVal conversion helpers in utils/scval.ts.
 */

import { Keypair, xdr } from "@stellar/stellar-sdk";
import {
  addressToScVal,
  bigintToScVal,
  boolToScVal,
  stringToScVal,
  scValToString,
  scValToBigint,
  scValToBoolean,
  scValToNumber,
} from "../../src/utils/scval";

describe("addressToScVal", () => {
  
  it("returns scvAddress for G address", () => { expect(addressToScVal(Keypair.random().publicKey()).switch().name).toBe("scvAddress"); });
  it("throws for invalid address", () => { expect(() => addressToScVal("bad")).toThrow(); });
  it("accepts random keypair", () => { expect(addressToScVal(Keypair.random().publicKey()).switch().name).toBe("scvAddress"); });
});

describe("bigintToScVal i128", () => {
  it("encodes 0n", () => { expect(bigintToScVal(0n, "i128").switch().name).toBe("scvI128"); });
  it("encodes positive", () => { expect(bigintToScVal(1_000_000n, "i128").switch().name).toBe("scvI128"); });
  it("encodes negative", () => { expect(bigintToScVal(-42n, "i128").switch().name).toBe("scvI128"); });
  it("encodes MAX_I128", () => { expect(bigintToScVal(170141183460469231731687303715884105727n, "i128").switch().name).toBe("scvI128"); });
  it("encodes MIN_I128", () => { expect(bigintToScVal(-170141183460469231731687303715884105728n, "i128").switch().name).toBe("scvI128"); });
});

describe("bigintToScVal u64", () => {
  it("encodes 0n", () => { expect(bigintToScVal(0n, "u64").switch().name).toBe("scvU64"); });
  it("encodes positive", () => { expect(bigintToScVal(9_999_999n, "u64").switch().name).toBe("scvU64"); });
  it("encodes u64 max", () => { expect(bigintToScVal(18446744073709551615n, "u64").switch().name).toBe("scvU64"); });
});

describe("stringToScVal", () => {
  it("returns scvString", () => { expect(stringToScVal("hello").switch().name).toBe("scvString"); });
  it("encodes empty string", () => { expect(stringToScVal("").switch().name).toBe("scvString"); });
});

describe("boolToScVal", () => {
  it("encodes true", () => { const v = boolToScVal(true); expect(v.switch().name).toBe("scvBool"); expect(v.b()).toBe(true); });
  it("encodes false", () => { const v = boolToScVal(false); expect(v.switch().name).toBe("scvBool"); expect(v.b()).toBe(false); });
});

describe("scValToString", () => {
  it("extracts string", () => { expect(scValToString(xdr.ScVal.scvString("test-event"))).toBe("test-event"); });
  it("extracts empty string", () => { expect(scValToString(xdr.ScVal.scvString(""))).toBe(""); });
  it("throws for Bool", () => { expect(() => scValToString(xdr.ScVal.scvBool(true))).toThrow(); });
  it("throws for void", () => { expect(() => scValToString(xdr.ScVal.scvVoid())).toThrow(); });
  it("round-trips", () => { expect(scValToString(stringToScVal("abc"))).toBe("abc"); });
});

describe("scValToBigint", () => {
  it("extracts from i128", () => { expect(scValToBigint(bigintToScVal(12345n, "i128"))).toBe(12345n); });
  it("extracts from u64", () => { expect(scValToBigint(bigintToScVal(99n, "u64"))).toBe(99n); });
  it("handles 0n", () => { expect(scValToBigint(bigintToScVal(0n, "i128"))).toBe(0n); });
  it("handles negative", () => { expect(scValToBigint(bigintToScVal(-1n, "i128"))).toBe(-1n); });
  it("throws for string", () => { expect(() => scValToBigint(xdr.ScVal.scvString("x"))).toThrow(); });
  it("throws for Bool", () => { expect(() => scValToBigint(xdr.ScVal.scvBool(true))).toThrow(); });
});

describe("scValToBoolean", () => {
  it("extracts true", () => { expect(scValToBoolean(xdr.ScVal.scvBool(true))).toBe(true); });
  it("extracts false", () => { expect(scValToBoolean(xdr.ScVal.scvBool(false))).toBe(false); });
  it("throws for string", () => { expect(() => scValToBoolean(xdr.ScVal.scvString("true"))).toThrow(); });
  it("throws for void", () => { expect(() => scValToBoolean(xdr.ScVal.scvVoid())).toThrow(); });
  it("round-trips with boolToScVal", () => { expect(scValToBoolean(boolToScVal(true))).toBe(true); expect(scValToBoolean(boolToScVal(false))).toBe(false); });
});

describe("scValToNumber", () => {
  it("extracts from u64", () => { expect(scValToNumber(bigintToScVal(42n, "u64"))).toBe(42); });
  it("extracts 0", () => { expect(scValToNumber(bigintToScVal(0n, "u64"))).toBe(0); });
  it("throws for string", () => { expect(() => scValToNumber(xdr.ScVal.scvString("42"))).toThrow(); });
});

describe("Round-trip conversions", () => {
  it("i128 positive values", () => { for (const v of [0n, 1n, 1_000_000n]) expect(scValToBigint(bigintToScVal(v, "i128"))).toBe(v); });
  it("i128 negative values", () => { for (const v of [-1n, -42n, -1_000_000n]) expect(scValToBigint(bigintToScVal(v, "i128"))).toBe(v); });
  it("u64 values", () => { for (const v of [0n, 1n, 99n]) expect(scValToBigint(bigintToScVal(v, "u64"))).toBe(v); });
  it("string values", () => { for (const s of ["", "hello", "ticket-uuid"]) expect(scValToString(stringToScVal(s))).toBe(s); });
  it("bool values", () => { expect(scValToBoolean(boolToScVal(true))).toBe(true); expect(scValToBoolean(boolToScVal(false))).toBe(false); });
  it("large i128 round-trip", () => { const big = 170141183460469231731687303715884105727n; expect(scValToBigint(bigintToScVal(big, "i128"))).toBe(big); });
  it("scValToBigint(bigintToScVal(0n, i128)) === 0n", () => { expect(scValToBigint(bigintToScVal(0n, "i128"))).toBe(0n); });
});
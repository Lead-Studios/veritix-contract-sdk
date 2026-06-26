/**
 * @file tests/fixtures/escrow.xdr.ts
 * Pre-built ScVal XDR fixture helpers for EscrowRecord parser tests.
 *
 * Each helper constructs a raw xdr.ScVal ScvMap that mirrors the layout
 * the VeriTix Soroban contract would return for an escrow view call.
 */

import { xdr, nativeToScVal } from "@stellar/stellar-sdk";
import { Keypair } from "@stellar/stellar-sdk";
import { bigintToScVal, boolToScVal, stringToScVal } from "../../src/utils/scval";

/**
 * Builds a ScvMap entry (key → val) pair.
 */
function mapEntry(key: string, val: xdr.ScVal): xdr.ScMapEntry {
  return new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val });
}

/**
 * Wraps an array of map entries into an scvMap ScVal.
 */
function scvMap(entries: xdr.ScMapEntry[]): xdr.ScVal {
  return xdr.ScVal.scvMap(entries);
}

// ---------------------------------------------------------------------------
// Stable test addresses (random but valid Stellar G… keypairs)
// ---------------------------------------------------------------------------
export const TEST_DEPOSITOR = Keypair.random().publicKey();
export const TEST_BENEFICIARY = Keypair.random().publicKey();

// ---------------------------------------------------------------------------
// Escrow fixture factory
// ---------------------------------------------------------------------------

export interface EscrowFixtureParams {
  id?: bigint;
  depositor?: string;
  beneficiary?: string;
  amount?: bigint;
  released?: boolean;
  refunded?: boolean;
  expiryLedger?: number;
  memos?: string[];
}

/**
 * Returns an scvMap ScVal that parseEscrowRecord() can consume.
 */
export function makeEscrowScVal(params: EscrowFixtureParams = {}): xdr.ScVal {
  const {
    id           = 1n,
    depositor    = TEST_DEPOSITOR,
    beneficiary  = TEST_BENEFICIARY,
    amount       = 1_000_000n,
    released     = false,
    refunded     = false,
    expiryLedger = 1_500_000,
    memos        = ["ticket-ref-001"],
  } = params;

  const memosVec = xdr.ScVal.scvVec(memos.map((m) => stringToScVal(m)));

  return scvMap([
    mapEntry("id",           bigintToScVal(id, "u64")),
    mapEntry("depositor",    stringToScVal(depositor)),
    mapEntry("beneficiary",  stringToScVal(beneficiary)),
    mapEntry("amount",       bigintToScVal(amount, "i128")),
    mapEntry("released",     boolToScVal(released)),
    mapEntry("refunded",     boolToScVal(refunded)),
    mapEntry("expiry_ledger", nativeToScVal(expiryLedger, { type: "u32" })),
    mapEntry("memos",        memosVec),
  ]);
}
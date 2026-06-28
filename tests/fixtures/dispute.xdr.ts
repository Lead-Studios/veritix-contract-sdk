/**
 * @file tests/fixtures/dispute.xdr.ts
 * Pre-built ScVal XDR fixture helpers for DisputeRecord, SplitRecord,
 * and RecurringRecord parser tests.
 */

import { xdr, nativeToScVal } from "@stellar/stellar-sdk";
import { Keypair } from "@stellar/stellar-sdk";
import { bigintToScVal, boolToScVal, stringToScVal } from "../../src/utils/scval";

function mapEntry(key: string, val: xdr.ScVal): xdr.ScMapEntry {
  return new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val });
}

function scvMap(entries: xdr.ScMapEntry[]): xdr.ScVal {
  return xdr.ScVal.scvMap(entries);
}

// ---------------------------------------------------------------------------
// Stable test addresses
// ---------------------------------------------------------------------------
export const TEST_CLAIMANT  = Keypair.random().publicKey();
export const TEST_RESOLVER  = Keypair.random().publicKey();
export const TEST_SENDER    = Keypair.random().publicKey();
export const TEST_RECIPIENT1 = Keypair.random().publicKey();
export const TEST_RECIPIENT2 = Keypair.random().publicKey();
export const TEST_PAYER     = Keypair.random().publicKey();
export const TEST_PAYEE     = Keypair.random().publicKey();

// ---------------------------------------------------------------------------
// DisputeRecord fixture
// ---------------------------------------------------------------------------

export type DisputeStatusRaw = "Open" | "ResolvedForBeneficiary" | "ResolvedForDepositor";

export interface DisputeFixtureParams {
  id?:       bigint;
  escrowId?: bigint;
  claimant?: string;
  resolver?: string;
  status?:   DisputeStatusRaw;
  openedAt?: number;
}

export function makeDisputeScVal(params: DisputeFixtureParams = {}): xdr.ScVal {
  const {
    id       = 10n,
    escrowId = 1n,
    claimant = TEST_CLAIMANT,
    resolver = TEST_RESOLVER,
    status   = "Open",
    openedAt = 900_000,
  } = params;

  return scvMap([
    mapEntry("id",        bigintToScVal(id, "u64")),
    mapEntry("escrow_id", bigintToScVal(escrowId, "u64")),
    mapEntry("claimant",  stringToScVal(claimant)),
    mapEntry("resolver",  stringToScVal(resolver)),
    mapEntry("status",    stringToScVal(status)),
    mapEntry("opened_at", nativeToScVal(openedAt, { type: "u32" })),
  ]);
}

// ---------------------------------------------------------------------------
// SplitRecord fixture
// ---------------------------------------------------------------------------

export interface SplitRecipientFixture {
  address:  string;
  shareBps: number;
}

export interface SplitFixtureParams {
  id?:          bigint;
  sender?:      string;
  recipients?:  SplitRecipientFixture[];
  totalAmount?: bigint;
  distributed?: boolean;
  cancelled?:   boolean;
}

export function makeSplitScVal(params: SplitFixtureParams = {}): xdr.ScVal {
  const {
    id          = 5n,
    sender      = TEST_SENDER,
    recipients  = [
      { address: TEST_RECIPIENT1, shareBps: 6_000 },
      { address: TEST_RECIPIENT2, shareBps: 4_000 },
    ],
    totalAmount = 10_000_000n,
    distributed = false,
    cancelled   = false,
  } = params;

  const recipientsVec = xdr.ScVal.scvVec(
    recipients.map((r) =>
      scvMap([
        mapEntry("address",   stringToScVal(r.address)),
        mapEntry("share_bps", nativeToScVal(r.shareBps, { type: "u32" })),
      ]),
    ),
  );

  return scvMap([
    mapEntry("id",           bigintToScVal(id, "u64")),
    mapEntry("sender",       stringToScVal(sender)),
    mapEntry("recipients",   recipientsVec),
    mapEntry("total_amount", bigintToScVal(totalAmount, "i128")),
    mapEntry("distributed",  boolToScVal(distributed)),
    mapEntry("cancelled",    boolToScVal(cancelled)),
  ]);
}

// ---------------------------------------------------------------------------
// RecurringRecord fixture
// ---------------------------------------------------------------------------

export interface RecurringFixtureParams {
  id?:                bigint;
  payer?:             string;
  payee?:             string;
  amount?:            bigint;
  interval?:          number;
  active?:            boolean;
  lastChargedLedger?: number;
}

export function makeRecurringScVal(params: RecurringFixtureParams = {}): xdr.ScVal {
  const {
    id                = 20n,
    payer             = TEST_PAYER,
    payee             = TEST_PAYEE,
    amount            = 500_000n,
    interval          = 2_592_000,
    active            = true,
    lastChargedLedger = 800_000,
  } = params;

  return scvMap([
    mapEntry("id",                  bigintToScVal(id, "u64")),
    mapEntry("payer",               stringToScVal(payer)),
    mapEntry("payee",               stringToScVal(payee)),
    mapEntry("amount",              bigintToScVal(amount, "i128")),
    mapEntry("interval",            nativeToScVal(interval, { type: "u32" })),
    mapEntry("active",              boolToScVal(active)),
    mapEntry("last_charged_ledger", nativeToScVal(lastChargedLedger, { type: "u32" })),
  ]);
}
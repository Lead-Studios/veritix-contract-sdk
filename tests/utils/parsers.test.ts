/**
 * @file tests/utils/parsers.test.ts
 * Unit tests for all XDR parsers in src/utils/parsers.ts.
 *
 * Each parser is exercised against programmatically constructed ScVal
 * fixtures (see tests/fixtures/) that mirror the struct layout the
 * VeriTix Soroban contract returns for view calls.
 */

import { xdr, nativeToScVal } from "@stellar/stellar-sdk";
import {
  parseEscrowRecord,
  parseSplitRecord,
  parseDisputeRecord,
  parseRecurringRecord,
} from "../../src/utils/parsers";
import { DisputeStatus } from "../../src/types/index";

import {
  makeEscrowScVal,
  TEST_DEPOSITOR,
  TEST_BENEFICIARY,
} from "../fixtures/escrow.xdr";

import {
  makeDisputeScVal,
  makeSplitScVal,
  makeRecurringScVal,
  TEST_CLAIMANT,
  TEST_RESOLVER,
  TEST_SENDER,
  TEST_RECIPIENT1,
  TEST_RECIPIENT2,
  TEST_PAYER,
  TEST_PAYEE,
} from "../fixtures/dispute.xdr";

// ---------------------------------------------------------------------------
// parseEscrowRecord
// ---------------------------------------------------------------------------

describe("parseEscrowRecord", () => {
  it("maps id correctly", () => {
    const val = makeEscrowScVal({ id: 42n });
    const record = parseEscrowRecord(val);
    expect(record.id).toBe(42n);
  });

  it("maps depositor correctly", () => {
    const record = parseEscrowRecord(makeEscrowScVal({ depositor: TEST_DEPOSITOR }));
    expect(record.depositor).toBe(TEST_DEPOSITOR);
  });

  it("maps beneficiary correctly", () => {
    const record = parseEscrowRecord(makeEscrowScVal({ beneficiary: TEST_BENEFICIARY }));
    expect(record.beneficiary).toBe(TEST_BENEFICIARY);
  });

  it("maps amount correctly", () => {
    const record = parseEscrowRecord(makeEscrowScVal({ amount: 5_000_000n }));
    expect(record.amount).toBe(5_000_000n);
  });

  it("maps released = false correctly", () => {
    const record = parseEscrowRecord(makeEscrowScVal({ released: false }));
    expect(record.released).toBe(false);
  });

  it("maps released = true correctly", () => {
    const record = parseEscrowRecord(makeEscrowScVal({ released: true }));
    expect(record.released).toBe(true);
  });

  it("maps refunded = false correctly", () => {
    const record = parseEscrowRecord(makeEscrowScVal({ refunded: false }));
    expect(record.refunded).toBe(false);
  });

  it("maps refunded = true correctly", () => {
    const record = parseEscrowRecord(makeEscrowScVal({ refunded: true }));
    expect(record.refunded).toBe(true);
  });

  it("maps expiryLedger correctly", () => {
    const record = parseEscrowRecord(makeEscrowScVal({ expiryLedger: 2_000_000 }));
    expect(record.expiryLedger).toBe(2_000_000);
  });

  it("maps memos array correctly", () => {
    const memos = ["event-ticket-001", "vip-pass-007"];
    const record = parseEscrowRecord(makeEscrowScVal({ memos }));
    expect(record.memos).toEqual(memos);
  });

  it("maps empty memos to an empty array", () => {
    const record = parseEscrowRecord(makeEscrowScVal({ memos: [] }));
    expect(record.memos).toEqual([]);
  });

  it("maps a single memo string correctly", () => {
    const record = parseEscrowRecord(makeEscrowScVal({ memos: ["ref-xyz"] }));
    expect(record.memos).toEqual(["ref-xyz"]);
  });

  it("returns the full record with all fields present", () => {
    const val = makeEscrowScVal({
      id: 99n,
      depositor: TEST_DEPOSITOR,
      beneficiary: TEST_BENEFICIARY,
      amount: 1_000n,
      released: false,
      refunded: false,
      expiryLedger: 500_000,
      memos: ["ticket-A"],
    });
    const record = parseEscrowRecord(val);
    expect(record).toEqual({
      id: 99n,
      depositor: TEST_DEPOSITOR,
      beneficiary: TEST_BENEFICIARY,
      amount: 1_000n,
      released: false,
      refunded: false,
      expiryLedger: 500_000,
      memos: ["ticket-A"],
    });
  });

  it("throws when passed a non-map ScVal", () => {
    expect(() => parseEscrowRecord(xdr.ScVal.scvString("bad"))).toThrow("ScvMap");
  });

  it("throws when a required field is missing", () => {
    const entries = [
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("id"), val: nativeToScVal(1, { type: "u64" }) }),
    ];
    const partial = xdr.ScVal.scvMap(entries);
    expect(() => parseEscrowRecord(partial)).toThrow(/depositor|missing/i);
  });
});

// ---------------------------------------------------------------------------
// parseSplitRecord
// ---------------------------------------------------------------------------

describe("parseSplitRecord", () => {
  it("maps id correctly", () => {
    const record = parseSplitRecord(makeSplitScVal({ id: 7n }));
    expect(record.id).toBe(7n);
  });

  it("maps sender correctly", () => {
    const record = parseSplitRecord(makeSplitScVal({ sender: TEST_SENDER }));
    expect(record.sender).toBe(TEST_SENDER);
  });

  it("maps totalAmount correctly", () => {
    const record = parseSplitRecord(makeSplitScVal({ totalAmount: 20_000_000n }));
    expect(record.totalAmount).toBe(20_000_000n);
  });

  it("maps distributed = false correctly", () => {
    const record = parseSplitRecord(makeSplitScVal({ distributed: false }));
    expect(record.distributed).toBe(false);
  });

  it("maps distributed = true correctly", () => {
    const record = parseSplitRecord(makeSplitScVal({ distributed: true }));
    expect(record.distributed).toBe(true);
  });

  it("maps cancelled = false correctly", () => {
    const record = parseSplitRecord(makeSplitScVal({ cancelled: false }));
    expect(record.cancelled).toBe(false);
  });

  it("maps cancelled = true correctly", () => {
    const record = parseSplitRecord(makeSplitScVal({ cancelled: true }));
    expect(record.cancelled).toBe(true);
  });

  it("builds recipients array with correct length", () => {
    const recipients = [
      { address: TEST_RECIPIENT1, shareBps: 6_000 },
      { address: TEST_RECIPIENT2, shareBps: 4_000 },
    ];
    const record = parseSplitRecord(makeSplitScVal({ recipients }));
    expect(record.recipients).toHaveLength(2);
  });

  it("maps first recipient address correctly", () => {
    const recipients = [
      { address: TEST_RECIPIENT1, shareBps: 7_000 },
      { address: TEST_RECIPIENT2, shareBps: 3_000 },
    ];
    const record = parseSplitRecord(makeSplitScVal({ recipients }));
    expect(record.recipients[0].address).toBe(TEST_RECIPIENT1);
  });

  it("maps shareBps correctly for each recipient", () => {
    const recipients = [
      { address: TEST_RECIPIENT1, shareBps: 6_000 },
      { address: TEST_RECIPIENT2, shareBps: 4_000 },
    ];
    const record = parseSplitRecord(makeSplitScVal({ recipients }));
    expect(record.recipients[0].shareBps).toBe(6_000);
    expect(record.recipients[1].shareBps).toBe(4_000);
  });

  it("maps an empty recipients array", () => {
    const record = parseSplitRecord(makeSplitScVal({ recipients: [] }));
    expect(record.recipients).toEqual([]);
  });

  it("returns the full split record correctly", () => {
    const recipients = [{ address: TEST_RECIPIENT1, shareBps: 10_000 }];
    const record = parseSplitRecord(makeSplitScVal({
      id: 3n, sender: TEST_SENDER, recipients, totalAmount: 5_000n,
      distributed: false, cancelled: false,
    }));
    expect(record).toMatchObject({
      id: 3n,
      sender: TEST_SENDER,
      totalAmount: 5_000n,
      distributed: false,
      cancelled: false,
    });
    expect(record.recipients).toHaveLength(1);
  });

  it("throws when passed a non-map ScVal", () => {
    expect(() => parseSplitRecord(xdr.ScVal.scvBool(true))).toThrow("ScvMap");
  });
});

// ---------------------------------------------------------------------------
// parseDisputeRecord
// ---------------------------------------------------------------------------

describe("parseDisputeRecord", () => {
  it("maps id correctly", () => {
    const record = parseDisputeRecord(makeDisputeScVal({ id: 55n }));
    expect(record.id).toBe(55n);
  });

  it("maps escrowId correctly", () => {
    const record = parseDisputeRecord(makeDisputeScVal({ escrowId: 12n }));
    expect(record.escrowId).toBe(12n);
  });

  it("maps claimant correctly", () => {
    const record = parseDisputeRecord(makeDisputeScVal({ claimant: TEST_CLAIMANT }));
    expect(record.claimant).toBe(TEST_CLAIMANT);
  });

  it("maps resolver correctly", () => {
    const record = parseDisputeRecord(makeDisputeScVal({ resolver: TEST_RESOLVER }));
    expect(record.resolver).toBe(TEST_RESOLVER);
  });

  it("maps openedAt correctly", () => {
    const record = parseDisputeRecord(makeDisputeScVal({ openedAt: 850_000 }));
    expect(record.openedAt).toBe(850_000);
  });

  it("maps status 'Open' to DisputeStatus.Open", () => {
    const record = parseDisputeRecord(makeDisputeScVal({ status: "Open" }));
    expect(record.status).toBe(DisputeStatus.Open);
  });

  it("maps status 'ResolvedForBeneficiary' correctly", () => {
    const record = parseDisputeRecord(makeDisputeScVal({ status: "ResolvedForBeneficiary" }));
    expect(record.status).toBe(DisputeStatus.ResolvedForBeneficiary);
  });

  it("maps status 'ResolvedForDepositor' correctly", () => {
    const record = parseDisputeRecord(makeDisputeScVal({ status: "ResolvedForDepositor" }));
    expect(record.status).toBe(DisputeStatus.ResolvedForDepositor);
  });

  it("throws for an unknown status value", () => {
    const val = makeDisputeScVal({ status: "Open" });
    // Manually corrupt the status entry to an unrecognised string
    const entries: xdr.ScMapEntry[] = [];
    for (const entry of val.map()!) {
      const key = entry.key();
      if (xdr.ScVal.scvSymbol("status").toXDR().equals(key.toXDR())) {
        entries.push(new xdr.ScMapEntry({ key, val: xdr.ScVal.scvString("BadStatus") }));
      } else {
        entries.push(entry);
      }
    }
    const corrupted = xdr.ScVal.scvMap(entries);
    expect(() => parseDisputeRecord(corrupted)).toThrow(/Unknown DisputeStatus/i);
  });

  it("returns the full dispute record correctly", () => {
    const record = parseDisputeRecord(makeDisputeScVal({
      id: 1n, escrowId: 2n, claimant: TEST_CLAIMANT, resolver: TEST_RESOLVER,
      status: "Open", openedAt: 900_000,
    }));
    expect(record).toMatchObject({
      id: 1n, escrowId: 2n, claimant: TEST_CLAIMANT, resolver: TEST_RESOLVER,
      status: DisputeStatus.Open, openedAt: 900_000,
    });
  });
});

// ---------------------------------------------------------------------------
// parseRecurringRecord
// ---------------------------------------------------------------------------

describe("parseRecurringRecord", () => {
  it("maps id correctly", () => {
    const record = parseRecurringRecord(makeRecurringScVal({ id: 77n }));
    expect(record.id).toBe(77n);
  });

  it("maps payer correctly", () => {
    const record = parseRecurringRecord(makeRecurringScVal({ payer: TEST_PAYER }));
    expect(record.payer).toBe(TEST_PAYER);
  });

  it("maps payee correctly", () => {
    const record = parseRecurringRecord(makeRecurringScVal({ payee: TEST_PAYEE }));
    expect(record.payee).toBe(TEST_PAYEE);
  });

  it("maps amount correctly", () => {
    const record = parseRecurringRecord(makeRecurringScVal({ amount: 2_500_000n }));
    expect(record.amount).toBe(2_500_000n);
  });

  it("maps interval correctly as a number", () => {
    const record = parseRecurringRecord(makeRecurringScVal({ interval: 86_400 }));
    expect(record.interval).toBe(86_400);
    expect(typeof record.interval).toBe("number");
  });

  it("maps active = true correctly", () => {
    const record = parseRecurringRecord(makeRecurringScVal({ active: true }));
    expect(record.active).toBe(true);
    expect(typeof record.active).toBe("boolean");
  });

  it("maps active = false correctly", () => {
    const record = parseRecurringRecord(makeRecurringScVal({ active: false }));
    expect(record.active).toBe(false);
  });

  it("maps lastChargedLedger correctly", () => {
    const record = parseRecurringRecord(makeRecurringScVal({ lastChargedLedger: 999_999 }));
    expect(record.lastChargedLedger).toBe(999_999);
  });

  it("returns the full recurring record correctly", () => {
    const record = parseRecurringRecord(makeRecurringScVal({
      id: 20n, payer: TEST_PAYER, payee: TEST_PAYEE, amount: 500_000n,
      interval: 2_592_000, active: true, lastChargedLedger: 800_000,
    }));
    expect(record).toMatchObject({
      id: 20n,
      payer: TEST_PAYER,
      payee: TEST_PAYEE,
      amount: 500_000n,
      interval: 2_592_000,
      active: true,
      lastChargedLedger: 800_000,
    });
  });

  it("throws when passed a non-map ScVal", () => {
    expect(() => parseRecurringRecord(xdr.ScVal.scvVoid())).toThrow("ScvMap");
  });
});
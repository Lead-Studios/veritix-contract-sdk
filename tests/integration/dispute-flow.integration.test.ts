/**
 * @file tests/integration/dispute-flow.integration.test.ts
 *
 * Integration test for the full dispute flow:
 *   escrow creation → open dispute → confirm dispute open → resolve dispute → confirm settled
 *
 * Requires the following environment variables (set in .env):
 *   STELLAR_SECRET_KEY   — signing keypair for buyer / claimant
 *   RESOLVER_SECRET_KEY  — signing keypair for the designated resolver
 *   ORGANIZER_SECRET_KEY — signing keypair for the event organizer (beneficiary)
 *   CONTRACT_ID          — Soroban contract ID deployed on testnet
 *
 * Run with:
 *   npm run test:integration
 */

import { Keypair } from "@stellar/stellar-sdk";
import { VeriTixClient } from "../../src/client";
import { getTestnetConfig } from "../../src/utils/network";
import { DisputeStatus } from "../../src/types/index";
import { requireEnv } from "../helpers/env";

// ---------------------------------------------------------------------------
// Helper — lazy env loading (skips tests when env is missing)
// ---------------------------------------------------------------------------

function loadEnv() {
  try {
    return {
      buyerSecret: requireEnv("STELLAR_SECRET_KEY"),
      resolverSecret: requireEnv("RESOLVER_SECRET_KEY"),
      organizerSecret: requireEnv("ORGANIZER_SECRET_KEY"),
      contractId: requireEnv("CONTRACT_ID"),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("Dispute Flow — integration", () => {
  const env = loadEnv();

  if (!env) {
    it.skip("skipped — STELLAR_SECRET_KEY / RESOLVER_SECRET_KEY / ORGANIZER_SECRET_KEY / CONTRACT_ID not set", () => {
      /* intentionally empty */
    });
    return;
  }

  const { buyerSecret, resolverSecret, organizerSecret, contractId } = env;

  const buyerKeypair = Keypair.fromSecret(buyerSecret);
  const resolverKeypair = Keypair.fromSecret(resolverSecret);
  const organizerKeypair = Keypair.fromSecret(organizerSecret);

  const buyerClient = new VeriTixClient(getTestnetConfig(contractId), buyerKeypair);
  const resolverClient = new VeriTixClient(getTestnetConfig(contractId), resolverKeypair);

  let escrowId: bigint;
  let disputeId: bigint;

  // Increase timeout for live network calls
  jest.setTimeout(120_000);

  beforeAll(async () => {
    await buyerClient.connect();
    await resolverClient.connect();
  });

  // ---------------------------------------------------------------------------
  // Step 1: Create escrow (buyer → organizer)
  // ---------------------------------------------------------------------------

  it("step 1: buyer creates an escrow for the organizer", async () => {
    const latestLedger = await buyerClient["server"].getLatestLedger();
    const expiryLedger = latestLedger.sequence + 10_000;

    escrowId = await buyerClient.escrow.createTicketEscrow({
      organizer: organizerKeypair.publicKey(),
      ticketPrice: 1_000_000n,
      eventLedger: latestLedger.sequence + 5_000,
      ticketRef: `dispute-test-${Date.now()}`,
      bufferLedgers: 5_000,
    });

    expect(typeof escrowId).toBe("bigint");
    expect(escrowId).toBeGreaterThan(0n);
  });

  // ---------------------------------------------------------------------------
  // Step 2: Open dispute
  // ---------------------------------------------------------------------------

  it("step 2: buyer opens a dispute on the escrow with resolver", async () => {
    const result = await buyerClient.dispute.openDispute(
      escrowId,
      resolverKeypair.publicKey(),
      "ticket not delivered as promised",
    );

    expect(result.successful).toBe(true);
    expect(result.hash).toBeTruthy();

    const dispute = await buyerClient.dispute.getDispute(escrowId);
    expect(dispute).not.toBeNull();

    disputeId = dispute!.id;
  });

  // ---------------------------------------------------------------------------
  // Step 3: Confirm dispute is open
  // ---------------------------------------------------------------------------

  it("step 3: isDisputeOpen returns true for the disputed escrow", async () => {
    const isOpen = await buyerClient.dispute.isDisputeOpen(escrowId);
    expect(isOpen).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Step 4: Resolver resolves in favour of depositor (refund to buyer)
  // ---------------------------------------------------------------------------

  it("step 4: resolver resolves the dispute in favour of the depositor (buyer)", async () => {
    const result = await resolverClient.dispute.resolveDispute(
      disputeId,
      false,
      "Evidence reviewed — ticket was not delivered",
    );

    expect(result.successful).toBe(true);
    expect(result.hash).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Step 5: Confirm buyer received funds (escrow settled)
  // ---------------------------------------------------------------------------

  it("step 5: escrow is settled after dispute resolution", async () => {
    const settled = await buyerClient.escrow.isSettled(escrowId);
    expect(settled).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Step 6: Confirm dispute status is resolved
  // ---------------------------------------------------------------------------

  it("step 6: dispute status reflects the resolution ruling", async () => {
    const dispute = await buyerClient.dispute.getDispute(disputeId);
    expect(dispute).not.toBeNull();
    expect(dispute!.status).toBe(DisputeStatus.ResolvedForDepositor);
  });
});
